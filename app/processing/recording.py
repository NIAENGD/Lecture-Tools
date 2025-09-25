"""Audio preprocessing helpers."""

from __future__ import annotations

import math
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Mapping, Optional, Tuple
from types import MappingProxyType

import numpy as np
from numpy.lib import stride_tricks


def _db_to_amplitude(value: float) -> float:
    return float(10 ** (value / 20))


def _summarise_audio(array: np.ndarray) -> Tuple[int, int, np.ndarray]:
    """Return (frames, channels, flattened view) for *array*.

    The helper gracefully handles mono and multi-channel PCM arrays and ensures a
    contiguous ``float32`` view that downstream diagnostics can use without
    mutating the original signal.
    """

    audio = np.asarray(array, dtype=np.float32)
    if audio.ndim == 0:
        audio = audio.reshape(1)

    if audio.ndim == 1:
        frames = int(audio.size)
        channels = 1
        flattened = audio.reshape(-1)
    else:
        frames = int(audio.shape[0])
        channels = int(np.prod(audio.shape[1:]))
        flattened = np.ascontiguousarray(audio.reshape(frames, channels)).reshape(-1)

    return frames, channels, flattened


def describe_audio_debug_stats(audio: np.ndarray, sample_rate: int) -> str:
    """Return a human-readable summary of key statistics for ``audio``.

    The summary is designed for debug logging and highlights properties that are
    useful when diagnosing mastering quality issues (levels, dynamic range,
    clipping, and data validity). All calculations ignore non-finite values to
    avoid contaminating aggregate statistics.
    """

    frames, channels, flattened = _summarise_audio(audio)
    duration = float(frames) / float(sample_rate) if sample_rate > 0 else 0.0

    finite_mask = np.isfinite(flattened)
    finite_count = int(np.count_nonzero(finite_mask))
    invalid_count = int(flattened.size - finite_count)
    if finite_count:
        finite = flattened[finite_mask]
        minimum = float(np.min(finite))
        maximum = float(np.max(finite))
        abs_peak = float(np.max(np.abs(finite)))
        mean = float(np.mean(finite))
        std = float(np.std(finite))
        median = float(np.median(finite))
        rms = float(np.sqrt(np.mean(np.square(finite))))
        abs_p95 = float(np.percentile(np.abs(finite), 95))
        abs_p99 = float(np.percentile(np.abs(finite), 99))
        clipped = int(np.count_nonzero(np.abs(finite) >= 0.999))
    else:
        minimum = maximum = abs_peak = mean = std = median = rms = abs_p95 = abs_p99 = 0.0
        clipped = 0

    return (
        "sample_rate={rate}Hz, channels={channels}, frames={frames}, duration={duration:.3f}s, "
        "min={minimum:+.4f}, max={maximum:+.4f}, abs_peak={abs_peak:.4f}, rms={rms:.4f}, "
        "mean={mean:+.4f}, std={std:.4f}, median={median:+.4f}, abs_p95={abs_p95:.4f}, "
        "abs_p99={abs_p99:.4f}, clipped_samples={clipped}/{finite_count}, "
        "nonfinite_samples={invalid_count}"
    ).format(
        rate=sample_rate,
        channels=channels,
        frames=frames,
        duration=duration,
        minimum=minimum,
        maximum=maximum,
        abs_peak=abs_peak,
        rms=rms,
        mean=mean,
        std=std,
        median=median,
        abs_p95=abs_p95,
        abs_p99=abs_p99,
        clipped=clipped,
        finite_count=finite_count,
        invalid_count=invalid_count,
    )


def load_wav_file(path: Path) -> Tuple[np.ndarray, int]:
    """Return the PCM samples and sample rate stored in *path*.

    The loader supports mono or multi-channel PCM WAV files with sample widths of
    8, 16, 24, or 32 bits. Samples are returned as ``float32`` arrays with values
    in the range ``[-1, 1]``. A :class:`ValueError` is raised if the file uses an
    unsupported encoding.
    """

    try:
        with wave.open(str(path), "rb") as handle:
            channels = handle.getnchannels()
            sample_rate = handle.getframerate()
            sample_width = handle.getsampwidth()
            frame_count = handle.getnframes()
            payload = handle.readframes(frame_count)
    except wave.Error as error:  # pragma: no cover - depends on external files
        raise ValueError(f"Unsupported WAV file: {error}") from error

    if channels <= 0:
        raise ValueError("WAV file reports zero channels")

    if sample_width == 1:
        data = np.frombuffer(payload, dtype=np.uint8).astype(np.float32)
        data = (data - 128.0) / 128.0
    elif sample_width == 2:
        data = np.frombuffer(payload, dtype=np.int16).astype(np.float32)
        data /= 32_768.0
    elif sample_width == 3:
        bytes_per_sample = 3
        raw = np.frombuffer(payload, dtype=np.uint8)
        if raw.size % bytes_per_sample:
            raise ValueError("Corrupt 24-bit WAV payload")
        reshaped = raw.reshape(-1, bytes_per_sample)
        signed = (
            reshaped[:, 0].astype(np.int32)
            | (reshaped[:, 1].astype(np.int32) << 8)
            | (reshaped[:, 2].astype(np.int32) << 16)
        )
        mask = signed & 0x800000
        signed = signed - (mask << 1)
        data = signed.astype(np.float32) / float(1 << 23)
    elif sample_width == 4:
        data = np.frombuffer(payload, dtype=np.int32).astype(np.float32)
        data /= float(1 << 31)
    else:
        raise ValueError(f"Unsupported WAV sample width: {sample_width} bytes")

    if channels > 1:
        data = data.reshape(-1, channels)

    return np.asarray(data, dtype=np.float32), sample_rate


