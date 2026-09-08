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
