"""OpenAI-compatible AI assistant that proposes CV YAML patches."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct"

JSON_RETRY_SUFFIX = (
    "\n\nIMPORTANT: Reply with ONLY a single JSON object. "
    "No markdown fences, no explanation outside JSON."
)


def ai_configured() -> bool:
    if os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY"):
        return True
    # Cloudflare container: Worker proxies to Workers AI via ai.api (no key in container).
    return _base_url().startswith("http://ai.api")


def _api_key() -> str | None:
    return os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY")


def _base_url() -> str:
    return (
        os.environ.get("AI_BASE_URL")
        or os.environ.get("OPENAI_BASE_URL")
        or "https://api.openai.com/v1"
    ).rstrip("/")


def _uses_workers_ai_rest() -> bool:
    """True when AI_BASE_URL points at Cloudflare Workers AI OpenAI-compatible REST."""
    base = _base_url()
    return "api.cloudflare.com" in base and "/ai/v1" in base


def _uses_cloudflare_ai() -> bool:
    return _base_url().startswith("http://ai.api") or _uses_workers_ai_rest()


def _model() -> str:
    explicit = os.environ.get("AI_MODEL") or os.environ.get("OPENAI_MODEL")
    if explicit:
        return explicit
    if _uses_cloudflare_ai():
        return DEFAULT_WORKERS_AI_MODEL
    return DEFAULT_OPENAI_MODEL


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
- If the user only asks a question (no edit), return proposals as [] and put the answer in message.
"""


def _extract_json(text: str) -> dict:
    """Best-effort JSON object extraction from model output."""
    if not text or not str(text).strip():
        raise ValueError("leeg AI-antwoord")

    cleaned = str(text).strip()
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for index, char in enumerate(cleaned):
        if char != "{":
            continue
        try:
            obj, _end = decoder.raw_decode(cleaned[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and ("message" in obj or "proposals" in obj):
            return obj
        if isinstance(obj, dict):
            return obj

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError as exc:
            raise ValueError(f"AI-antwoord was geen geldig JSON ({exc})") from exc

    raise ValueError("AI-antwoord was geen JSON")


def _provider_request(messages: list[dict[str, str]]) -> dict[str, Any]:
    key = _api_key()
    payload: dict[str, Any] = {
        "model": _model(),
        "messages": messages,
        "temperature": 0.2 if _uses_cloudflare_ai() else 0.4,
        "max_tokens": 2048,
    }
    # Workers AI models often reject OpenAI response_format; prompt already requires JSON.
    if not _uses_cloudflare_ai():
        payload["response_format"] = {"type": "json_object"}

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
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _assistant_text(body: dict[str, Any]) -> str:
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"onverwacht provider-antwoord: {exc}") from exc
    if content is None:
        return ""
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            else:
                parts.append(str(item))
        return "".join(parts)
    return str(content)


def _parse_failure_payload(content: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
    snippet = (content or "").strip()
    preview = snippet[:800] if snippet else "(leeg antwoord)"
    return {
        "ok": False,
        "configured": True,
        "message": (
            "AI gaf geen geldig JSON-voorstel. "
            "Probeer de vraag korter te stellen (bijv. 'verbeter het profiel'). "
            f"Ruwe output: {preview}"
        ),
        "proposals": [],
        "raw_content": snippet[:4000],
        "model": _model(),
        "raw": body,
    }


def chat(
    *,
    message: str,
    yaml_content: str,
    job_description: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    key = _api_key()
    via_proxy = _base_url().startswith("http://ai.api")
    via_cf_rest = _uses_workers_ai_rest()
    if not key and not via_proxy:
        return {
            "ok": False,
            "configured": False,
            "message": (
                "AI niet geconfigureerd. Op Cloudflare gebruikt de editor Workers AI via de "
                "Worker-binding. Lokaal: zet AI_BASE_URL naar "
                "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1 "
                "en AI_API_KEY naar een Cloudflare API token (Workers AI Edit), "
                "of gebruik een andere OpenAI-compatible provider."
            ),
            "proposals": [],
        }
    if via_cf_rest and not key:
        return {
            "ok": False,
            "configured": False,
            "message": "Workers AI REST vereist AI_API_KEY (Cloudflare API token).",
            "proposals": [],
        }

    # Keep prompt smaller for Workers AI context limits — identity + sections matter most.
    yaml_for_prompt = yaml_content
    if _uses_cloudflare_ai() and len(yaml_for_prompt) > 50000:
        yaml_for_prompt = yaml_for_prompt[:50000] + "\n# …truncated…\n"

    user_parts = [
        f"Current cv.yaml:\n```yaml\n{yaml_for_prompt}\n```",
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

    body: dict[str, Any] | None = None
    content = ""
    try:
        body = _provider_request(messages)
        content = _assistant_text(body)
        try:
            parsed = _extract_json(content)
        except ValueError:
            # One retry with a stricter reminder — common for Llama prose replies.
            retry_messages = [
                *messages,
                {"role": "assistant", "content": content[:4000] or "{}"},
                {"role": "user", "content": JSON_RETRY_SUFFIX.strip()},
            ]
            body = _provider_request(retry_messages)
            content = _assistant_text(body)
            parsed = _extract_json(content)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        return {
            "ok": False,
            "configured": True,
            "message": f"AI provider fout ({exc.code}): {detail}",
            "proposals": [],
            "model": _model(),
        }
    except ValueError:
        return _parse_failure_payload(content, body=body)
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "configured": True,
            "message": f"AI request mislukt: {exc}",
            "proposals": [],
            "model": _model(),
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
