"""Audio recording and preprocessing helpers."""

from __future__ import annotations

import math
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

try:  # pragma: no cover - exercised only when optional dependency is present at runtime
    import sounddevice as _sounddevice
except ImportError:  # pragma: no cover - importing module remains safe during tests
    _sounddevice = None


def _db_to_amplitude(value: float) -> float:
    return float(10 ** (value / 20))


@dataclass
class AudioRecorder:
    """Simple blocking recorder backed by :mod:`sounddevice`."""

    sample_rate: int = 48_000
    channels: int = 1
    device: Optional[int | str] = None

    def record(self, duration: float) -> np.ndarray:
        """Record *duration* seconds of audio and return a ``float32`` buffer."""

        if duration <= 0:
            raise ValueError("Recording duration must be positive")
        if _sounddevice is None:
            raise RuntimeError("sounddevice is not installed; recording is unavailable")

        frames = int(self.sample_rate * duration)
        recording = _sounddevice.rec(
            frames,
            samplerate=self.sample_rate,
            channels=self.channels,
            device=self.device,
            dtype="float32",
        )
        _sounddevice.wait()
        return np.asarray(recording, dtype=np.float32)


def preprocess_audio(
    audio: np.ndarray,
    sample_rate: int,
    *,
    highpass_hz: float = 80.0,
    presence_low_hz: float = 2_000.0,
    presence_high_hz: float = 4_000.0,
    presence_gain_db: float = 2.0,
    compressor_threshold_db: float = -18.0,
    compressor_ratio: float = 2.0,
    compressor_attack_ms: float = 20.0,
    compressor_release_ms: float = 90.0,
    target_peak_db: float = -3.0,
    target_lufs_db: float = -20.0,
) -> np.ndarray:
    """Apply gentle mastering steps optimised for Whisper transcription."""

    if audio.ndim == 2 and audio.shape[1] > 1:
        mono = np.mean(audio, axis=1)
    else:
        mono = np.squeeze(audio)
    mono = np.asarray(mono, dtype=np.float32)

    mono = _shape_frequency_response(
        mono,
        sample_rate,
        highpass_hz=highpass_hz,
        presence_low_hz=presence_low_hz,
        presence_high_hz=presence_high_hz,
        presence_gain_db=presence_gain_db,
    )

    # Gentle compression to even out peaks.
    mono = _compress_signal(
        mono,
        sample_rate,
        threshold_db=compressor_threshold_db,
        ratio=compressor_ratio,
        attack_ms=compressor_attack_ms,
        release_ms=compressor_release_ms,
    )

    mono = _normalise_signal(mono, target_peak_db=target_peak_db, target_lufs_db=target_lufs_db)
    mono = np.clip(mono, -1.0, 1.0)
    return mono.astype(np.float32)


def save_preprocessed_wav(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    """Persist ``audio`` to *path* as a mono 16-bit PCM WAV file."""

    path.parent.mkdir(parents=True, exist_ok=True)
    mono = np.asarray(audio, dtype=np.float32).flatten()
    pcm = np.clip(mono, -1.0, 1.0)
    pcm = np.round(pcm * 32_767).astype(np.int16)

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def _normalise_signal(signal: np.ndarray, *, target_peak_db: float, target_lufs_db: float) -> np.ndarray:
    peak = float(np.max(np.abs(signal))) if signal.size else 0.0
    if peak > 0:
        desired_peak = _db_to_amplitude(target_peak_db)
        signal = signal * (desired_peak / peak)

    rms = float(math.sqrt(np.mean(np.square(signal)))) if signal.size else 0.0
    target_rms = _db_to_amplitude(target_lufs_db)
    if rms > 0:
        signal = signal * (target_rms / rms)

    peak_after = float(np.max(np.abs(signal))) if signal.size else 0.0
    desired_peak = _db_to_amplitude(target_peak_db)
    if peak_after > desired_peak and peak_after > 0:
        signal = signal * (desired_peak / peak_after)

    return signal


def _compress_signal(
    signal: np.ndarray,
    sample_rate: int,
    *,
    threshold_db: float,
    ratio: float,
    attack_ms: float,
    release_ms: float,
) -> np.ndarray:
    if ratio <= 1.0:
        return signal

    threshold = _db_to_amplitude(threshold_db)
    attack_coeff = math.exp(-1.0 / (sample_rate * (attack_ms / 1_000))) if attack_ms > 0 else 0.0
    release_coeff = math.exp(-1.0 / (sample_rate * (release_ms / 1_000))) if release_ms > 0 else 0.0

    envelope = 0.0
    output = np.zeros_like(signal, dtype=np.float32)

    for index, sample in enumerate(signal):
        magnitude = abs(float(sample))
        if magnitude > envelope:
            envelope = attack_coeff * envelope + (1.0 - attack_coeff) * magnitude
        else:
            envelope = release_coeff * envelope + (1.0 - release_coeff) * magnitude

        if envelope < 1e-9:
            envelope = 1e-9

        if envelope <= threshold:
            gain = 1.0
        else:
            over_db = 20 * math.log10(envelope / threshold)
            reduction_db = over_db * (1 - 1 / ratio)
            gain = 10 ** (-reduction_db / 20)

        output[index] = float(sample) * gain

    return output


def _shape_frequency_response(
    signal: np.ndarray,
    sample_rate: int,
    *,
    highpass_hz: float,
    presence_low_hz: float,
    presence_high_hz: float,
    presence_gain_db: float,
) -> np.ndarray:
    if signal.size == 0:
        return signal

    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(signal.size, d=1.0 / sample_rate)
    weights = np.ones_like(freqs)

    if highpass_hz > 0:
        mask = freqs < highpass_hz
        if np.any(mask):
            weights[mask] *= freqs[mask] / max(highpass_hz, 1.0)

    if presence_gain_db != 0 and presence_high_hz > presence_low_hz:
        mask = (freqs >= presence_low_hz) & (freqs <= presence_high_hz)
        if np.any(mask):
            weights[mask] *= _db_to_amplitude(presence_gain_db)

    shaped = np.fft.irfft(spectrum * weights, n=signal.size)
    return shaped.astype(np.float32)


__all__ = ["AudioRecorder", "preprocess_audio", "save_preprocessed_wav"]
