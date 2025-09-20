"""Audio transcription helpers."""

from __future__ import annotations

import contextlib
import json
import re
import subprocess
import sys
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, Optional, Tuple

from ..services.ingestion import TranscriptResult, TranscriptionEngine


class GPUWhisperError(RuntimeError):
    """Base class for GPU Whisper related issues."""


class GPUWhisperUnsupportedError(GPUWhisperError):
    """Raised when the GPU CLI is unavailable on the current platform."""


class GPUWhisperModelMissingError(GPUWhisperError):
    """Raised when the expected GPU model binary is not present."""


@dataclass
class TranscriptSegment:
    """Represents a single transcript segment."""

    start: float
    end: float
    text: str


_SEGMENT_PATTERN = re.compile(
    r"^\[(\d+):(\d+):(\d+\.\d+)\s+-->\s+(\d+):(\d+):(\d+\.\d+)\]\s*(.*)$"
)


def _find_cli_binary() -> Optional[Path]:
    cli_root = Path(__file__).resolve().parent.parent / "cli"
    candidates = [cli_root / "main.exe", cli_root / "main"]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _probe_cli(binary: Path) -> Tuple[bool, str]:
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


def _resolve_cli_model_path(download_root: Optional[Path]) -> Path:
    base_root = download_root if download_root is not None else Path.cwd() / "assets"
    model_path = base_root / "models" / "ggml-medium.en.bin"
    if not model_path.exists():
        raise FileNotFoundError(model_path)
    return model_path


def check_gpu_whisper_availability(download_root: Optional[Path] = None) -> Dict[str, object]:
    """Return diagnostic information about GPU Whisper availability."""

    binary = _find_cli_binary()
    if binary is None:
        return {
            "supported": False,
            "message": "GPU Whisper CLI binary not found.",
            "output": "",
        }

    supported, output = _probe_cli(binary)
    if not supported:
        return {
            "supported": False,
            "message": "GPU Whisper CLI produced no output on this platform.",
            "output": output,
        }

    try:
        model_path = _resolve_cli_model_path(download_root)
    except FileNotFoundError:
        return {
            "supported": False,
            "message": (
                "GPU Whisper model not found. Download ggml-medium.en.bin and place it inside "
                "the assets/models directory."
            ),
            "output": output,
        }

    success_message = output.splitlines()[0] if output else "GPU Whisper CLI is available."
    return {
        "supported": True,
        "message": success_message,
        "output": output,
        "binary": str(binary),
        "model": str(model_path),
    }


