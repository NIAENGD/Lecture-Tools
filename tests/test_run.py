"""Tests for the run.py entrypoint helpers."""

from __future__ import annotations

from types import SimpleNamespace

import run


def _setup_serve(monkeypatch, tmp_path, upload_limit):
    captured = {}

    monkeypatch.setattr(
        run,
        "initialize_app",
        lambda: SimpleNamespace(storage_root=tmp_path),
    )
    monkeypatch.setattr(run, "_prepare_logging", lambda storage_root: None)
    monkeypatch.setattr(run, "LectureRepository", lambda config: object())

    dummy_app = SimpleNamespace(state=SimpleNamespace())
    monkeypatch.setattr(run, "create_app", lambda repository, config, root_path: dummy_app)

    class DummyConfig:
        def __init__(self, app, **kwargs):
            captured["app"] = app
            captured["config_kwargs"] = kwargs

    class DummyServer:
        def __init__(self, config):
            captured["server_config"] = config
            captured["server_instance"] = self

        def run(self):
            captured["server_run"] = True

    class DummyThread:
        def __init__(self, target, daemon):
            self._target = target
            captured["thread_daemon"] = daemon

        def start(self):
            captured["thread_started"] = True

    monkeypatch.setattr(run.uvicorn, "Config", DummyConfig)
    monkeypatch.setattr(run.uvicorn, "Server", DummyServer)
    monkeypatch.setattr(run.threading, "Thread", DummyThread)
    monkeypatch.setattr(run.webbrowser, "open", lambda *args, **kwargs: True)
    monkeypatch.setattr(run, "get_max_upload_bytes", lambda: upload_limit)

    run.serve(host="0.0.0.0", port=9000, root_path="/api")

    captured["app_state_server"] = dummy_app.state.server
    return captured


def test_serve_applies_request_size_limit(monkeypatch, tmp_path):
    captured = _setup_serve(monkeypatch, tmp_path, upload_limit=50 * 1024 * 1024)

    assert captured["config_kwargs"]["limit_max_request_size"] == 50 * 1024 * 1024
    assert captured["app_state_server"] is captured["server_instance"]


def test_serve_omits_limit_when_disabled(monkeypatch, tmp_path):
    captured = _setup_serve(monkeypatch, tmp_path, upload_limit=0)

    assert "limit_max_request_size" not in captured["config_kwargs"]
