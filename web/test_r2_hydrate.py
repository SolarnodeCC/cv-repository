"""Tests for R2 hydrate preferring ready local cv.yaml over stale R2 templates."""

from __future__ import annotations

import pytest

from web.r2_store import _prefer_local_cv


PLACEHOLDER = b"""
cv:
  name: Jouw Naam
  email: info@solarnode.cc
  sections:
    Profiel:
      - kort
    Werkervaring:
      - company: Voorbeeld Bedrijf
        position: Junior
        start_date: 2022-01
        end_date: 2023-01
        highlights:
          - beschrijf hier iets
"""

READY = b"""
cv:
  name: Remco Oostelaar
  headline: Transformation Leader
  location: Amersfoort, Nederland
  email: oostelaar@hotmail.com
  phone: +31 6 15433453
  social_networks:
    - network: LinkedIn
      username: solarnode
  sections:
    Profiel:
      - Transformation and consulting leader with 15+ years across quality engineering,
        service management and digital delivery for enterprise clients worldwide.
    Werkervaring:
      - company: Capgemini
        position: Operations Manager
        start_date: 2024
        end_date: present
        location: Utrecht
        highlights:
          - "Led a practice of over 120 consultants"
          - "Built AI adoption programs across 3 units"
          - "Improved delivery KPIs by 15 percent"
    Vaardigheden:
      - label: Domains
        details: Quality Engineering, Service Management
    Talen:
      - label: Nederlands
        details: Moedertaal
"""


def test_prefer_local_when_remote_is_placeholder():
    assert _prefer_local_cv(READY, PLACEHOLDER) is True


def test_keep_remote_when_identical():
    assert _prefer_local_cv(READY, READY) is False


def test_keep_remote_when_both_ready_similar():
    # Remote already ready and not a placeholder — do not clobber editor edits.
    remote = READY.replace(b"120 consultants", b"130 consultants")
    assert _prefer_local_cv(READY, remote) is False