class FasterWhisperTranscription(TranscriptionEngine):
    """Transcription engine backed by :mod:`faster_whisper` or the GPU CLI."""

    def __init__(
        self,
        model_size: str = "base",
        *,
        download_root: Optional[Path] = None,
        compute_type: str = "int8",
        beam_size: int = 5,
    ) -> None:
        self._beam_size = beam_size
        self._model = None
        self._use_gpu_cli = False
        self._cli_binary: Optional[Path] = None
        self._cli_model_path: Optional[Path] = None

        requested_model = model_size.lower()
        if requested_model == "gpu":
            cli_binary = _find_cli_binary()
            if cli_binary is None:
                raise GPUWhisperUnsupportedError("GPU Whisper CLI binary not found.")
            supported, _output = _probe_cli(cli_binary)
            if not supported:
                raise GPUWhisperUnsupportedError(
                    "GPU Whisper CLI is not supported on this platform."
                )
            try:
                self._cli_model_path = _resolve_cli_model_path(download_root)
            except FileNotFoundError as exc:
                raise GPUWhisperModelMissingError(
                    "GPU Whisper model not found. Download ggml-medium.en.bin and "
                    "place it inside the assets/models directory."
                ) from exc
            self._use_gpu_cli = True
            self._cli_binary = cli_binary

        if not self._use_gpu_cli:
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:  # pragma: no cover - exercised in runtime, not tests
                raise RuntimeError("faster-whisper is not installed") from exc

            download_directory = str(download_root) if download_root is not None else None
            selected_model = model_size if requested_model != "gpu" else "base"
            self._model = WhisperModel(
                selected_model,
                device="cpu",
                compute_type=compute_type,
                download_root=download_directory,
            )

    def transcribe(
        self,
        audio_path: Path,
        output_dir: Path,
        *,
        progress_callback: Optional[Callable[[float, Optional[float], str], None]] = None,
    ) -> TranscriptResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        if self._use_gpu_cli:
            return self._transcribe_with_cli(
                audio_path, output_dir, progress_callback=progress_callback
            )

        assert self._model is not None  # for type checkers
        segments, info = self._model.transcribe(
            str(audio_path),
            beam_size=self._beam_size,
        )

        collected_segments: list[TranscriptSegment] = []
        transcript_lines: list[str] = []
        total_duration = float(getattr(info, "duration", 0.0) or 0.0)
        last_progress = 0.0

        for segment in self._collect_segments(segments):
            collected_segments.append(segment)
            cleaned = segment.text.strip()
            if cleaned:
                transcript_lines.append(cleaned)
            last_progress = max(last_progress, segment.end)
            self._render_progress(
                segment.end,
                total_duration if total_duration > 0 else None,
                progress_callback=progress_callback,
            )

        if last_progress > 0:
            self._render_progress(
                total_duration or last_progress,
                total_duration if total_duration > 0 else None,
                progress_callback=progress_callback,
            )
            sys.stdout.write("\n")
            sys.stdout.flush()

        transcript_text = "\n".join(transcript_lines)

        transcript_file = output_dir / "transcript.txt"
        transcript_file.write_text(transcript_text, encoding="utf-8")

        segments_file = output_dir / "segments.json"
        segments_payload = [segment.__dict__ for segment in collected_segments]
        segments_file.write_text(json.dumps(segments_payload, indent=2), encoding="utf-8")

        return TranscriptResult(text_path=transcript_file, segments_path=segments_file)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _transcribe_with_cli(
        self,
        audio_path: Path,
        output_dir: Path,
        *,
        progress_callback: Optional[Callable[[float, Optional[float], str], None]] = None,
    ) -> TranscriptResult:
        assert self._cli_binary is not None
        assert self._cli_model_path is not None

        command = [
            str(self._cli_binary),
            "-m",
            str(self._cli_model_path),
            "-f",
            str(audio_path),
            "-gpu",
            "0",
        ]

        segments: list[TranscriptSegment] = []
        transcript_lines: list[str] = []
        captured_output: list[str] = []

        total_duration = self._get_audio_duration(audio_path)
        last_progress = 0.0

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        assert process.stdout is not None
        try:
            for raw_line in process.stdout:
                line = raw_line.rstrip()
                if line:
                    captured_output.append(line)
                match = _SEGMENT_PATTERN.match(line.strip())
                if match:
                    start = self._timestamp_to_seconds(match.group(1), match.group(2), match.group(3))
                    end = self._timestamp_to_seconds(match.group(4), match.group(5), match.group(6))
                    text = match.group(7).strip()
                    segment = TranscriptSegment(start=start, end=end, text=text)
                    segments.append(segment)
                    if text:
                        transcript_lines.append(text)
                    last_progress = max(last_progress, end)
                    self._render_progress(
                        last_progress,
                        total_duration,
                        progress_callback=progress_callback,
                    )
        except Exception:
            process.kill()
            process.wait()
            raise
        finally:
            process.stdout.close()

        return_code = process.wait()

        if last_progress > 0:
            self._render_progress(
                total_duration or last_progress,
                total_duration,
                progress_callback=progress_callback,
            )
            sys.stdout.write("\n")
            sys.stdout.flush()

        if return_code != 0:
            combined_output = "\n".join(captured_output)
            raise RuntimeError(
                f"GPU Whisper CLI failed with exit code {return_code}.\n{combined_output}"
            )

        transcript_text = "\n".join(line.strip() for line in transcript_lines if line.strip())

        transcript_file = output_dir / "transcript.txt"
        transcript_file.write_text(transcript_text, encoding="utf-8")

        segments_file = output_dir / "segments.json"
        segments_payload = [segment.__dict__ for segment in segments]
        segments_file.write_text(json.dumps(segments_payload, indent=2), encoding="utf-8")

        return TranscriptResult(text_path=transcript_file, segments_path=segments_file)

    def _render_progress(
        self,
        current: float,
        total: Optional[float],
        *,
        progress_callback: Optional[Callable[[float, Optional[float], str], None]] = None,
    ) -> None:
        if total and total > 0:
            ratio = max(0.0, min(current / total, 1.0))
            width = 30
            filled = min(width, int(ratio * width))
            if filled >= width:
                bar = "=" * width
            else:
                bar = "=" * filled + ">" + "." * (width - filled - 1)
            message = f"====> [{bar}] {ratio * 100:5.1f}% ({current:.1f}/{total:.1f}s)"
        else:
            message = f"====> processed {current:.1f}s"
            ratio = None
        if progress_callback is not None:
            progress_callback(current, total, message)
        sys.stdout.write("\r" + message)
        sys.stdout.flush()

    def _timestamp_to_seconds(self, hours: str, minutes: str, seconds: str) -> float:
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)

    def _get_audio_duration(self, audio_path: Path) -> Optional[float]:
        if audio_path.suffix.lower() == ".wav":
            with contextlib.closing(wave.open(str(audio_path), "rb")) as handle:
                frames = handle.getnframes()
                rate = handle.getframerate()
                if rate:
                    return frames / float(rate)
                return None
        try:
            from mutagen import File as MutagenFile  # type: ignore[import-not-found]
        except ImportError:  # pragma: no cover - optional dependency
            return None

        metadata = MutagenFile(str(audio_path))
        if metadata is None:
            return None
        info = getattr(metadata, "info", None)
        if info is None:
            return None
        length = getattr(info, "length", None)
        return float(length) if length else None

    def _collect_segments(self, segments: Iterable[object]) -> Iterable[TranscriptSegment]:
        for segment in segments:
            yield TranscriptSegment(
                start=float(getattr(segment, "start")),
                end=float(getattr(segment, "end")),
                text=str(getattr(segment, "text", "")),
            )


__all__ = [
    "FasterWhisperTranscription",
    "GPUWhisperError",
    "GPUWhisperModelMissingError",
    "GPUWhisperUnsupportedError",
    "check_gpu_whisper_availability",
]
