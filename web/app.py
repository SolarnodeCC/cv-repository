"""FastAPI app: YAML editor + RenderCV preview for this repository."""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parent.parent
CV_PATH = REPO_ROOT / "cv.yaml"
BUFFER_PATH = REPO_ROOT / ".cv.web-buffer.yaml"
OUTPUT_DIR = REPO_ROOT / "output"
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Solarnode CV Editor", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class CvPayload(BaseModel):
    content: str = Field(..., min_length=1, description="Full cv.yaml text")


class StatusResponse(BaseModel):
    ok: bool
    message: str
    detail: str | None = None


def _resolve_rendercv() -> str:
    found = shutil.which("rendercv")
    if found:
        return found
    local = Path.home() / ".local" / "bin" / "rendercv"
    if local.is_file():
        return str(local)
    raise HTTPException(status_code=500, detail="rendercv CLI not found on PATH")


def _parse_yaml(content: str) -> None:
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
    out_bytes, _ = await proc.communicate()
    text = out_bytes.decode("utf-8", errors="replace")
    return proc.returncode or 0, text


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    index_path = STATIC_DIR / "index.html"
    return HTMLResponse(index_path.read_text(encoding="utf-8"))


@app.get("/api/health")
async def health() -> dict:
    rendercv = shutil.which("rendercv") or str(Path.home() / ".local" / "bin" / "rendercv")
    return {
        "ok": True,
        "cv_exists": CV_PATH.is_file(),
        "output_exists": OUTPUT_DIR.is_dir(),
        "rendercv": rendercv if Path(rendercv).is_file() else None,
    }


@app.get("/api/cv")
async def get_cv() -> dict:
    if not CV_PATH.is_file():
        raise HTTPException(status_code=404, detail="cv.yaml niet gevonden")
    return {
        "path": "cv.yaml",
        "content": CV_PATH.read_text(encoding="utf-8"),
    }


@app.put("/api/cv", response_model=StatusResponse)
async def put_cv(payload: CvPayload) -> StatusResponse:
    _parse_yaml(payload.content)
    CV_PATH.write_text(payload.content if payload.content.endswith("\n") else payload.content + "\n", encoding="utf-8")
    return StatusResponse(ok=True, message="cv.yaml opgeslagen")


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
    """Save optional buffer, then render into output/."""
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

    return StatusResponse(ok=True, message="Render voltooid → output/CV.pdf", detail=log[-2000:] or None)


@app.get("/api/preview/pdf")
async def preview_pdf() -> FileResponse:
    path = OUTPUT_DIR / "CV.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Nog geen PDF — klik eerst op Render")
    return FileResponse(path, media_type="application/pdf", filename="CV.pdf")


@app.get("/api/preview/png")
async def preview_png() -> FileResponse:
    # Prefer first page preview; fall back to CV.png if present.
    candidates = sorted(OUTPUT_DIR.glob("CV_*.png")) + ([OUTPUT_DIR / "CV.png"] if (OUTPUT_DIR / "CV.png").is_file() else [])
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
