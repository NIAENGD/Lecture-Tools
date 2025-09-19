"""Audio transcription helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

from ..services.ingestion import TranscriptResult, TranscriptionEngine


@dataclass
class TranscriptSegment:
    """Represents a single transcript segment."""

    start: float
    end: float
    text: str


class FasterWhisperTranscription(TranscriptionEngine):
    """Transcription engine backed by :mod:`faster_whisper`."""

    def __init__(
        self,
        model_size: str = "base",
        *,
        download_root: Optional[Path] = None,
        compute_type: str = "int8",
        beam_size: int = 5,
    ) -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:  # pragma: no cover - exercised in runtime, not tests
            raise RuntimeError("faster-whisper is not installed") from exc

        download_directory = str(download_root) if download_root is not None else None
        self._model = WhisperModel(
            model_size,
            device="cpu",
            compute_type=compute_type,
            download_root=download_directory,
        )
        self._beam_size = beam_size

    def transcribe(self, audio_path: Path, output_dir: Path) -> TranscriptResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        segments, _info = self._model.transcribe(
            str(audio_path),
            beam_size=self._beam_size,
        )

        collected_segments = list(self._collect_segments(segments))
        transcript_text = "\n".join(segment.text.strip() for segment in collected_segments if segment.text.strip())

        transcript_file = output_dir / "transcript.txt"
        transcript_file.write_text(transcript_text, encoding="utf-8")

        segments_file = output_dir / "segments.json"
        segments_payload = [segment.__dict__ for segment in collected_segments]
        segments_file.write_text(json.dumps(segments_payload, indent=2), encoding="utf-8")

        return TranscriptResult(text_path=transcript_file, segments_path=segments_file)

    def _collect_segments(self, segments: Iterable[object]) -> Iterable[TranscriptSegment]:
        for segment in segments:
            yield TranscriptSegment(
                start=float(getattr(segment, "start")),
                end=float(getattr(segment, "end")),
                text=str(getattr(segment, "text", "")),
            )


__all__ = ["FasterWhisperTranscription"]
