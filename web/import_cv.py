"""Normalize RenderCV YAML and JSON Resume into a cv.yaml document."""

from __future__ import annotations

import json
from typing import Any

import yaml


def _ensure_dict(data: Any) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Import moet een object/dictionary zijn")
    return data


def parse_import_payload(raw: str, *, format_hint: str | None = None) -> dict:
    """Parse pasted/uploaded content into a RenderCV document dict."""
    text = (raw or "").strip()
    if not text:
        raise ValueError("Lege import")

    hint = (format_hint or "auto").lower()
    data: Any = None

    if hint in {"json", "json-resume", "jsonresume"} or (
        hint == "auto" and text.lstrip().startswith("{")
    ):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            if hint != "auto":
                raise ValueError(f"Ongeldige JSON: {exc}") from exc
            data = None

    if data is None:
        try:
            data = yaml.safe_load(text)
        except yaml.YAMLError as exc:
            raise ValueError(f"Ongeldige YAML: {exc}") from exc

    data = _ensure_dict(data)

    if "cv" in data:
        return normalize_rendercv_doc(data)

    if any(k in data for k in ("basics", "work", "education", "skills", "projects")):
        return json_resume_to_rendercv(data)

    raise ValueError(
        "Onbekend formaat — verwacht RenderCV YAML (top-level 'cv') of JSON Resume"
    )


def normalize_rendercv_doc(data: dict) -> dict:
    cv = data.get("cv")
    if not isinstance(cv, dict):
        raise ValueError("RenderCV-document mist een geldig 'cv'-object")
    out: dict[str, Any] = {"cv": cv}
    for key in ("design", "locale", "settings", "rendercv_settings"):
        if key in data and data[key] is not None:
            dest = "settings" if key == "rendercv_settings" else key
            out[dest] = data[key]
    return out


def _date_span(item: dict) -> tuple[str | None, str | None, str | None]:
    start = None
    end = None
    date = None
    start_date = item.get("startDate") or item.get("start_date")
    end_date = item.get("endDate") or item.get("end_date")
    if start_date:
        start = str(start_date)[:7] if len(str(start_date)) >= 7 else str(start_date)
    if end_date:
        end = str(end_date)[:7] if len(str(end_date)) >= 7 else str(end_date)
    elif item.get("endDate") is None and start and "endDate" in item:
        end = "present"
    if not start and not end and item.get("releaseDate"):
        date = str(item["releaseDate"])[:10]
    if not start and not end and item.get("date"):
        date = str(item["date"])[:10]
    return start, end, date


