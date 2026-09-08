"""Tests for application-readiness checklist."""

from web.checklist import evaluate_application_readiness


MINIMAL_BAD = """
cv:
  name: Jouw Naam
  email: info@solarnode.cc
  sections:
    Profiel:
      - Dit CV is gegenereerd met RenderCV vanuit deze repository.
"""


READYISH = """
cv:
  name: Alex Jansen
  headline: Software Engineer
  location: Amsterdam, Nederland
  email: alex@example.com
  phone: +31 6 11112222
  social_networks:
    - network: LinkedIn
      username: alexjansen
  sections:
    Profiel:
      - Software engineer met focus op backends en CI/CD. Levert betrouwbare systemen
        en documentatie zodat teams sneller kunnen opleveren.
    Werkervaring:
      - company: Acme
        position: Engineer
        start_date: 2024-01
        end_date: present
        location: Amsterdam
        highlights:
          - "Latency met 40% verlaagd op checkout-API"
          - "CI-pipeline van 18 naar 6 minuten gebracht"
          - "3 junior developers gecoacht via code review"
    Opleiding:
      - institution: TU Example
        area: Informatica
        degree: BSc
        start_date: 2018-09
        end_date: 2022-06
    Vaardigheden:
      - label: Talen
        details: Python, TypeScript
    Talen:
      - label: Nederlands
        details: Moedertaal
"""


def test_placeholder_cv_is_not_ready():
    result = evaluate_application_readiness(MINIMAL_BAD)
    assert result["ready"] is False
    assert result["score"] < 80
    ids = {c["id"]: c for c in result["checks"]}
    assert ids["name"]["ok"] is False
    assert ids["phone"]["ok"] is False
    assert ids["profile"]["ok"] is False


def test_strong_cv_passes_core_checks():
    result = evaluate_application_readiness(READYISH)
    assert result["errors"] == 0
    assert result["score"] >= 80
    assert result["ready"] is True
    ids = {c["id"]: c for c in result["checks"]}
    assert ids["phone"]["ok"] is True
    assert ids["metrics"]["ok"] is True
    assert ids["languages"]["ok"] is True
