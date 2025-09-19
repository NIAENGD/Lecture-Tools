from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

from app.processing.recording import preprocess_audio, save_preprocessed_wav


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
    assert np.max(np.abs(processed)) <= 0.75
    rms = float(np.sqrt(np.mean(np.square(processed))))
    assert 0.05 <= rms <= 0.2

    target = tmp_path / "processed.wav"
    save_preprocessed_wav(target, processed, sample_rate)

    with wave.open(str(target), "rb") as handle:
        assert handle.getnchannels() == 1
        assert handle.getsampwidth() == 2
        assert handle.getframerate() == sample_rate
        frames = handle.readframes(handle.getnframes())
        assert frames  # ensure data was written