def json_resume_to_rendercv(data: dict) -> dict:
    basics = data.get("basics") or {}
    if not isinstance(basics, dict):
        basics = {}

    cv: dict[str, Any] = {
        "name": basics.get("name") or "Imported Name",
        "headline": basics.get("label") or basics.get("headline") or "",
        "location": "",
        "email": basics.get("email") or "",
        "phone": basics.get("phone") or "",
        "website": basics.get("url") or "",
        "social_networks": [],
        "sections": {},
    }

    loc = basics.get("location") or {}
    if isinstance(loc, dict):
        parts = [loc.get("city"), loc.get("region"), loc.get("countryCode") or loc.get("country")]
        cv["location"] = ", ".join(p for p in parts if p)
    elif isinstance(loc, str):
        cv["location"] = loc

    for profile in basics.get("profiles") or []:
        if not isinstance(profile, dict):
            continue
        network = profile.get("network") or "Website"
        username = profile.get("username") or profile.get("url") or ""
        if username:
            cv["social_networks"].append({"network": str(network), "username": str(username)})

    summary = basics.get("summary")
    if summary:
        cv["sections"]["Profiel"] = [str(summary)]

    work_entries = []
    for job in data.get("work") or []:
        if not isinstance(job, dict):
            continue
        start, end, date = _date_span(job)
        highlights = job.get("highlights") or []
        if isinstance(highlights, str):
            highlights = [highlights]
        entry: dict[str, Any] = {
            "company": job.get("name") or job.get("company") or "Company",
            "position": job.get("position") or job.get("title") or "Role",
            "location": job.get("location") or "",
            "summary": job.get("summary") or "",
            "highlights": [str(h) for h in highlights],
        }
        if start:
            entry["start_date"] = start
        if end:
            entry["end_date"] = end
        if date:
            entry["date"] = date
        work_entries.append(entry)
    if work_entries:
        cv["sections"]["Werkervaring"] = work_entries

    edu_entries = []
    for edu in data.get("education") or []:
        if not isinstance(edu, dict):
            continue
        start, end, date = _date_span(edu)
        entry: dict[str, Any] = {
            "institution": edu.get("institution") or "Institution",
            "area": edu.get("area") or edu.get("studyType") or "",
            "degree": edu.get("studyType") or edu.get("degree") or "",
            "location": edu.get("location") or "",
            "highlights": [str(h) for h in (edu.get("courses") or [])][:8],
        }
        if start:
            entry["start_date"] = start
        if end:
            entry["end_date"] = end
        if date:
            entry["date"] = date
        edu_entries.append(entry)
    if edu_entries:
        cv["sections"]["Opleiding"] = edu_entries

    project_entries = []
    for proj in data.get("projects") or []:
        if not isinstance(proj, dict):
            continue
        start, end, date = _date_span(proj)
        entry: dict[str, Any] = {
            "name": proj.get("name") or "Project",
            "location": proj.get("url") or "",
            "summary": proj.get("description") or "",
            "highlights": [str(h) for h in (proj.get("highlights") or [])],
        }
        if start:
            entry["start_date"] = start
        if end:
            entry["end_date"] = end
        if date:
            entry["date"] = date
        project_entries.append(entry)
    if project_entries:
        cv["sections"]["Projecten"] = project_entries

    skill_entries = []
    for skill in data.get("skills") or []:
        if not isinstance(skill, dict):
            continue
        keywords = skill.get("keywords") or []
        details = ", ".join(str(k) for k in keywords) if keywords else (skill.get("level") or "")
        skill_entries.append({"label": skill.get("name") or "Skill", "details": details})
    if skill_entries:
        cv["sections"]["Vaardigheden"] = skill_entries

    lang_entries = []
    for lang in data.get("languages") or []:
        if not isinstance(lang, dict):
            continue
        lang_entries.append(
            {"label": lang.get("language") or "Language", "details": lang.get("fluency") or ""}
        )
    if lang_entries:
        cv["sections"]["Talen"] = lang_entries

    return {
        "cv": cv,
        "locale": {"language": "english"},
        "settings": {"current_date": "today", "pdf_title": "CV", "bold_keywords": []},
    }


def merge_import(existing: dict | None, imported: dict, *, mode: str = "replace") -> dict:
    """Merge imported document into existing. mode: replace | keep_design."""
    mode = (mode or "replace").lower()
    if mode == "replace" or not existing:
        return imported

    out = dict(existing)
    if "cv" in imported:
        out["cv"] = imported["cv"]
    if mode == "keep_design":
        for key in ("locale", "settings"):
            if key in imported and imported[key] is not None:
                out[key] = imported[key]
        return out

    for key in ("design", "locale", "settings"):
        if key in imported and imported[key] is not None:
            out[key] = imported[key]
    return out


def document_to_yaml(doc: dict) -> str:
    ordered: dict[str, Any] = {}
    for key in ("cv", "design", "locale", "settings"):
        if key in doc:
            ordered[key] = doc[key]
    for key, value in doc.items():
        if key not in ordered:
            ordered[key] = value
    text = yaml.safe_dump(
        ordered,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=100,
    )
    schema = (
        "# yaml-language-server: $schema="
        "https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/v2.8/schema.json\n\n"
    )
    return schema + text
