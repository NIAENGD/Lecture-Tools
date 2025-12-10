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
    _shape_frequency_response,
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


def test_preprocess_audio_handles_long_recordings_in_chunks() -> None:
    sample_rate = 16_000
    duration = 2.0
    times = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    stereo = np.stack([np.sin(2 * np.pi * 440 * times), np.cos(2 * np.pi * 440 * times)], axis=1).astype(
        np.float32
    )

    events = []

    def _progress(step_index: int, step_count: int, detail: str, completed: bool) -> None:
        events.append((step_index, step_count, detail, completed))

    processed = preprocess_audio(stereo, sample_rate, chunk_duration_s=0.5, progress_callback=_progress)

    assert processed.shape == (stereo.shape[0],)
    assert processed.dtype == np.float32

    # An 0.5s chunk size over a 2s clip should produce four chunks and scale
    # the progress counters accordingly.
    assert events
    step_count = events[-1][1]
    assert step_count == 24  # 4 chunks x 6 stages
    assert events[-1][0] == step_count
    assert "chunk 4/4" in events[-1][2]


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


def test_frequency_shaping_operates_in_frames() -> None:
    sample_rate = 24_000
    duration = 1.0
    times = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

    low = np.sin(2 * np.pi * 60 * times)
    presence = np.sin(2 * np.pi * 2_500 * times)
    high = np.sin(2 * np.pi * 9_000 * times)
    signal = (0.6 * low + 0.4 * presence + 0.6 * high).astype(np.float32)

    shaped = _shape_frequency_response(
        signal,
        sample_rate,
        highpass_hz=200.0,
        lowpass_hz=6_000.0,
        presence_low_hz=2_000.0,
        presence_high_hz=3_000.0,
        presence_gain_db=6.0,
        frame_ms=64.0,
    )

    assert shaped.dtype == np.float32
    spectrum = np.fft.rfft(shaped)
    freqs = np.fft.rfftfreq(shaped.size, d=1.0 / sample_rate)

    def magnitude_at(target: float) -> float:
        index = int(np.argmin(np.abs(freqs - target)))
        return float(np.abs(spectrum[index]))

    low_mag = magnitude_at(60.0)
    presence_mag = magnitude_at(2_500.0)
    high_mag = magnitude_at(9_000.0)

    assert presence_mag > low_mag * 3
    assert presence_mag > high_mag * 1.8
