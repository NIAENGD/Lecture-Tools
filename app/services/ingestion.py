"""High level ingestion pipeline for lecture assets."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional, Protocol

from ..config import AppConfig
from .naming import build_asset_stem, build_timestamped_name, slugify
from .storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord


class IngestionError(RuntimeError):
    """Raised when a lecture cannot be ingested."""


@dataclass
class TranscriptResult:
    """Represents the output of the transcription stage."""

    text_path: Path
    segments_path: Optional[Path]


class TranscriptionEngine(Protocol):
    """Protocol describing a transcription backend."""

    def transcribe(
        self,
        audio_path: Path,
        output_dir: Path,
        *,
        progress_callback: Optional[Callable[[float, Optional[float], str], None]] = None,
    ) -> TranscriptResult:
        """Generate a transcript for *audio_path* into *output_dir*."""


class SlideConverter(Protocol):
    """Protocol describing a slide conversion backend."""

    def convert(
        self,
        slide_path: Path,
        output_dir: Path,
        *,
        page_range: Optional[tuple[int, int]] = None,
    ) -> Iterable[Path]:
        """Convert *slide_path* into processed artefacts stored in *output_dir*."""


@dataclass
class LecturePaths:
    """Utility describing important directories for a lecture."""

    lecture_root: Path
    raw_dir: Path
    processed_dir: Path
    processed_audio_dir: Path
    transcript_dir: Path
    slide_dir: Path
    notes_dir: Path

    @classmethod
    def build(
        cls,
        storage_root: Path,
        class_name: str,
        module_name: str,
        lecture_name: str,
    ) -> "LecturePaths":
        lecture_root = (
            storage_root / slugify(class_name) / slugify(module_name) / slugify(lecture_name)
        )
        raw_dir = lecture_root / "raw"
        processed_dir = lecture_root / "processed"
        processed_audio_dir = processed_dir / "audio"
        transcript_dir = processed_dir / "transcripts"
        slide_dir = processed_dir / "slides"
        notes_dir = processed_dir / "notes"
        return cls(
            lecture_root=lecture_root,
            raw_dir=raw_dir,
            processed_dir=processed_dir,
            processed_audio_dir=processed_audio_dir,
            transcript_dir=transcript_dir,
            slide_dir=slide_dir,
            notes_dir=notes_dir,
        )

    def ensure(self) -> None:
        for path in (
            self.lecture_root,
            self.raw_dir,
            self.processed_dir,
            self.processed_audio_dir,
            self.transcript_dir,
            self.slide_dir,
            self.notes_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)
class LectureIngestor:
    """Coordinates the ingestion of lecture assets."""

    def __init__(
        self,
        config: AppConfig,
        repository: LectureRepository,
        *,
        transcription_engine: Optional[TranscriptionEngine] = None,
        slide_converter: Optional[SlideConverter] = None,
    ) -> None:
        self._config = config
        self._repository = repository
        self._transcription_engine = transcription_engine
        self._slide_converter = slide_converter

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def ingest(
        self,
        *,
        class_name: str,
        module_name: str,
        lecture_name: str,
        description: str = "",
        audio_file: Optional[Path] = None,
        slide_file: Optional[Path] = None,
    ) -> LectureRecord:
        """Ingest provided assets and return the resulting lecture record."""

        if audio_file is None and slide_file is None:
            raise IngestionError("At least one of audio_file or slide_file must be provided")

        lecture_paths = LecturePaths.build(
            self._config.storage_root,
            class_name,
            module_name,
            lecture_name,
        )
        lecture_paths.ensure()

        class_record = self._ensure_class(class_name)
        module_record = self._ensure_module(class_record.id, module_name)
        lecture_record = self._ensure_lecture(module_record.id, lecture_name, description)

        audio_relative = None
        slide_relative = None
        transcript_relative = None
        slide_image_relative = None

        if audio_file is not None:
            audio_stem = build_asset_stem(class_name, module_name, lecture_name, "audio")
            audio_relative = self._copy_asset(audio_file, lecture_paths.raw_dir, audio_stem)
            if self._transcription_engine is None:
                raise IngestionError("No transcription engine configured for audio ingestion")
            transcript = self._transcription_engine.transcribe(
                lecture_paths.raw_dir / audio_relative,
                lecture_paths.transcript_dir,
            )
            transcript_relative = transcript.text_path.relative_to(self._config.storage_root).as_posix()
            audio_relative = (lecture_paths.raw_dir / audio_relative).relative_to(self._config.storage_root).as_posix()

        if slide_file is not None:
            slide_stem = build_asset_stem(class_name, module_name, lecture_name, "slides")
            slide_relative = self._copy_asset(slide_file, lecture_paths.raw_dir, slide_stem)
            if self._slide_converter is None:
                raise IngestionError("No slide converter configured for slideshow ingestion")
            generated = list(
                self._slide_converter.convert(
                    lecture_paths.raw_dir / slide_relative,
                    lecture_paths.slide_dir,
                )
            )
            if generated:
                first_asset = generated[0]
                slide_image_relative = first_asset.relative_to(self._config.storage_root).as_posix()
            slide_relative = (lecture_paths.raw_dir / slide_relative).relative_to(self._config.storage_root).as_posix()

        self._repository.update_lecture_assets(
            lecture_record.id,
            audio_path=audio_relative,
            slide_path=slide_relative,
            transcript_path=transcript_relative,
            slide_image_dir=slide_image_relative,
        )

        return self._repository.get_lecture(lecture_record.id) or lecture_record

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _ensure_class(self, name: str) -> ClassRecord:
        existing = self._repository.find_class_by_name(name)
        if existing:
            return existing
        identifier = self._repository.add_class(name)
        record = self._repository.get_class(identifier)
        if record is None:
            raise IngestionError("Failed to create class record")
        return record

    def _ensure_module(self, class_id: int, name: str) -> ModuleRecord:
        existing = self._repository.find_module_by_name(class_id, name)
        if existing:
            return existing
        identifier = self._repository.add_module(class_id, name)
        record = self._repository.get_module(identifier)
        if record is None:
            raise IngestionError("Failed to create module record")
        return record

    def _ensure_lecture(self, module_id: int, name: str, description: str) -> LectureRecord:
        existing = self._repository.find_lecture_by_name(module_id, name)
        if existing:
            if description and existing.description != description:
                self._repository.update_lecture_description(existing.id, description)
                updated = self._repository.get_lecture(existing.id)
                if updated is not None:
                    return updated
            return existing
        identifier = self._repository.add_lecture(module_id, name, description)
        record = self._repository.get_lecture(identifier)
        if record is None:
            raise IngestionError("Failed to create lecture record")
        return record

    def _copy_asset(self, src: Path, destination_dir: Path, stem: str) -> str:
        if not src.exists():
            raise IngestionError(f"Asset not found: {src}")
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / build_timestamped_name(stem, extension=src.suffix)
        shutil.copy2(src, destination)
        return destination.name

__all__ = [
    "IngestionError",
    "LectureIngestor",
    "LecturePaths",
    "SlideConverter",
    "TranscriptResult",
    "TranscriptionEngine",
]
