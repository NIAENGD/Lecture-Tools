"""Tests for the standalone audio mastering command."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from typer.testing import CliRunner

import run


runner = CliRunner()


def test_mastering_command_reports_progress(monkeypatch, tmp_path) -> None:
    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake")

    class DummyConfig:
        def __init__(self, storage_root: Path) -> None:
            self.storage_root = storage_root

    dummy_config = DummyConfig(tmp_path / "logs")

    monkeypatch.setattr(run, "initialize_app", lambda: dummy_config)
    monkeypatch.setattr(run, "_prepare_logging", lambda _: None)

    calls: dict[str, object] = {}

    def fake_ensure_wav(path: Path, **_: object) -> tuple[Path, bool]:
        calls["ensure_wav"] = path
        return path, False

    def fake_load_wav(path: Path) -> tuple[np.ndarray, int]:
        calls["load_wav"] = path
        return np.zeros(4, dtype=np.float32), 16_000

    def fake_preprocess(audio: np.ndarray, sample_rate: int) -> np.ndarray:
        calls["preprocess"] = (audio.copy(), sample_rate)
        return np.ones_like(audio)

    def fake_save(target: Path, audio: np.ndarray, sample_rate: int) -> None:
        calls["save"] = (target, audio.copy(), sample_rate)

    monkeypatch.setattr(run, "ensure_wav", fake_ensure_wav)
    monkeypatch.setattr(run, "load_wav_file", fake_load_wav)
    monkeypatch.setattr(run, "preprocess_audio", fake_preprocess)
    monkeypatch.setattr(run, "save_preprocessed_wav", fake_save)

    result = runner.invoke(run.cli, ["test-mastering", str(audio_path)])

    assert result.exit_code == 0
    assert "====> Preparing audio mastering…" in result.stdout
    assert "====> Analysing uploaded audio…" in result.stdout
    assert "====> Audio mastering completed." in result.stdout
    assert str(audio_path) in result.stdout

    saved_target, _, _ = calls["save"]
    assert saved_target == audio_path.parent / "input-master.wav"
