"""Helpers for normalising uploaded audio files."""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple

from .naming import build_timestamped_name


LOGGER = logging.getLogger(__name__)


def ensure_wav(
    source: Path,
    *,
    output_dir: Optional[Path] = None,
    stem: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> Tuple[Path, bool]:
    """Return a PCM WAV version of *source*.

    The original file is returned unchanged when it already uses the WAV container.
    Otherwise FFmpeg is invoked to transcode the payload to a 16-bit PCM WAV file.

    The returned tuple contains the destination path and a boolean flag indicating
    whether a new file was created.
    """

    LOGGER.debug("Ensuring WAV version for source %s", source)
    if source.suffix.lower() == ".wav":
        LOGGER.debug("Source is already WAV; skipping conversion")
        return source, False

    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path is None:
        raise ValueError(
            "Audio conversion requires FFmpeg to be installed on the server."
        )
    LOGGER.debug("Using FFmpeg binary at %s", ffmpeg_path)

    destination_dir = (output_dir or source.parent).resolve()
    destination_dir.mkdir(parents=True, exist_ok=True)
    LOGGER.debug("Audio conversion destination directory: %s", destination_dir)

    base_stem = stem or source.stem or "audio"
    candidate = destination_dir / f"{base_stem}.wav"

    if candidate.exists():
        LOGGER.debug("Destination %s already exists; applying timestamp/sequence", candidate)
        if timestamp:
            candidate = destination_dir / build_timestamped_name(
                base_stem, timestamp=timestamp, extension=".wav"
            )
        if candidate.exists():
            sequence = 1
            while True:
                candidate = destination_dir / build_timestamped_name(
                    base_stem,
                    timestamp=timestamp,
                    sequence=sequence,
                    extension=".wav",
                )
                if not candidate.exists():
                    break
                sequence += 1
                LOGGER.debug(
                    "Candidate already existed; trying sequence=%s -> %s", sequence, candidate
                )

    command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-c:a",
        "pcm_s16le",
        str(candidate),
    ]

    LOGGER.debug("Executing FFmpeg command: %s", " ".join(command))
    try:
        completed = subprocess.run(
            command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False
        )
    except FileNotFoundError as error:  # pragma: no cover - defensive guard
        raise ValueError("Audio conversion requires FFmpeg to be installed on the server.") from error

    if completed.returncode != 0:
        candidate.unlink(missing_ok=True)
        stderr = completed.stderr.decode("utf-8", errors="ignore").strip()
        stdout = completed.stdout.decode("utf-8", errors="ignore").strip()
        details = (stderr or stdout or "FFmpeg exited with a non-zero status.").splitlines()
        LOGGER.debug(
            "FFmpeg conversion failed (code=%s). stderr=%s stdout=%s",
            completed.returncode,
            stderr,
            stdout,
        )
        raise ValueError(
            f"Unable to convert audio to WAV: {details[0] if details else 'Unknown error.'}"
        )

    LOGGER.debug("FFmpeg conversion succeeded; output stored at %s", candidate)
    return candidate, True


__all__ = ["ensure_wav"]
