"""Fixture tests against the real Remco Oostelaar cv.yaml."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from web.checklist import evaluate_application_readiness

REPO_ROOT = Path(__file__).resolve().parent.parent
CV_PATH = REPO_ROOT / "cv.yaml"

REQUIRED_TOP_LEVEL = {"cv", "design", "locale", "settings"}
REQUIRED_SECTIONS = {
    "Profiel",
    "Werkervaring",
    "Vaardigheden",
    "Talen",
}
EXPECTED_COMPANIES = {
    "Capgemini",
    "CMA CGM",
    "EnergyAustralia",
    "Lendlease",
}


@pytest.fixture(scope="module")
def cv_text() -> str:
    assert CV_PATH.is_file(), f"Missing {CV_PATH}"
    return CV_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def cv_doc(cv_text: str) -> dict:
    data = yaml.safe_load(cv_text)
    assert isinstance(data, dict)
    return data


def test_cv_yaml_parses(cv_doc: dict):
    assert "cv" in cv_doc


def test_cv_top_level_keys(cv_doc: dict):
    missing = REQUIRED_TOP_LEVEL - set(cv_doc)
    assert not missing, f"Missing top-level keys: {missing}"


def test_identity_is_remco(cv_doc: dict):
    cv = cv_doc["cv"]
    assert cv["name"] == "Remco Oostelaar"
    assert "Transformation" in cv["headline"]
    assert "Amersfoort" in cv["location"]
    assert "@" in cv["email"]
    assert cv["phone"]
    assert cv["website"] == "https://solarnode.cc"


def test_social_networks(cv_doc: dict):
    networks = {n["network"]: n["username"] for n in cv_doc["cv"]["social_networks"]}
    assert networks["GitHub"] == "SolarnodeCC"
    assert networks["LinkedIn"] == "solarnode"
    assert not str(networks["GitHub"]).startswith("http")


def test_required_sections_present(cv_doc: dict):
    sections = cv_doc["cv"]["sections"]
    missing = REQUIRED_SECTIONS - set(sections)
    assert not missing, f"Missing sections: {missing}"


def test_no_placeholder_content(cv_text: str, cv_doc: dict):
    blob = yaml.safe_dump(cv_doc["cv"]["sections"], allow_unicode=True).lower()
    forbidden = (
        "jouw naam",
        "voorbeeld bedrijf",
        "voorbeeld hogeschool",
        "ander project",
        "beschrijf hier",
        "tech stack en impact hier",
        "voorbeeld certificaat",
    )
    hits = [f for f in forbidden if f in blob or f in cv_text.lower()]
    assert not hits, f"Placeholder leftovers: {hits}"


def test_theme_and_locale(cv_doc: dict):
    assert cv_doc["design"]["theme"] == "solarnode"
    assert cv_doc["design"]["page"]["size"] == "a4"
    assert cv_doc["locale"]["language"] == "dutch"
    assert "Remco" in cv_doc["settings"]["pdf_title"]


def test_work_experience_coverage(cv_doc: dict):
    entries = cv_doc["cv"]["sections"]["Werkervaring"]
    assert len(entries) >= 6
    companies = {e["company"] for e in entries if isinstance(e, dict)}
    for expected in EXPECTED_COMPANIES:
        assert any(expected in c for c in companies), f"Missing company: {expected}"

    latest = entries[0]
    assert latest["company"] == "Capgemini"
    assert latest["end_date"] == "present"
    assert len(latest.get("highlights") or []) >= 3


def test_each_experience_has_dates_and_highlights(cv_doc: dict):
    for entry in cv_doc["cv"]["sections"]["Werkervaring"]:
        assert entry.get("start_date"), f"Missing start_date for {entry.get('position')}"
        assert entry.get("end_date") or entry.get("date"), f"Missing end for {entry.get('position')}"
        highlights = entry.get("highlights") or []
        assert len(highlights) >= 2, f"Too few highlights for {entry.get('position')}"


def test_checklist_ready_for_remco(cv_text: str):
    result = evaluate_application_readiness(cv_text)
    ids = {c["id"]: c for c in result["checks"]}
    assert ids["name"]["ok"] is True
    assert ids["email"]["ok"] is True
    assert ids["phone"]["ok"] is True
    assert ids["linkedin"]["ok"] is True
    assert ids["profile"]["ok"] is True
    assert ids["experience"]["ok"] is True
    assert ids["metrics"]["ok"] is True
    assert ids["skills"]["ok"] is True
    assert ids["languages"]["ok"] is True
    assert ids["placeholders"]["ok"] is True
    assert result["errors"] == 0
    assert result["score"] >= 80
    assert result["ready"] is True


def test_rendercv_dry_run_succeeds(cv_text: str, tmp_path: Path):
    rendercv = shutil.which("rendercv") or str(Path.home() / ".local" / "bin" / "rendercv")
    if not Path(rendercv).is_file():
        pytest.skip("rendercv CLI not installed")

    out = tmp_path / "out"
    proc = subprocess.run(
        [
            rendercv,
            "render",
            str(CV_PATH),
            "--dont-generate-html",
            "--dont-generate-markdown",
            "--dont-generate-png",
            "--output-folder",
            str(out),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    pdf = out / "CV.pdf"
    typ = out / "CV.typ"
    assert pdf.is_file() or typ.is_file()


def test_full_render_artifacts_mention_remco(tmp_path: Path):
    rendercv = shutil.which("rendercv") or str(Path.home() / ".local" / "bin" / "rendercv")
    if not Path(rendercv).is_file():
        pytest.skip("rendercv CLI not installed")

    out = tmp_path / "full"
    proc = subprocess.run(
        [
            rendercv,
            "render",
            str(CV_PATH),
            "--output-folder",
            str(out),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (out / "CV.pdf").is_file()
    assert (out / "CV.md").is_file()
    md = (out / "CV.md").read_text(encoding="utf-8")
    assert "Remco Oostelaar" in md
    assert "Capgemini" in md
    assert "Quality Engineering" in md or "quality engineering" in md.lower()
