"""FastAPI app: YAML editor + RenderCV preview for this repository."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from web.ai_assistant import ai_configured, apply_proposal, chat as ai_chat
from web.checklist import evaluate_application_readiness
from web.git_sync import git_sync_configured, sync_cv_yaml_to_github
from web.import_cv import document_to_yaml, merge_import, parse_import_payload
from web.r2_store import hydrate_from_r2, last_publish_error, publish_workspace
from web.schema_meta import schema_meta

logger = logging.getLogger("web.app")

REPO_ROOT = Path(__file__).resolve().parent.parent
CV_PATH = REPO_ROOT / "cv.yaml"
BUFFER_PATH = REPO_ROOT / ".cv.web-buffer.yaml"
OUTPUT_DIR = REPO_ROOT / "output"
STATIC_DIR = Path(__file__).resolve().parent / "static"

MAX_CV_BYTES = int(os.environ.get("MAX_CV_BYTES", str(512 * 1024)))
RENDER_TIMEOUT_SEC = float(os.environ.get("RENDER_TIMEOUT_SEC", "120"))

_render_lock = asyncio.Lock()
_hydrated = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _hydrated
    try:
        result = await hydrate_from_r2(cv_path=CV_PATH, output_dir=OUTPUT_DIR)
        _hydrated = True
        logger.info("R2 hydrate on boot: %s", result)
    except Exception:
        logger.exception("R2 hydrate on boot failed")
        _hydrated = False
    yield


app = FastAPI(title="Solarnode CV Editor", version="0.6.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class CvPayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=MAX_CV_BYTES, description="Full cv.yaml text")


class StatusResponse(BaseModel):
    ok: bool
    message: str
    detail: str | None = None


class ImportPayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=MAX_CV_BYTES)
    format: str = Field("auto", description="auto | yaml | json-resume")
    mode: str = Field("replace", description="replace | keep_design")
    existing: str | None = Field(None, description="Optional current YAML for keep_design merge")


class AiChatPayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    content: str = Field(..., min_length=1, max_length=MAX_CV_BYTES, description="Current cv.yaml")
    job_description: str | None = Field(None, max_length=20000)
    history: list[dict[str, str]] | None = None


class AiApplyPayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=MAX_CV_BYTES)
    proposal: dict


def _resolve_rendercv() -> str:
    found = shutil.which("rendercv")
    if found:
        return found
    local = Path.home() / ".local" / "bin" / "rendercv"
    if local.is_file():
        return str(local)
    raise HTTPException(status_code=500, detail="rendercv CLI not found on PATH")


def _parse_yaml(content: str) -> None:
    if len(content.encode("utf-8")) > MAX_CV_BYTES:
        raise HTTPException(status_code=413, detail=f"cv.yaml te groot (max {MAX_CV_BYTES} bytes)")
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Ongeldige YAML: {exc}") from exc
    if not isinstance(data, dict) or "cv" not in data:
        raise HTTPException(status_code=400, detail="YAML moet een top-level 'cv' veld bevatten")


async def _run_rendercv(args: list[str], *, cwd: Path = REPO_ROOT) -> tuple[int, str]:
    binary = _resolve_rendercv()
    env = os.environ.copy()
    local_bin = str(Path.home() / ".local" / "bin")
    env["PATH"] = f"{local_bin}:{env.get('PATH', '')}"
    proc = await asyncio.create_subprocess_exec(
        binary,
        *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )
    try:
        out_bytes, _ = await asyncio.wait_for(proc.communicate(), timeout=RENDER_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return 124, f"Render timed out after {RENDER_TIMEOUT_SEC:.0f}s"
    text = out_bytes.decode("utf-8", errors="replace")
    return proc.returncode or 0, text


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    index_path = STATIC_DIR / "index.html"
    return HTMLResponse(index_path.read_text(encoding="utf-8"))


class SyncGitPayload(BaseModel):
    content: str | None = Field(None, description="Optional buffer; defaults to saved cv.yaml")
    message: str | None = Field(None, max_length=200, description="Commit / PR title")
    draft: bool = True


@app.get("/api/health")
async def health() -> dict:
    rendercv = shutil.which("rendercv") or str(Path.home() / ".local" / "bin" / "rendercv")
    return {
        "ok": True,
        "cv_exists": CV_PATH.is_file(),
        "output_exists": OUTPUT_DIR.is_dir(),
        "rendercv": rendercv if Path(rendercv).is_file() else None,
        "r2_sync": os.environ.get("R2_SYNC", "0") not in {"0", "false", "False"},
        "r2_hydrated": _hydrated,
        "r2_last_publish_error": last_publish_error(),
        "git_sync": git_sync_configured(),
        "ai_configured": ai_configured(),
        "render_busy": _render_lock.locked(),
    }


@app.get("/api/schema-meta")
async def get_schema_meta() -> dict:
    """Enums and defaults for the form editor panels."""
    return schema_meta()


@app.post("/api/import")
async def import_cv(payload: ImportPayload) -> dict:
    """Import RenderCV YAML or JSON Resume into a document (+ YAML text)."""
    try:
        imported = parse_import_payload(payload.content, format_hint=payload.format)
        existing_doc = None
        if payload.existing and payload.mode == "keep_design":
            existing_doc = yaml.safe_load(payload.existing)
            if not isinstance(existing_doc, dict):
                existing_doc = None
        merged = merge_import(existing_doc, imported, mode=payload.mode)
        if "cv" not in merged:
            raise ValueError("Import resultaat mist 'cv'")
        text = document_to_yaml(merged)
        _parse_yaml(text)
        return {
            "ok": True,
            "message": "Import geslaagd",
            "document": merged,
            "content": text,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Ongeldige YAML: {exc}") from exc


@app.post("/api/ai/chat")
async def ai_chat_endpoint(payload: AiChatPayload) -> dict:
    """Propose CV edits via an OpenAI-compatible provider (env-configured)."""
    _parse_yaml(payload.content)
    result = await asyncio.to_thread(
        ai_chat,
        message=payload.message,
        yaml_content=payload.content,
        job_description=payload.job_description,
        history=payload.history,
    )
    return result


@app.post("/api/ai/apply")
async def ai_apply_endpoint(payload: AiApplyPayload) -> dict:
    """Apply one AI proposal to the current YAML buffer."""
    _parse_yaml(payload.content)
    try:
        text = apply_proposal(payload.content, payload.proposal)
        _parse_yaml(text)
        return {"ok": True, "message": "Voorstel toegepast", "content": text}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Ongeldige YAML na apply: {exc}") from exc


@app.get("/api/wake")
async def wake() -> dict:
    """Local stand-in for Worker /api/wake (cold-start probe)."""
    health_body = await health()
    return {"ok": True, "wake_ms": 0, "coldish": False, "health": health_body}


@app.get("/api/cv")
async def get_cv() -> dict:
    if not CV_PATH.is_file():
        raise HTTPException(status_code=404, detail="cv.yaml niet gevonden")
    return {
        "path": "cv.yaml",
        "content": CV_PATH.read_text(encoding="utf-8"),
    }


@app.post("/api/hydrate", response_model=StatusResponse)
async def hydrate_cv() -> StatusResponse:
    """Explicit reload from R2 (does not run on every GET /api/cv)."""
    global _hydrated
    result = await hydrate_from_r2(cv_path=CV_PATH, output_dir=OUTPUT_DIR)
    _hydrated = True
    parts = []
    if result["cv"]:
        parts.append("cv.yaml")
    parts.extend(result["artifacts"])
    if not parts:
        return StatusResponse(ok=True, message="Geen R2-data gevonden (lokale bestanden ongewijzigd)")
    return StatusResponse(ok=True, message=f"Hernieuwbaar uit R2: {', '.join(parts)}")


@app.put("/api/cv", response_model=StatusResponse)
async def put_cv(payload: CvPayload) -> StatusResponse:
    """Save YAML only. Does not publish PDF/HTML/PNG — use Render for that."""
    _parse_yaml(payload.content)
    text = payload.content if payload.content.endswith("\n") else payload.content + "\n"
    CV_PATH.write_text(text, encoding="utf-8")
    published = await publish_workspace(
        cv_path=CV_PATH, output_dir=OUTPUT_DIR, artifacts=False
    )
    if published:
        return StatusResponse(
            ok=True,
            message="cv.yaml opgeslagen (R2: yaml). Publieke PDF vernieuwt pas na Render.",
        )
    return StatusResponse(ok=True, message="cv.yaml opgeslagen (lokaal)")


def _write_buffer(content: str) -> Path:
    """Write editor buffer next to solarnode/ so the custom theme resolves."""
    _parse_yaml(content)
    text = content if content.endswith("\n") else content + "\n"
    BUFFER_PATH.write_text(text, encoding="utf-8")
    return BUFFER_PATH


@app.post("/api/validate", response_model=StatusResponse)
async def validate_cv(payload: CvPayload | None = None) -> StatusResponse:
    """Validate YAML (optionally from editor buffer) with a dry-run render."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="rendercv-validate-"))
    try:
        async with _render_lock:
            cv_file = _write_buffer(payload.content) if payload is not None else CV_PATH
            code, log = await _run_rendercv(
                [
                    "render",
                    str(cv_file),
                    "--dont-generate-html",
                    "--dont-generate-markdown",
                    "--dont-generate-png",
                    "--output-folder",
                    str(tmp_dir / "out"),
                ]
            )
        if code != 0:
            return StatusResponse(ok=False, message="Validatie mislukt", detail=log[-4000:])
        return StatusResponse(ok=True, message="cv.yaml is geldig")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        if BUFFER_PATH.is_file() and payload is not None:
            BUFFER_PATH.unlink(missing_ok=True)


