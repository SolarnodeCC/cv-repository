"""Sollicitatie-gereedheid: checks geïnspireerd op ATS/Resume.io/FlowCV-standaarden."""

from __future__ import annotations

import re
from typing import Any

import yaml

PLACEHOLDER_NAMES = {
    "jouw naam",
    "your name",
    "john doe",
    "jane doe",
    "voorbeeld",
    "example name",
}

PLACEHOLDER_HINTS = (
    "vervang deze",
    "voorbeeld bedrijf",
    "voorbeeld hogeschool",
    "ander project",
    "beschrijf hier",
    "tech stack en impact hier",
    "placeholder",
)

TOOL_MARKETING = (
    "gegenereerd met rendercv",
    "generated with rendercv",
    "vanuit deze repository",
    "from this repository",
)


def _as_dict(data: Any) -> dict:
    return data if isinstance(data, dict) else {}


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(_text(v) for v in value)
    return str(value).strip()


def _section_blob(sections: dict) -> str:
    return yaml.safe_dump(sections, allow_unicode=True, sort_keys=False).lower()


def evaluate_application_readiness(content: str) -> dict:
    """Return a structured checklist for successful job applications."""
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        return {
            "score": 0,
            "ready": False,
            "summary": "YAML is ongeldig — fix syntax vóór je indient.",
            "checks": [
                {
                    "id": "yaml_valid",
                    "ok": False,
                    "severity": "error",
                    "label": "Geldige YAML",
                    "detail": str(exc),
                }
            ],
        }

    if not isinstance(data, dict) or "cv" not in data:
        return {
            "score": 0,
            "ready": False,
            "summary": "Top-level 'cv' ontbreekt.",
            "checks": [
                {
                    "id": "cv_root",
                    "ok": False,
                    "severity": "error",
                    "label": "CV-structuur",
                    "detail": "YAML moet een 'cv' object bevatten.",
                }
            ],
        }

    cv = _as_dict(data.get("cv"))
    sections = _as_dict(cv.get("sections"))
    blob = _section_blob(sections)
    checks: list[dict] = []

    def add(check_id: str, ok: bool, severity: str, label: str, detail: str) -> None:
        checks.append(
            {
                "id": check_id,
                "ok": ok,
                "severity": severity if not ok else "ok",
                "label": label,
                "detail": detail,
            }
        )

    name = _text(cv.get("name"))
    add(
        "name",
        bool(name) and name.lower() not in PLACEHOLDER_NAMES,
        "error",
        "Echte naam",
        "Vervang placeholder-naam door je volledige naam."
        if not name or name.lower() in PLACEHOLDER_NAMES
        else f"Naam: {name}",
    )

    email = _text(cv.get("email"))
    add(
        "email",
        bool(email) and "@" in email,
        "error",
        "E-mailadres",
        "Zet een bereikbaar e-mailadres bovenaan (ATS + recruiter)."
        if not email or "@" not in email
        else f"E-mail: {email}",
    )

    phone = _text(cv.get("phone"))
    add(
        "phone",
        bool(phone),
        "error",
        "Telefoonnummer",
        "Voeg een telefoonnummer toe — Resume.io/FlowCV en NL-sollicitaties verwachten dit."
        if not phone
        else f"Telefoon: {phone}",
    )

    location = _text(cv.get("location"))
    add(
        "location",
        bool(location),
        "warn",
        "Locatie",
        "Voeg stad/regio toe (bijv. Amsterdam / Remote NL)."
        if not location
        else f"Locatie: {location}",
    )

    networks = cv.get("social_networks") or []
    linkedin = False
    if isinstance(networks, list):
        for item in networks:
            if isinstance(item, dict) and str(item.get("network", "")).lower() == "linkedin":
                linkedin = bool(item.get("username"))
    add(
        "linkedin",
        linkedin,
        "warn",
        "LinkedIn",
        "Voeg LinkedIn toe in social_networks — standaard op succesvolle sollicitaties."
        if not linkedin
        else "LinkedIn aanwezig",
    )

    profile_keys = [k for k in sections if str(k).lower() in {"profiel", "summary", "profile", "samenvatting"}]
    profile_text = " ".join(_text(sections.get(k)) for k in profile_keys).lower()
    has_profile = len(profile_text) >= 80
    has_marketing = any(m in profile_text for m in TOOL_MARKETING)
    add(
        "profile",
        has_profile and not has_marketing,
        "error" if has_marketing or not has_profile else "ok",
        "Profieltekst",
        "Profiel mist of bevat tool-marketing (RenderCV/repo) — schrijf 2–3 zinnen over jouw impact."
        if not has_profile or has_marketing
        else "Profiel ziet er sollicitatie-waardig uit",
    )

    experience_keys = [
        k
        for k in sections
        if str(k).lower()
        in {"werkervaring", "experience", "work experience", "professional experience", "ervaring"}
    ]
    exp_entries = []
    for k in experience_keys:
        val = sections.get(k)
        if isinstance(val, list):
            exp_entries.extend(val)
    add(
        "experience",
        len(exp_entries) >= 1,
        "error",
        "Werkervaring",
        "Minimaal één werkervaring-entry met highlights."
        if not exp_entries
        else f"{len(exp_entries)} werkervaring-entr{'y' if len(exp_entries) == 1 else 'ies'}",
    )

    highlight_text = []
    for entry in exp_entries:
        if isinstance(entry, dict):
            for h in entry.get("highlights") or []:
                highlight_text.append(_text(h))
    joined_highlights = " ".join(highlight_text)
    quantified = bool(re.search(r"\d", joined_highlights))
    add(
        "metrics",
        quantified and len(highlight_text) >= 3,
        "warn",
        "Meetbare highlights",
        "Gebruik 3–5 bullets per recente rol met cijfers (%, #, tijd) — standaard bij Rezi/Teal/Jobscan."
        if not (quantified and len(highlight_text) >= 3)
        else f"{len(highlight_text)} highlights met meetbare signalen",
    )

    skill_keys = [k for k in sections if str(k).lower() in {"vaardigheden", "skills", "core competencies"}]
    add(
        "skills",
        bool(skill_keys),
        "error",
        "Vaardigheden",
        "Voeg een Vaardigheden/Skills-sectie toe (ATS zoekt hier keywords)."
        if not skill_keys
        else "Vaardigheden-sectie aanwezig",
    )

    edu_keys = [k for k in sections if str(k).lower() in {"opleiding", "education"}]
    add(
        "education",
        bool(edu_keys),
        "warn",
        "Opleiding",
        "Opleiding ontbreekt — verwacht op NL/EU CV's."
        if not edu_keys
        else "Opleiding aanwezig",
    )

    lang_keys = [
        k
        for k in sections
        if str(k).lower() in {"talen", "languages", "language skills", "spraak"}
    ]
    add(
        "languages",
        bool(lang_keys),
        "warn",
        "Talen",
        "Voeg een Talen-sectie toe (NL/EN CEFR) — gebruikelijk bij EU-sollicitaties."
        if not lang_keys
        else "Talen-sectie aanwezig",
    )

    placeholder_hits = [p for p in PLACEHOLDER_HINTS if p in blob]
    add(
        "placeholders",
        not placeholder_hits,
        "error",
        "Geen voorbeeldtekst",
        f"Nog placeholders: {', '.join(placeholder_hits[:3])}"
        if placeholder_hits
        else "Geen duidelijke voorbeeld-placeholders gevonden",
    )

    errors = sum(1 for c in checks if not c["ok"] and c["severity"] == "error")
    warns = sum(1 for c in checks if not c["ok"] and c["severity"] == "warn")
    passed = sum(1 for c in checks if c["ok"])
    total = len(checks)
    score = int(round(100 * passed / total)) if total else 0
    ready = errors == 0 and score >= 80

    if ready:
        summary = f"Klaar om in te dienen ({score}/100)."
    elif errors:
        summary = f"Nog niet indienen: {errors} blokkerende punt(en), {warns} waarschuwing(en) ({score}/100)."
    else:
        summary = f"Bijna klaar: {warns} verbeterpunt(en) ({score}/100)."

    return {
        "score": score,
        "ready": ready,
        "summary": summary,
        "passed": passed,
        "errors": errors,
        "warnings": warns,
        "checks": checks,
    }
