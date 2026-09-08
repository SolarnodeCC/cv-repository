"""Tests for AI proposal application (no live provider calls)."""

from __future__ import annotations

import os

import yaml

from web.ai_assistant import ai_configured, apply_proposal, chat


SAMPLE = """
cv:
  name: Test
  sections:
    Profiel:
      - Hello
design:
  theme: solarnode
locale:
  language: dutch
settings:
  pdf_title: CV
"""


def test_ai_configured_false_without_key(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    assert ai_configured() is False
    result = chat(message="improve", yaml_content=SAMPLE)
    assert result["ok"] is False
    assert result["configured"] is False


def test_ai_configured_via_proxy(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("AI_BASE_URL", "http://ai.api/v1")
    assert ai_configured() is True


def test_default_model_workers_ai(monkeypatch):
    from web import ai_assistant

    monkeypatch.delenv("AI_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    monkeypatch.setenv("AI_BASE_URL", "http://ai.api/v1")
    assert ai_assistant._model() == ai_assistant.DEFAULT_WORKERS_AI_MODEL


def test_workers_ai_rest_needs_token(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv(
        "AI_BASE_URL",
        "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1",
    )
    assert ai_configured() is False
    result = chat(message="improve", yaml_content=SAMPLE)
    assert result["ok"] is False
    assert result["configured"] is False



def test_apply_path_replacement():
    proposal = {
        "path": "cv",
        "replacement": {
            "name": "Updated",
            "sections": {"Profiel": ["Better hello"]},
        },
    }
    text = apply_proposal(SAMPLE, proposal)
    data = yaml.safe_load(text)
    assert data["cv"]["name"] == "Updated"
    assert data["design"]["theme"] == "solarnode"


def test_apply_full_yaml():
    full = """
cv:
  name: Full
  sections: {}
design:
  theme: classic
"""
    text = apply_proposal(SAMPLE, {"full_yaml": full})
    data = yaml.safe_load(text)
    assert data["cv"]["name"] == "Full"
    assert data["design"]["theme"] == "classic"


def test_apply_invalid_path():
    import pytest

    with pytest.raises(ValueError, match="Ongeldig path"):
        apply_proposal(SAMPLE, {"path": "nope", "replacement": {}})


def test_extract_json_from_prose_fence():
    from web.ai_assistant import _extract_json

    raw = """Sure, here you go:
```json
{"message": "Improved profile", "proposals": []}
```
"""
    assert _extract_json(raw)["message"] == "Improved profile"


def test_extract_json_question_only():
    from web.ai_assistant import _extract_json

    raw = '{"message": "Your CV looks strong on Capgemini leadership.", "proposals": []}'
    parsed = _extract_json(raw)
    assert parsed["proposals"] == []
    assert "Capgemini" in parsed["message"]


def test_chat_parse_retry_then_ok(monkeypatch):
    from web import ai_assistant

    monkeypatch.setenv("AI_BASE_URL", "http://ai.api/v1")
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    calls = {"n": 0}

    def fake_request(messages):
        calls["n"] += 1
        if calls["n"] == 1:
            return {
                "choices": [
                    {"message": {"content": "I would improve the profile wording."}}
                ]
            }
        return {
            "choices": [
                {
                    "message": {
                        "content": '{"message": "Profiel aangescherpt", "proposals": []}'
                    }
                }
            ]
        }

    monkeypatch.setattr(ai_assistant, "_provider_request", fake_request)
    result = chat(message="verbeter profiel", yaml_content=SAMPLE)
    assert result["ok"] is True
    assert result["message"] == "Profiel aangescherpt"
    assert calls["n"] == 2


def test_chat_parse_failure_returns_raw(monkeypatch):
    from web import ai_assistant

    monkeypatch.setenv("AI_BASE_URL", "http://ai.api/v1")

    def always_prose(_messages):
        return {"choices": [{"message": {"content": "Not JSON at all, sorry."}}]}

    monkeypatch.setattr(ai_assistant, "_provider_request", always_prose)
    result = chat(message="hallo", yaml_content=SAMPLE)
    assert result["ok"] is False
    assert "geen geldig JSON" in result["message"]
    assert "Not JSON" in result["raw_content"]
