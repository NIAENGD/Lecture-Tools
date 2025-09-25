from __future__ import annotations

import wave
from pathlib import Path
from typing import Tuple

import numpy as np

from app.processing.recording import (
    check_audio_mastering_cli_availability,
    load_wav_file,
    preprocess_audio,
    save_preprocessed_wav,
)


def test_preprocess_audio_generates_balanced_mono(tmp_path: Path) -> None:
    sample_rate = 48_000
    duration = 2.0
    times = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

    signal = 0.4 * np.sin(2 * np.pi * 80 * times)  # rumble to remove
    signal += 0.2 * np.sin(2 * np.pi * 1_000 * times)
    signal += 0.05 * np.random.default_rng(12).normal(size=times.shape)
    stereo = np.stack([signal, signal * 0.8], axis=1).astype(np.float32)

    processed = preprocess_audio(stereo, sample_rate)

    assert processed.ndim == 1
    assert processed.dtype == np.float32
    assert np.max(np.abs(processed)) <= 0.92
    rms = float(np.sqrt(np.mean(np.square(processed))))
    assert 0.02 <= rms <= 0.12

    target = tmp_path / "processed.wav"
    save_preprocessed_wav(target, processed, sample_rate)

    with wave.open(str(target), "rb") as handle:
        assert handle.getnchannels() == 1
        assert handle.getsampwidth() == 2
        assert handle.getframerate() == sample_rate
        frames = handle.readframes(handle.getnframes())
        assert frames  # ensure data was written


def test_load_wav_file_round_trip(tmp_path: Path) -> None:
    sample_rate = 16_000
    duration = 0.2
    times = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    waveform = (0.5 * np.sin(2 * np.pi * 220 * times)).astype(np.float32)
    ints = np.round(np.clip(waveform, -1.0, 1.0) * 32_767).astype(np.int16)

    target = tmp_path / "tone.wav"
    with wave.open(str(target), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(ints.tobytes())

    loaded, rate = load_wav_file(target)
    assert rate == sample_rate
    assert loaded.shape == waveform.shape
    assert loaded.dtype == np.float32
    assert np.allclose(loaded[:100], waveform[:100], atol=1e-3)


def test_mastering_cli_probe_handles_missing_binary(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.processing.recording._find_mastering_cli_binary", lambda: None
    )

    status = check_audio_mastering_cli_availability()
    assert status["supported"] is False
    assert "binary" not in status
    assert "CLI binary not found" in status["message"]


def test_mastering_cli_probe_reports_output(monkeypatch, tmp_path: Path) -> None:
    fake_binary = tmp_path / "main.exe"
    fake_binary.write_text("exe", encoding="utf-8")

    monkeypatch.setattr(
        "app.processing.recording._find_mastering_cli_binary",
        lambda: fake_binary,
    )

    def fake_probe(_binary: Path) -> Tuple[bool, str]:
        return True, "Audio mastering ready\nAll good"

    monkeypatch.setattr(
        "app.processing.recording._probe_mastering_cli", fake_probe
    )

    status = check_audio_mastering_cli_availability()
    assert status["supported"] is True
    assert status["binary"] == str(fake_binary)
    assert status["message"] == "Audio mastering ready"
    assert status["output"] == "Audio mastering ready\nAll good"