def preprocess_audio(
    audio: np.ndarray,
    sample_rate: int,
    *,
    highpass_hz: float = 80.0,
    lowpass_hz: float = 12_000.0,
    presence_low_hz: float = 2_000.0,
    presence_high_hz: float = 4_000.0,
    presence_gain_db: float = 2.0,
    noise_reduction_db: float = 12.0,
    noise_sensitivity: float = 1.2,
    compressor_threshold_db: float = -20.0,
    compressor_ratio: float = 3.0,
    compressor_attack_ms: float = 12.0,
    compressor_release_ms: float = 120.0,
    target_peak_db: float = -1.0,
    target_lufs_db: float = -16.0,
) -> np.ndarray:
    """Apply mastering steps to prioritise intelligible speech."""

    if audio.ndim == 2 and audio.shape[1] > 1:
        mono = np.mean(audio, axis=1)
    else:
        mono = np.squeeze(audio)
    mono = np.asarray(mono, dtype=np.float32)

    mono = _reduce_noise(
        mono,
        sample_rate,
        reduction_db=noise_reduction_db,
        sensitivity=noise_sensitivity,
    )

    mono = _shape_frequency_response(
        mono,
        sample_rate,
        highpass_hz=highpass_hz,
        lowpass_hz=lowpass_hz,
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


@dataclass(frozen=True)
class PreprocessAudioStageDescription:
    """Human friendly breakdown of the mastering chain."""

    summary: str
    headline: str
    detail_lines: Tuple[str, ...]
    parameters: Mapping[str, float]


def describe_preprocess_audio_stage(
    *,
    highpass_hz: float = 80.0,
    lowpass_hz: float = 12_000.0,
    presence_low_hz: float = 2_000.0,
    presence_high_hz: float = 4_000.0,
    presence_gain_db: float = 2.0,
    noise_reduction_db: float = 12.0,
    noise_sensitivity: float = 1.2,
    compressor_threshold_db: float = -20.0,
    compressor_ratio: float = 3.0,
    compressor_attack_ms: float = 12.0,
    compressor_release_ms: float = 120.0,
    target_peak_db: float = -1.0,
    target_lufs_db: float = -16.0,
) -> PreprocessAudioStageDescription:
    """Return a structured description of the mastering stage."""

    headline_steps = (
        "downmix to mono",
        "spectral noise gating",
        "speech-focused EQ",
        "dynamic compression",
        "loudness normalisation",
    )
    headline = " \u2192 ".join(headline_steps)

    detail_lines = (
        "Downmixing multi-channel input to mono for a consistent reference track.",
        (
            "Applying spectral noise gating to remove stationary background noise "
            f"(~{noise_reduction_db:.0f} dB target reduction, sensitivity {noise_sensitivity})."
        ),
        (
            "Shaping the frequency response for speech intelligibility: "
            f"high-pass {highpass_hz:.0f} Hz, low-pass {lowpass_hz:.0f} Hz, "
            f"+{presence_gain_db:.1f} dB presence boost between {presence_low_hz:.0f}-{presence_high_hz:.0f} Hz."
        ),
        (
            f"Compressing dynamics with a {compressor_ratio}:1 ratio at "
            f"{compressor_threshold_db:.0f} dBFS, attack {compressor_attack_ms:.0f} ms, "
            f"release {compressor_release_ms:.0f} ms to even out levels."
        ),
        (
            f"Normalising loudness to {target_lufs_db:.0f} LUFS with a {target_peak_db:.0f} dBFS peak "
            "ceiling for consistent playback volume."
        ),
    )

    parameters: Mapping[str, float] = MappingProxyType(
        {
            "highpass_hz": float(highpass_hz),
            "lowpass_hz": float(lowpass_hz),
            "presence_low_hz": float(presence_low_hz),
            "presence_high_hz": float(presence_high_hz),
            "presence_gain_db": float(presence_gain_db),
            "noise_reduction_db": float(noise_reduction_db),
            "noise_sensitivity": float(noise_sensitivity),
            "compressor_threshold_db": float(compressor_threshold_db),
            "compressor_ratio": float(compressor_ratio),
            "compressor_attack_ms": float(compressor_attack_ms),
            "compressor_release_ms": float(compressor_release_ms),
            "target_peak_db": float(target_peak_db),
            "target_lufs_db": float(target_lufs_db),
        }
    )

    return PreprocessAudioStageDescription(
        summary="Applying mastering chain",
        headline=headline,
        detail_lines=detail_lines,
        parameters=parameters,
    )


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


def _reduce_noise(
    signal: np.ndarray,
    sample_rate: int,
    *,
    reduction_db: float,
    sensitivity: float,
    frame_ms: float = 32.0,
) -> np.ndarray:
    if signal.size == 0:
        return signal

    frame_length = max(int(sample_rate * frame_ms / 1_000), 1)
    hop_length = max(frame_length // 2, 1)
    window = np.hanning(frame_length).astype(np.float32)

    pad_length = ((len(signal) - frame_length) // hop_length + 1) * hop_length + frame_length
    if pad_length <= 0:
        pad_length = frame_length
    pad_amount = max(0, pad_length - len(signal))
    if pad_amount:
        padded = np.pad(signal, (0, pad_amount), mode="reflect")
    else:
        padded = signal

    padded = np.ascontiguousarray(padded, dtype=np.float32)

    frame_count = 1 + (len(padded) - frame_length) // hop_length
    if frame_count <= 0:
        return signal.astype(np.float32)

    frames = stride_tricks.as_strided(
        padded,
        shape=(frame_count, frame_length),
        strides=(padded.strides[0] * hop_length, padded.strides[0]),
    )
    windowed = frames * window
    spectra = np.fft.rfft(windowed, axis=1)

    magnitude = np.abs(spectra)
    noise_profile = np.median(magnitude, axis=0, keepdims=True)
    min_gain = _db_to_amplitude(-reduction_db)

    floor = noise_profile * sensitivity
    gain = np.clip((magnitude - floor) / np.maximum(magnitude, 1e-9), min_gain, 1.0)
    processed_frames = np.fft.irfft(spectra * gain, n=frame_length, axis=1).astype(np.float32)

    output = np.zeros_like(padded, dtype=np.float32)
    window_accumulator = np.zeros_like(padded, dtype=np.float32)
    window_squared = window * window

    for index in range(frame_count):
        start = index * hop_length
        stop = start + frame_length
        output[start:stop] += processed_frames[index] * window
        window_accumulator[start:stop] += window_squared

    valid = window_accumulator > 1e-6
    output[valid] /= window_accumulator[valid]
    trimmed = output[: signal.size] if output.size > signal.size else output
    return np.asarray(trimmed, dtype=np.float32)


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
    lowpass_hz: float,
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

    if lowpass_hz > 0:
        mask = freqs > lowpass_hz
        if np.any(mask):
            weights[mask] *= np.maximum(lowpass_hz, 1.0) / freqs[mask]

    if presence_gain_db != 0 and presence_high_hz > presence_low_hz:
        mask = (freqs >= presence_low_hz) & (freqs <= presence_high_hz)
        if np.any(mask):
            weights[mask] *= _db_to_amplitude(presence_gain_db)

    shaped = np.fft.irfft(spectrum * weights, n=signal.size)
    return shaped.astype(np.float32)


def _find_mastering_cli_binary() -> Optional[Path]:
    cli_root = Path(__file__).resolve().parent.parent / "cli"
    candidates = [cli_root / "main.exe", cli_root / "main"]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _probe_mastering_cli(binary: Path) -> Tuple[bool, str]:
    try:
        result = subprocess.run(
            [str(binary)],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False, ""

    combined = (result.stdout + result.stderr).strip()
    return bool(combined), combined


def check_audio_mastering_cli_availability() -> Dict[str, object]:
    """Return diagnostic information about the audio mastering CLI."""

    binary = _find_mastering_cli_binary()
    if binary is None:
        return {
            "supported": False,
            "message": "Audio mastering CLI binary not found.",
            "output": "",
        }

    supported, output = _probe_mastering_cli(binary)
    if not supported:
        return {
            "supported": False,
            "message": "Audio mastering CLI produced no output on this platform.",
            "output": output,
        }

    success_message = (
        output.splitlines()[0] if output else "Audio mastering CLI is available."
    )
    return {
        "supported": True,
        "message": success_message,
        "output": output,
        "binary": str(binary),
    }


__all__ = [
    "check_audio_mastering_cli_availability",
    "load_wav_file",
    "preprocess_audio",
    "save_preprocessed_wav",
]