@app.post("/api/render", response_model=StatusResponse)
async def render_cv(payload: CvPayload | None = None) -> StatusResponse:
    """Save optional buffer, then render into output/ and publish to R2."""
    if _render_lock.locked():
        raise HTTPException(status_code=409, detail="Er draait al een render — even wachten")

    async with _render_lock:
        if payload is not None:
            _parse_yaml(payload.content)
            CV_PATH.write_text(
                payload.content if payload.content.endswith("\n") else payload.content + "\n",
                encoding="utf-8",
            )

        code, log = await _run_rendercv(["render", str(CV_PATH)])
        if code != 0:
            return StatusResponse(ok=False, message="Render mislukt", detail=log[-4000:])

        pdf = OUTPUT_DIR / "CV.pdf"
        if not pdf.is_file():
            return StatusResponse(ok=False, message="Render klaar maar CV.pdf ontbreekt", detail=log[-4000:])

        published = await publish_workspace(cv_path=CV_PATH, output_dir=OUTPUT_DIR)
        pub = f" · R2 {len(published)} files" if published else ""
        return StatusResponse(
            ok=True,
            message=f"Render voltooid → output/CV.pdf{pub}",
            detail=log[-2000:] or None,
        )


@app.post("/api/publish", response_model=StatusResponse)
async def publish_cv() -> StatusResponse:
    published = await publish_workspace(cv_path=CV_PATH, output_dir=OUTPUT_DIR)
    err = last_publish_error()
    if not published:
        return StatusResponse(
            ok=False,
            message="Niets gepubliceerd naar R2 (sync uit, leeg, of fout)",
            detail=err,
        )
    msg = f"Gepubliceerd naar R2: {', '.join(published)}"
    if err:
        return StatusResponse(ok=False, message=f"{msg} (deels mislukt)", detail=err)
    return StatusResponse(ok=True, message=msg)


