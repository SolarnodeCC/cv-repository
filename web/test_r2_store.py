from web.r2_store import ALLOWED_KEYS, CONTENT_TYPES, _ALLOWLIST_PATH, _request


def test_allowlist_file_exists():
    assert _ALLOWLIST_PATH.is_file()


def test_allowed_keys_match_content_types():
    assert set(CONTENT_TYPES) == set(ALLOWED_KEYS)


def test_public_artifact_keys_present():
    for key in ("cv.yaml", "output/CV.pdf", "output/CV.html", "output/CV.png"):
        assert key in ALLOWED_KEYS


def test_disallowed_key_rejected():
    try:
        _request("GET", "../etc/passwd")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "not allowed" in str(exc)
