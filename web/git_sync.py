"""Sync cv.yaml to GitHub as a draft PR (Contents + Pulls API)."""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("web.git_sync")

GITHUB_API_BASE = os.environ.get("GITHUB_API_BASE", "https://api.github.com").rstrip("/")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GITHUB_REPO = os.environ.get("GITHUB_REPO", "SolarnodeCC/cv-repository").strip()
GITHUB_BASE_BRANCH = os.environ.get("GITHUB_BASE_BRANCH", "main").strip()

_BRANCH_SAFE = re.compile(r"[^a-z0-9._/-]+")
_configured_cache: tuple[float, bool] | None = None


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "solarnode-cv-editor",
        "Content-Type": "application/json",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


def _request(method: str, path: str, payload: dict | None = None) -> tuple[int, Any]:
    url = f"{GITHUB_API_BASE}{path}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            body = json.loads(raw.decode("utf-8")) if raw else {}
            return resp.status, body
    except urllib.error.HTTPError as exc:
        raw = exc.read() if exc.fp else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {"message": exc.reason}
        except json.JSONDecodeError:
            body = {"message": raw.decode("utf-8", errors="replace") or exc.reason}
        return exc.code, body
    except urllib.error.URLError as exc:
        logger.warning("GitHub %s %s network error: %s", method, path, exc)
        return 599, {"message": str(exc.reason if hasattr(exc, "reason") else exc)}


def git_sync_configured() -> bool:
    """True when GitHub API is reachable with auth (token or working Worker proxy)."""
    global _configured_cache

    now = time.monotonic()
    if _configured_cache and now - _configured_cache[0] < 60:
        return _configured_cache[1]

    if GITHUB_API_BASE.startswith("http://github.api"):
        status, body = _request("GET", f"/repos/{GITHUB_REPO}")
        msg = str(body.get("message", "")) if isinstance(body, dict) else ""
        ok = status < 500 and "GITHUB_TOKEN" not in msg
    else:
        ok = bool(GITHUB_TOKEN)

    _configured_cache = (now, ok)
    return ok


def _branch_name() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"editor/cv-sync-{stamp}"


def sync_cv_yaml_to_github(
    content: str,
    *,
    commit_message: str | None = None,
    draft: bool = True,
) -> dict[str, Any]:
    """Create a branch from base, commit cv.yaml, open a (draft) PR.

    Returns a result dict with ok/message/pr_url/branch. Raises ValueError on
    configuration errors; returns ok=False for API failures.
    """
    if not content.strip():
        raise ValueError("Lege cv.yaml")
    if not content.endswith("\n"):
        content = content + "\n"
    if not git_sync_configured():
        return {
            "ok": False,
            "message": "Git sync niet geconfigureerd (GITHUB_TOKEN of github.api proxy)",
            "branch": None,
            "pr_url": None,
        }

    repo = GITHUB_REPO
    base = GITHUB_BASE_BRANCH
    branch = _BRANCH_SAFE.sub("-", _branch_name()).strip("-")
    message = commit_message or "Sync cv.yaml from Solarnode CV editor"

    # 1) Resolve base SHA
    status, ref = _request("GET", f"/repos/{repo}/git/ref/heads/{base}")
    if status >= 400:
        return {
            "ok": False,
            "message": f"Kan base-branch '{base}' niet lezen",
            "detail": json.dumps(ref)[:2000],
            "branch": None,
            "pr_url": None,
        }
    base_sha = ref.get("object", {}).get("sha")
    if not base_sha:
        return {"ok": False, "message": "Geen SHA op base-branch", "branch": None, "pr_url": None}

    # 2) Create branch
    status, created = _request(
        "POST",
        f"/repos/{repo}/git/refs",
        {"ref": f"refs/heads/{branch}", "sha": base_sha},
    )
    if status >= 400:
        return {
            "ok": False,
            "message": f"Branch aanmaken mislukt ({status})",
            "detail": json.dumps(created)[:2000],
            "branch": branch,
            "pr_url": None,
        }

    # 3) Existing file SHA on base (for update)
    status, existing = _request("GET", f"/repos/{repo}/contents/cv.yaml?ref={base}")
    file_sha = existing.get("sha") if status == 200 else None

    put_body: dict[str, Any] = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if file_sha:
        put_body["sha"] = file_sha

    status, put_result = _request("PUT", f"/repos/{repo}/contents/cv.yaml", put_body)
    if status >= 400:
        return {
            "ok": False,
            "message": f"Commit cv.yaml mislukt ({status})",
            "detail": json.dumps(put_result)[:2000],
            "branch": branch,
            "pr_url": None,
        }

    # 4) Draft PR
    status, pr = _request(
        "POST",
        f"/repos/{repo}/pulls",
        {
            "title": message,
            "head": branch,
            "base": base,
            "body": (
                "## Sync from CV editor\n\n"
                "Live `cv.yaml` from the private editor → Git for version control.\n\n"
                "Happy path: edit → **Render** (R2) → **Sync Git** → review/merge → "
                "optional **Promote from main** (`R2_SEED_FORCE=1`) if Git must overwrite R2.\n"
            ),
            "draft": draft,
        },
    )
    if status >= 400:
        return {
            "ok": False,
            "message": f"Branch `{branch}` gecommit maar PR mislukt ({status})",
            "detail": json.dumps(pr)[:2000],
            "branch": branch,
            "pr_url": None,
        }

    pr_url = pr.get("html_url")
    return {
        "ok": True,
        "message": f"Draft PR geopend: {pr_url}" if pr_url else f"Branch `{branch}` gepusht",
        "branch": branch,
        "pr_url": pr_url,
        "detail": None,
    }
