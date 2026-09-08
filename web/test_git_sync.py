"""Unit tests for GitHub sync helpers (no network)."""

from web import git_sync


def test_git_sync_configured_with_working_proxy(monkeypatch):
    monkeypatch.setattr(git_sync, "GITHUB_API_BASE", "http://github.api")
    monkeypatch.setattr(git_sync, "GITHUB_TOKEN", "")
    monkeypatch.setattr(git_sync, "GITHUB_REPO", "SolarnodeCC/cv-repository")
    monkeypatch.setattr(git_sync, "_configured_cache", None)
    monkeypatch.setattr(git_sync, "_request", lambda *a, **k: (200, {"full_name": "SolarnodeCC/cv-repository"}))
    assert git_sync.git_sync_configured() is True


def test_git_sync_configured_proxy_without_token(monkeypatch):
    monkeypatch.setattr(git_sync, "GITHUB_API_BASE", "http://github.api")
    monkeypatch.setattr(git_sync, "GITHUB_TOKEN", "")
    monkeypatch.setattr(git_sync, "_configured_cache", None)
    monkeypatch.setattr(
        git_sync,
        "_request",
        lambda *a, **k: (503, {"message": "GITHUB_TOKEN secret not configured on Worker"}),
    )
    assert git_sync.git_sync_configured() is False


def test_git_sync_configured_with_token(monkeypatch):
    monkeypatch.setattr(git_sync, "GITHUB_API_BASE", "https://api.github.com")
    monkeypatch.setattr(git_sync, "GITHUB_TOKEN", "ghs_test")
    monkeypatch.setattr(git_sync, "_configured_cache", None)
    assert git_sync.git_sync_configured() is True


def test_git_sync_not_configured(monkeypatch):
    monkeypatch.setattr(git_sync, "GITHUB_API_BASE", "https://api.github.com")
    monkeypatch.setattr(git_sync, "GITHUB_TOKEN", "")
    monkeypatch.setattr(git_sync, "_configured_cache", None)
    assert git_sync.git_sync_configured() is False


def test_sync_returns_config_error(monkeypatch):
    monkeypatch.setattr(git_sync, "GITHUB_API_BASE", "https://api.github.com")
    monkeypatch.setattr(git_sync, "GITHUB_TOKEN", "")
    monkeypatch.setattr(git_sync, "_configured_cache", None)
    result = git_sync.sync_cv_yaml_to_github("cv:\n  name: Test\n")
    assert result["ok"] is False
    assert "niet geconfigureerd" in result["message"]


def test_sync_happy_path(monkeypatch):
    monkeypatch.setattr(git_sync, "GITHUB_API_BASE", "https://api.github.com")
    monkeypatch.setattr(git_sync, "GITHUB_TOKEN", "ghs_test")
    monkeypatch.setattr(git_sync, "GITHUB_REPO", "SolarnodeCC/cv-repository")
    monkeypatch.setattr(git_sync, "GITHUB_BASE_BRANCH", "main")
    monkeypatch.setattr(git_sync, "_branch_name", lambda: "editor/cv-sync-test")
    monkeypatch.setattr(git_sync, "_configured_cache", None)

    calls: list[tuple[str, str]] = []

    def fake_request(method: str, path: str, payload=None):
        calls.append((method, path))
        if method == "GET" and path.endswith("/git/ref/heads/main"):
            return 200, {"object": {"sha": "abc123"}}
        if method == "POST" and path.endswith("/git/refs"):
            return 201, {"ref": "refs/heads/editor/cv-sync-test"}
        if method == "GET" and "contents/cv.yaml" in path:
            return 200, {"sha": "file-sha"}
        if method == "PUT" and path.endswith("/contents/cv.yaml"):
            assert payload and payload.get("sha") == "file-sha"
            assert payload.get("branch") == "editor/cv-sync-test"
            return 200, {"content": {"path": "cv.yaml"}}
        if method == "POST" and path.endswith("/pulls"):
            return 201, {"html_url": "https://github.com/SolarnodeCC/cv-repository/pull/99"}
        return 500, {"message": f"unexpected {method} {path}"}

    monkeypatch.setattr(git_sync, "_request", fake_request)
    result = git_sync.sync_cv_yaml_to_github("cv:\n  name: Test\n", commit_message="Test sync")
    assert result["ok"] is True
    assert result["pr_url"].endswith("/pull/99")
    assert ("POST", "/repos/SolarnodeCC/cv-repository/pulls") in calls
