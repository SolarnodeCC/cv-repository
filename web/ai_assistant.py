"""OpenAI-compatible AI assistant that proposes CV YAML patches."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


def ai_configured() -> bool:
    if os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY"):
        return True
    # Cloudflare container: Worker injects the key on the ai.api proxy.
    return _base_url().startswith("http://ai.api")


def _api_key() -> str | None:
    return os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY")


def _base_url() -> str:
    return (
        os.environ.get("AI_BASE_URL")
        or os.environ.get("OPENAI_BASE_URL")
        or "https://api.openai.com/v1"
    ).rstrip("/")


def _model() -> str:
    return os.environ.get("AI_MODEL") or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"


SYSTEM_PROMPT = """You are a CV editing assistant for RenderCV YAML (v2.8).
You receive the user's current cv.yaml and a request. Respond with ONLY valid JSON:
{
  "message": "short explanation for the user",
  "proposals": [
    {
      "id": "p1",
      "title": "short title",
      "rationale": "why this change",
      "path": "cv" | "design" | "locale" | "settings" | "",
      "replacement": <object or null>,
      "full_yaml": <string or null>
    }
  ]
}

Rules:
- Prefer path+replacement for a top-level section (cv/design/locale/settings).
- Use full_yaml only when the whole document must change.
- Keep RenderCV structure valid. Preserve theme solarnode unless asked otherwise.
- Do not invent employers or degrees; improve wording of existing content unless user asks to add placeholders.
- For job-tailoring: rewrite highlights/profile to match the pasted job description while staying truthful.
- Markdown (**bold**, [links](url)) is allowed in entry fields.
- Maximum 3 proposals.
"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise ValueError("AI-antwoord was geen JSON")
        return json.loads(match.group(0))


def chat(
    *,
    message: str,
    yaml_content: str,
    job_description: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    key = _api_key()
    via_proxy = _base_url().startswith("http://ai.api")
    if not key and not via_proxy:
        return {
            "ok": False,
            "configured": False,
            "message": (
                "AI niet geconfigureerd. Zet AI_API_KEY (of OPENAI_API_KEY) en optioneel "
                "AI_BASE_URL / AI_MODEL in de omgeving."
            ),
            "proposals": [],
        }

    user_parts = [
        f"Current cv.yaml:\n```yaml\n{yaml_content[:120000]}\n```",
        f"Request:\n{message}",
    ]
    if job_description and job_description.strip():
        user_parts.append(f"Job description to tailor for:\n{job_description.strip()[:20000]}")

    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history or []:
        role = turn.get("role")
        content = turn.get("content")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content[:8000]})
    messages.append({"role": "user", "content": "\n\n".join(user_parts)})

    payload = {
        "model": _model(),
        "messages": messages,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "solarnode-cv-editor/1.0",
    }
    if key:
        headers["Authorization"] = f"Bearer {key}"

    req = urllib.request.Request(
        f"{_base_url()}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        return {
            "ok": False,
            "configured": True,
            "message": f"AI provider fout ({exc.code}): {detail}",
            "proposals": [],
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "configured": True,
            "message": f"AI request mislukt: {exc}",
            "proposals": [],
        }

    try:
        content = body["choices"][0]["message"]["content"]
        parsed = _extract_json(content)
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "configured": True,
            "message": f"Kon AI-antwoord niet parsen: {exc}",
            "proposals": [],
            "raw": body,
        }

    proposals = parsed.get("proposals") or []
    if not isinstance(proposals, list):
        proposals = []

    return {
        "ok": True,
        "configured": True,
        "message": parsed.get("message") or "Voorstellen klaar",
        "proposals": proposals[:3],
        "model": _model(),
    }


def apply_proposal(yaml_content: str, proposal: dict) -> str:
    """Apply one AI proposal to YAML text; returns new YAML string."""
    import yaml

    full = proposal.get("full_yaml")
    if isinstance(full, str) and full.strip():
        text = full if full.endswith("\n") else full + "\n"
        data = yaml.safe_load(text)
        if not isinstance(data, dict) or "cv" not in data:
            raise ValueError("full_yaml moet een RenderCV-document met 'cv' zijn")
        return text

    path = (proposal.get("path") or "").strip()
    replacement = proposal.get("replacement")
    if not path or replacement is None:
        raise ValueError("Voorstel mist path/replacement of full_yaml")

    if path not in {"cv", "design", "locale", "settings"}:
        raise ValueError(f"Ongeldig path: {path}")

    data = yaml.safe_load(yaml_content)
    if not isinstance(data, dict):
        raise ValueError("Huidige YAML is geen document")
    data[path] = replacement
    from web.import_cv import document_to_yaml

    return document_to_yaml(data)
