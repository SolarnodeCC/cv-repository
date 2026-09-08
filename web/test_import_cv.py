"""Tests for YAML / JSON Resume import."""

from __future__ import annotations

import json

import pytest
import yaml

from web.import_cv import (
    document_to_yaml,
    json_resume_to_rendercv,
    merge_import,
    parse_import_payload,
)


def test_parse_rendercv_yaml():
    raw = """
cv:
  name: Ada
  sections:
    Profiel:
      - Hello
design:
  theme: solarnode
locale:
  language: dutch
"""
    doc = parse_import_payload(raw, format_hint="yaml")
    assert doc["cv"]["name"] == "Ada"
    assert doc["design"]["theme"] == "solarnode"
    assert doc["locale"]["language"] == "dutch"


def test_parse_json_resume():
    payload = {
        "basics": {
            "name": "Ada Lovelace",
            "label": "Mathematician",
            "email": "ada@example.com",
            "phone": "+31 6 00000000",
            "url": "https://example.com",
            "location": {"city": "Amsterdam", "countryCode": "NL"},
            "summary": "Pioneer of computing.",
            "profiles": [{"network": "GitHub", "username": "ada"}],
        },
        "work": [
            {
                "name": "Analytical Engine Co",
                "position": "Engineer",
                "startDate": "2020-01-01",
                "endDate": "2022-06-01",
                "summary": "Built machines",
                "highlights": ["Invented notes"],
            }
        ],
        "education": [
            {
                "institution": "University",
                "area": "Math",
                "studyType": "BSc",
                "startDate": "2015-09",
                "endDate": "2019-06",
            }
        ],
        "skills": [{"name": "Languages", "keywords": ["Python", "YAML"]}],
        "languages": [{"language": "English", "fluency": "Native"}],
    }
    doc = parse_import_payload(json.dumps(payload), format_hint="json-resume")
    assert doc["cv"]["name"] == "Ada Lovelace"
    assert "Werkervaring" in doc["cv"]["sections"]
    assert doc["cv"]["sections"]["Werkervaring"][0]["company"] == "Analytical Engine Co"
    assert doc["cv"]["sections"]["Vaardigheden"][0]["label"] == "Languages"


def test_keep_design_merge():
    existing = {
        "cv": {"name": "Old"},
        "design": {"theme": "solarnode", "page": {"size": "a4"}},
        "locale": {"language": "dutch"},
    }
    imported = json_resume_to_rendercv(
        {"basics": {"name": "New", "email": "n@example.com"}, "work": []}
    )
    merged = merge_import(existing, imported, mode="keep_design")
    assert merged["cv"]["name"] == "New"
    assert merged["design"]["theme"] == "solarnode"


def test_document_to_yaml_roundtrip():
    doc = parse_import_payload(
        "cv:\n  name: Test\n  sections: {}\n",
        format_hint="yaml",
    )
    text = document_to_yaml(doc)
    loaded = yaml.safe_load(text)
    assert loaded["cv"]["name"] == "Test"


def test_unknown_format_raises():
    with pytest.raises(ValueError, match="Onbekend formaat"):
        parse_import_payload("foo: bar\n")
