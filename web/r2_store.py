"""R2 persistence via Cloudflare Containers outbound host `cv.r2`."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from pathlib import Path

logger = logging.getLogger("web.r2")

R2_BASE = os.environ.get("R2_HTTP_BASE", "http://cv.r2").rstrip("/")
# Off by default (local `make web`); Container sets R2_SYNC=1.
R2_ENABLED = os.environ.get("R2_SYNC", "0") not in {"0", "false", "False"}

_ALLOWLIST_PATH = Path(__file__).resolve().parent.parent / "shared" / "r2-allowlist.json"

# Last publish failure (for /api/health observability).
_last_publish_error: str | None = None
# Optimistic concurrency: key -> etag from last successful GET/PUT.
_etags: dict[str, str] = {}


def _load_allowlist() -> tuple[frozenset[str], dict[str, str]]:
    data = json.loads(_ALLOWLIST_PATH.read_text(encoding="utf-8"))
    keys = frozenset(data["keys"])
    content_types = {str(k): str(v) for k, v in data["content_types"].items()}
    if set(content_types) != set(keys):
        raise RuntimeError("shared/r2-allowlist.json: keys and content_types must match")
    return keys, content_types


ALLOWED_KEYS, CONTENT_TYPES = _load_allowlist()


def last_publish_error() -> str | None:
    return _last_publish_error


def _set_publish_error(message: str | None) -> None:
    global _last_publish_error
    _last_publish_error = message


def _request(
    method: str,
    key: str,
    data: bytes | None = None,
    content_type: str | None = None,
    *,
    if_match: str | None = None,
) -> tuple[int, bytes, str | None]:
    if key not in ALLOWED_KEYS:
        raise ValueError(f"R2 key not allowed: {key}")
    url = f"{R2_BASE}/{key.lstrip('/')}"
    headers: dict[str, str] = {}
    if content_type:
        headers["Content-Type"] = content_type
    if if_match:
        headers["If-Match"] = if_match
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            etag = resp.headers.get("etag")
            return resp.status, resp.read(), etag
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp else b""
        etag = exc.headers.get("etag") if exc.headers else None
        return exc.code, body, etag
    except urllib.error.URLError as exc:
        logger.warning("R2 %s %s network error: %s", method, key, exc)
        return 599, b"", None


async def r2_get(key: str) -> bytes | None:
    if not R2_ENABLED:
        return None
    status, body, etag = await asyncio.to_thread(_request, "GET", key)
    if status == 404:
        _etags.pop(key, None)
        return None
    if status >= 400:
        logger.warning("R2 GET %s failed: HTTP %s", key, status)
        return None
    if etag:
        _etags[key] = etag
    return body


async def r2_put(key: str, data: bytes, content_type: str | None = None) -> bool:
    if not R2_ENABLED:
        return False
    ctype = content_type or CONTENT_TYPES.get(key, "application/octet-stream")
    if_match = _etags.get(key)
    status, _, etag = await asyncio.to_thread(
        _request, "PUT", key, data, ctype, if_match=if_match
    )
    if status == 412:
        msg = f"R2 PUT {key} conflict (etag mismatch) — herlaad via R2 sync en probeer opnieuw"
        logger.warning(msg)
        _set_publish_error(msg)
        return False
    if status >= 400:
        msg = f"R2 PUT {key} failed: HTTP {status}"
        logger.warning(msg)
        _set_publish_error(msg)
        return False
    if etag:
        _etags[key] = etag
    elif if_match:
        # Keep prior etag if server omitted a new one; otherwise clear so next put is unconditional.
        pass
    else:
        _etags.pop(key, None)
    return True


async def hydrate_from_r2(*, cv_path: Path, output_dir: Path) -> dict:
    """Pull cv.yaml + rendered artifacts from R2 into the local workspace."""
    result: dict = {"cv": False, "artifacts": []}
    if not R2_ENABLED:
        return result

    cv_bytes = await r2_get("cv.yaml")
    if cv_bytes:
        cv_path.write_bytes(cv_bytes)
        result["cv"] = True

    output_dir.mkdir(parents=True, exist_ok=True)
    for key in (
        "output/CV.pdf",
        "output/CV.html",
        "output/CV.md",
        "output/CV.png",
        "output/CV_1.png",
    ):
        payload = await r2_get(key)
        if not payload:
            continue
        dest = (cv_path.parent / key).resolve()
        if not str(dest).startswith(str(cv_path.parent.resolve())):
            logger.error("Refusing to write outside repo root: %s", dest)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(payload)
        result["artifacts"].append(key)

    return result


async def publish_workspace(
    *,
    cv_path: Path,
    output_dir: Path,
    artifacts: bool = True,
) -> list[str]:
    """Push local cv.yaml (and optionally rendered artifacts) to R2.

    Save-only flows should pass ``artifacts=False`` so a stale PDF is never
    published as if it matched the new YAML. Render/publish pass ``artifacts=True``.
    """
    published: list[str] = []
    if not R2_ENABLED:
        return published

    failed = False
    if cv_path.is_file():
        if await r2_put("cv.yaml", cv_path.read_bytes()):
            published.append("cv.yaml")
        else:
            failed = True

    if not artifacts:
        if not failed and published:
            _set_publish_error(None)
        return published

    mapping: list[tuple[Path, str]] = [
        (output_dir / "CV.pdf", "output/CV.pdf"),
        (output_dir / "CV.html", "output/CV.html"),
        (output_dir / "CV.md", "output/CV.md"),
    ]
    png = output_dir / "CV.png"
    png1 = output_dir / "CV_1.png"
    if png.is_file():
        mapping.append((png, "output/CV.png"))
    elif png1.is_file():
        mapping.append((png1, "output/CV.png"))
    if png1.is_file():
        mapping.append((png1, "output/CV_1.png"))

    for path, key in mapping:
        if not path.is_file():
            continue
        if await r2_put(key, path.read_bytes()):
            published.append(key)
        else:
            failed = True

    if not failed:
        _set_publish_error(None)
    return published