@app.post("/api/sync-git")
async def sync_git(payload: SyncGitPayload | None = None) -> dict:
    """Push current cv.yaml to GitHub as a draft PR (version-control sync)."""
    raw = None
    if payload and payload.content is not None:
        raw = payload.content
    elif CV_PATH.is_file():
        raw = CV_PATH.read_text(encoding="utf-8")
    if not raw or not raw.strip():
        raise HTTPException(status_code=400, detail="Geen cv.yaml om te syncen")
    _parse_yaml(raw)
    # Persist buffer before sync so disk matches PR content.
    text = raw if raw.endswith("\n") else raw + "\n"
    CV_PATH.write_text(text, encoding="utf-8")
    await publish_workspace(cv_path=CV_PATH, output_dir=OUTPUT_DIR, artifacts=False)

    result = await asyncio.to_thread(
        sync_cv_yaml_to_github,
        text,
        commit_message=(payload.message if payload else None),
        draft=True if payload is None else payload.draft,
    )
    if not result.get("ok"):
        msg = result.get("message") or "Git sync mislukt"
        code = 503 if "niet geconfigureerd" in msg else 502
        raise HTTPException(status_code=code, detail=msg)
    return result


@app.post("/api/checklist")
async def checklist(payload: CvPayload | None = None) -> dict:
    """Sollicitatie-checklist op YAML-inhoud (geen ATS-PDF-engine)."""
    content = payload.content if payload is not None else (
        CV_PATH.read_text(encoding="utf-8") if CV_PATH.is_file() else ""
    )
    if not content.strip():
        raise HTTPException(status_code=400, detail="Geen YAML om te beoordelen")
    _parse_yaml(content)
    return evaluate_application_readiness(content)


@app.get("/api/preview/status")
async def preview_status() -> dict:
    pngs = sorted(OUTPUT_DIR.glob("CV_*.png"))
    return {
        "pdf": (OUTPUT_DIR / "CV.pdf").is_file(),
        "html": (OUTPUT_DIR / "CV.html").is_file(),
        "png": bool(pngs) or (OUTPUT_DIR / "CV.png").is_file(),
    }


@app.get("/api/preview/pdf")
async def preview_pdf() -> FileResponse:
    path = OUTPUT_DIR / "CV.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Nog geen PDF — klik eerst op Render")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename="CV.pdf",
        content_disposition_type="inline",
    )


@app.get("/api/download/pdf")
async def download_pdf() -> FileResponse:
    path = OUTPUT_DIR / "CV.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Nog geen PDF — klik eerst op Render")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename="CV.pdf",
        content_disposition_type="attachment",
    )


@app.get("/api/preview/png")
async def preview_png() -> FileResponse:
    candidates = sorted(OUTPUT_DIR.glob("CV_*.png")) + (
        [OUTPUT_DIR / "CV.png"] if (OUTPUT_DIR / "CV.png").is_file() else []
    )
    for path in candidates:
        if path.is_file():
            return FileResponse(path, media_type="image/png", filename=path.name)
    raise HTTPException(status_code=404, detail="Nog geen PNG-preview — klik eerst op Render")


@app.get("/api/preview/html")
async def preview_html() -> FileResponse:
    path = OUTPUT_DIR / "CV.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Nog geen HTML — klik eerst op Render")
    return FileResponse(path, media_type="text/html", filename="CV.html")
