"""API integration tests for the Solarnode CV editor (FastAPI)."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parent.parent
CV_PATH = REPO_ROOT / "cv.yaml"


@pytest.fixture
def client(monkeypatch):
    async def fake_hydrate(**_kwargs):
        return {"cv": False, "artifacts": []}

    async def fake_publish(**_kwargs):
        return []

    monkeypatch.setattr("web.app.hydrate_from_r2", fake_hydrate)
    monkeypatch.setattr("web.app.publish_workspace", fake_publish)
    monkeypatch.setattr("web.app._hydrated", False, raising=False)

    from web.app import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def remco_yaml() -> str:
    return CV_PATH.read_text(encoding="utf-8")


def test_health(client: TestClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["cv_exists"] is True


def test_wake(client: TestClient):
    res = client.get("/api/wake")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert "health" in body


def test_index_html(client: TestClient):
    res = client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "Solarnode" in res.text or "CV" in res.text


def test_schema_meta(client: TestClient):
    res = client.get("/api/schema-meta")
    assert res.status_code == 200
    meta = res.json()
    assert "solarnode" in meta.get("themes", meta.get("THEMES", [])) or "themes" in meta or "design" in meta
    # Accept either nested or flat schema_meta shapes
    blob = yaml.safe_dump(meta).lower()
    assert "solarnode" in blob
    assert "linkedin" in blob or "github" in blob


def test_get_cv_returns_remco(client: TestClient):
    res = client.get("/api/cv")
    assert res.status_code == 200
    body = res.json()
    assert "Remco Oostelaar" in body["content"]
    assert body["path"] == "cv.yaml"


def test_put_cv_rejects_invalid_yaml(client: TestClient):
    res = client.put("/api/cv", json={"content": "not: [valid"})
    assert res.status_code == 400


def test_put_cv_rejects_missing_cv_root(client: TestClient):
    res = client.put("/api/cv", json={"content": "design:\n  theme: solarnode\n"})
    assert res.status_code == 400
    assert "cv" in res.json()["detail"].lower()


def test_put_cv_saves_valid(client: TestClient, remco_yaml: str, tmp_path: Path, monkeypatch):
    from web import app as app_mod

    target = tmp_path / "cv.yaml"
    target.write_text(remco_yaml, encoding="utf-8")
    monkeypatch.setattr(app_mod, "CV_PATH", target)

    tweaked = remco_yaml.replace("pdf_title: CV Remco Oostelaar", "pdf_title: CV Remco Test")
    res = client.put("/api/cv", json={"content": tweaked})
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert "CV Remco Test" in target.read_text(encoding="utf-8")


def test_checklist_endpoint_remco(client: TestClient, remco_yaml: str):
    res = client.post("/api/checklist", json={"content": remco_yaml})
    assert res.status_code == 200
    body = res.json()
    assert body["errors"] == 0
    assert body["ready"] is True
    assert body["score"] >= 80


def test_checklist_endpoint_default_file(client: TestClient):
    res = client.post("/api/checklist")
    assert res.status_code == 200
    assert res.json()["ready"] is True


def test_validate_endpoint_remco(client: TestClient, remco_yaml: str):
    res = client.post("/api/validate", json={"content": remco_yaml})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True, body.get("detail")


def test_validate_endpoint_invalid(client: TestClient):
    bad = """
cv:
  name: Test
  email: not-an-email
  sections:
    Profiel:
      - short
design:
  theme: this-theme-does-not-exist-xyz
"""
    res = client.post("/api/validate", json={"content": bad})
    assert res.status_code == 200
    # Invalid theme should fail RenderCV dry-run
    assert res.json()["ok"] is False


def test_preview_status(client: TestClient):
    res = client.get("/api/preview/status")
    assert res.status_code == 200
    body = res.json()
    assert set(body) >= {"pdf", "html", "png"}


def test_import_json_resume(client: TestClient):
    payload = {
        "content": """{
          "basics": {"name": "Ada", "email": "ada@example.com", "summary": "Pioneer of computing and algorithms."},
          "work": [{"name": "Engine Co", "position": "Engineer", "startDate": "2020-01", "highlights": ["Built machines"]}],
          "skills": [{"name": "Lang", "keywords": ["Python"]}]
        }""",
        "format": "json-resume",
        "mode": "replace",
    }
    res = client.post("/api/import", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["document"]["cv"]["name"] == "Ada"
    assert "cv:" in body["content"]


def test_import_keep_design(client: TestClient, remco_yaml: str):
    imported = """
cv:
  name: Imported Person
  email: imported@example.com
  sections:
    Profiel:
      - Imported profile text that is long enough for a meaningful summary sentence here.
"""
    res = client.post(
        "/api/import",
        json={
            "content": imported,
            "format": "yaml",
            "mode": "keep_design",
            "existing": remco_yaml,
        },
    )
    assert res.status_code == 200
    doc = res.json()["document"]
    assert doc["cv"]["name"] == "Imported Person"
    assert doc["design"]["theme"] == "solarnode"


def test_ai_apply_endpoint(client: TestClient, remco_yaml: str):
    tweaked = remco_yaml.replace("15+ years", "20+ years")
    res = client.post(
        "/api/ai/apply",
        json={"content": remco_yaml, "proposal": {"full_yaml": tweaked}},
    )
    assert res.status_code == 200
    assert "20+ years" in res.json()["content"]


def test_ai_apply_rejects_bad_proposal(client: TestClient, remco_yaml: str):
    res = client.post(
        "/api/ai/apply",
        json={"content": remco_yaml, "proposal": {"path": "cv"}},
    )
    assert res.status_code == 400


def test_ai_chat_unconfigured(client: TestClient, remco_yaml: str, monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.setattr("web.ai_assistant.ai_configured", lambda: False)
    monkeypatch.setattr("web.app.ai_configured", lambda: False)
    res = client.post(
        "/api/ai/chat",
        json={"message": "Improve profile", "content": remco_yaml},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert body["configured"] is False


def test_sync_git_unconfigured(client: TestClient, remco_yaml: str, monkeypatch):
    monkeypatch.setattr("web.git_sync.GITHUB_TOKEN", "")
    monkeypatch.setattr(
        "web.git_sync.GITHUB_API_BASE",
        "https://api.github.com",
    )

    def fake_sync(*_a, **_k):
        return {"ok": False, "message": "Git sync niet geconfigureerd (GITHUB_TOKEN of github.api proxy)"}

    monkeypatch.setattr("web.app.sync_cv_yaml_to_github", fake_sync)
    res = client.post("/api/sync-git", json={"content": remco_yaml, "message": "test"})
    assert res.status_code == 503


def test_publish_without_r2(client: TestClient, monkeypatch):
    async def fake_publish(**_kwargs):
        return []

    monkeypatch.setattr("web.app.publish_workspace", fake_publish)
    monkeypatch.setattr("web.app.last_publish_error", lambda: None)
    res = client.post("/api/publish")
    assert res.status_code == 200
    assert res.json()["ok"] is False
