"""High level ingestion pipeline for lecture assets."""

from __future__ import annotations

import logging
import shutil
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional, Protocol, Sequence

from .. import config as config_module
from ..config import AppConfig
from .naming import build_asset_stem, build_timestamped_name, slugify
from .events import emit_file_event
from .storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord


LOGGER = logging.getLogger(__name__)


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


@dataclass
class SlideConversionResult:
    """Represents the output of a slide conversion run."""

    bundle_path: Path
    markdown_path: Path


class SlideConverter(Protocol):
    """Protocol describing a slide conversion backend."""

    def convert(
        self,
        slide_path: Path,
        bundle_dir: Path,
        notes_dir: Path,
        *,
        page_range: Optional[tuple[int, int]] = None,
        progress_callback: Optional[Callable[[int, Optional[int]], None]] = None,
    ) -> SlideConversionResult:
        """Convert *slide_path* into a Markdown+image bundle."""


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
        LOGGER.debug(
            "Resolved lecture directories for class='%s', module='%s', lecture='%s' -> %s",
            class_name,
            module_name,
            lecture_name,
            lecture_root,
        )
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
        directories = (
            ("lecture", self.lecture_root),
            ("raw", self.raw_dir),
            ("processed", self.processed_dir),
            ("processed audio", self.processed_audio_dir),
            ("transcript", self.transcript_dir),
            ("slide", self.slide_dir),
            ("notes", self.notes_dir),
        )
        for label, path in directories:
            start = time.perf_counter()
            existed_before = path.exists()
            try:
                writable = config_module._ensure_writable_directory(path)
            except Exception as error:  # pragma: no cover - defensive
                duration_ms = (time.perf_counter() - start) * 1000.0
                emit_file_event(
                    "ensure_directory_error",
                    payload={
                        "label": label,
                        "path": str(path),
                        "status": "error",
                        "error": f"{error.__class__.__name__}: {error}",
                    },
                    duration_ms=duration_ms,
                    level=logging.ERROR,
                )
                raise IngestionError(
                    f"Unable to prepare {label} directory '{path}'. It is not writable. "
                    "Update config/default.json or adjust permissions."
                ) from error
            created = path.exists() and not existed_before
            duration_ms = (time.perf_counter() - start) * 1000.0
            event_payload = {
                "label": label,
                "path": str(path),
                "created": created,
                "existed": existed_before,
                "writable": bool(writable),
            }
            if not writable:
                emit_file_event(
                    "ensure_directory_failed",
                    payload={**event_payload, "status": "error"},
                    duration_ms=duration_ms,
                    level=logging.ERROR,
                )
                raise IngestionError(
                    f"Unable to prepare {label} directory '{path}'. It is not writable. "
                    "Update config/default.json or adjust permissions."
                )
            emit_file_event(
                "ensure_directory",
                payload={**event_payload, "status": "ok"},
                duration_ms=duration_ms,
            )
            LOGGER.debug("Ensured %s path exists and is writable: %s", label, path)
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
        audio_files: Optional[Sequence[Path]] = None,
        slide_files: Optional[Sequence[Path]] = None,
    ) -> LectureRecord:
        """Ingest provided assets and return the resulting lecture record."""

        audio_sources: List[Path] = []
        slide_sources: List[Path] = []

        if audio_file is not None:
            audio_sources.append(audio_file)
        if audio_files:
            audio_sources.extend(list(audio_files))
        if slide_file is not None:
            slide_sources.append(slide_file)
        if slide_files:
            slide_sources.extend(list(slide_files))

        if not audio_sources and not slide_sources:
            raise IngestionError("At least one of audio_file or slide_file must be provided")

        LOGGER.debug(
            "Beginning ingestion run for class='%s', module='%s', lecture='%s' (audio_count=%d, slide_count=%d)",
            class_name,
            module_name,
            lecture_name,
            len(audio_sources),
            len(slide_sources),
        )

        lecture_paths = LecturePaths.build(
            self._config.storage_root,
            class_name,
            module_name,
            lecture_name,
        )
        lecture_paths.ensure()
        LOGGER.debug("Prepared lecture directory tree at %s", lecture_paths.lecture_root)

        class_record = self._ensure_class(class_name)
        module_record = self._ensure_module(class_record.id, module_name)
        lecture_record = self._ensure_lecture(module_record.id, lecture_name, description)

        audio_relative = None
        slide_relative = None
        transcript_relative = None
        slide_bundle_relative = None
        notes_relative = None

        audio_relatives: List[str] = []
        transcript_results: List[TranscriptResult] = []

        if audio_sources:
            if self._transcription_engine is None:
                raise IngestionError("No transcription engine configured for audio ingestion")

            multiple_audio = len(audio_sources) > 1
            for index, source in enumerate(audio_sources, start=1):
                audio_stem_parts = [class_name, module_name, lecture_name, "audio"]
                if multiple_audio:
                    audio_stem_parts.append(f"part-{index:02d}")
                audio_stem = build_asset_stem(*audio_stem_parts)
                LOGGER.debug("Copying uploaded audio file '%s' using stem '%s'", source, audio_stem)
                copied_name = self._copy_asset(source, lecture_paths.raw_dir, audio_stem)
                audio_path = lecture_paths.raw_dir / copied_name
                audio_relatives.append(
                    audio_path.relative_to(self._config.storage_root).as_posix()
                )

                transcript_dir = lecture_paths.transcript_dir
                if multiple_audio:
                    transcript_dir = transcript_dir / f"part-{index:02d}"
                    transcript_dir.mkdir(parents=True, exist_ok=True)

                LOGGER.debug(
                    "Running transcription engine %s on %s",
                    self._transcription_engine.__class__.__name__,
                    audio_path,
                )
                transcript = self._transcription_engine.transcribe(audio_path, transcript_dir)
                transcript_results.append(transcript)

            if transcript_results:
                if multiple_audio:
                    combined_transcript = self._combine_transcripts(
                        transcript_results,
                        lecture_paths.transcript_dir,
                        build_asset_stem(class_name, module_name, lecture_name, "transcript"),
                    )
                    transcript_relative = combined_transcript.relative_to(
                        self._config.storage_root
                    ).as_posix()
                else:
                    transcript_relative = transcript_results[0].text_path.relative_to(
                        self._config.storage_root
                    ).as_posix()
                audio_relative = audio_relatives[0]
                LOGGER.debug(
                    "Transcription finished. Audio stored at %s, transcript at %s",
                    audio_relative,
                    transcript_relative,
                )

        slide_relatives: List[str] = []
        slide_conversions: List[tuple[int, SlideConversionResult]] = []

        if slide_sources:
            if self._slide_converter is None:
                raise IngestionError("No slide converter configured for slideshow ingestion")

            multiple_slides = len(slide_sources) > 1
            for index, source in enumerate(slide_sources, start=1):
                slide_stem_parts = [class_name, module_name, lecture_name, "slides"]
                if multiple_slides:
                    slide_stem_parts.append(f"part-{index:02d}")
                slide_stem = build_asset_stem(*slide_stem_parts)
                LOGGER.debug("Copying uploaded slide deck '%s' using stem '%s'", source, slide_stem)
                copied_name = self._copy_asset(source, lecture_paths.raw_dir, slide_stem)
                slide_path = lecture_paths.raw_dir / copied_name
                slide_relatives.append(
                    slide_path.relative_to(self._config.storage_root).as_posix()
                )

                bundle_dir = lecture_paths.slide_dir
                notes_dir = lecture_paths.notes_dir
                if multiple_slides:
                    bundle_dir = bundle_dir / f"part-{index:02d}"
                    notes_dir = notes_dir / f"part-{index:02d}"

                LOGGER.debug(
                    "Invoking slide converter %s on %s",
                    self._slide_converter.__class__.__name__,
                    slide_path,
                )
                conversion = self._slide_converter.convert(slide_path, bundle_dir, notes_dir)
                slide_conversions.append((index, conversion))

            if slide_conversions:
                if multiple_slides:
                    slide_bundle = self._combine_slide_bundles(
                        slide_conversions,
                        lecture_paths.slide_dir,
                        build_asset_stem(class_name, module_name, lecture_name, "slides"),
                    )
                    slide_bundle_relative = slide_bundle.relative_to(
                        self._config.storage_root
                    ).as_posix()
                    combined_notes = self._combine_slide_notes(
                        slide_conversions,
                        lecture_paths.notes_dir,
                        build_asset_stem(class_name, module_name, lecture_name, "notes"),
                    )
                    notes_relative = combined_notes.relative_to(
                        self._config.storage_root
                    ).as_posix()
                else:
                    conversion = slide_conversions[0][1]
                    slide_bundle_relative = (
                        conversion.bundle_path.relative_to(self._config.storage_root).as_posix()
                    )
                    notes_relative = conversion.markdown_path.relative_to(
                        self._config.storage_root
                    ).as_posix()
                slide_relative = slide_relatives[0]
                LOGGER.debug(
                    "Slide conversion produced bundle at %s with notes %s",
                    slide_bundle_relative,
                    notes_relative,
                )
                LOGGER.debug("Slide source stored at %s", slide_relative)

        self._repository.update_lecture_assets(
            lecture_record.id,
            audio_path=audio_relative,
            slide_path=slide_relative,
            transcript_path=transcript_relative,
            slide_image_dir=slide_bundle_relative,
            notes_path=notes_relative,
        )
        LOGGER.debug(
            "Lecture %s assets updated (audio=%s, slides=%s, transcript=%s, bundle=%s, notes=%s)",
            lecture_record.id,
            audio_relative,
            slide_relative,
            transcript_relative,
            slide_bundle_relative,
            notes_relative,
        )

        refreshed = self._repository.get_lecture(lecture_record.id) or lecture_record
        LOGGER.debug("Ingestion complete for lecture id=%s", refreshed.id)
        return refreshed

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _combine_transcripts(
        self,
        transcripts: Sequence[TranscriptResult],
        output_dir: Path,
        stem: str,
    ) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        combined_name = build_timestamped_name(stem, extension=".txt")
        combined_path = output_dir / combined_name
        total = len(transcripts)
        with combined_path.open("w", encoding="utf-8") as handle:
            for position, result in enumerate(transcripts, start=1):
                text = result.text_path.read_text(encoding="utf-8")
                if position > 1:
                    handle.write("\n\n")
                if total > 1:
                    handle.write(f"## Part {position}\n\n")
                handle.write(text.rstrip())
            handle.write("\n")
        LOGGER.debug("Combined %d transcript parts into %s", total, combined_path)
        return combined_path

    def _combine_slide_bundles(
        self,
        conversions: Sequence[tuple[int, SlideConversionResult]],
        output_dir: Path,
        stem: str,
    ) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        combined_name = build_timestamped_name(stem, extension=".zip")
        combined_path = output_dir / combined_name
        with zipfile.ZipFile(combined_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for index, conversion in conversions:
                part_prefix = f"part_{index:02d}"
                with zipfile.ZipFile(conversion.bundle_path, "r") as part_archive:
                    for item in part_archive.infolist():
                        if item.is_dir():
                            continue
                        data = part_archive.read(item.filename)
                        arcname = f"{part_prefix}/{item.filename.lstrip('/')}"
                        archive.writestr(arcname, data)
        LOGGER.debug(
            "Combined %d slide bundles into %s", len(conversions), combined_path
        )
        return combined_path

    def _combine_slide_notes(
        self,
        conversions: Sequence[tuple[int, SlideConversionResult]],
        output_dir: Path,
        stem: str,
    ) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        combined_name = build_timestamped_name(stem, extension=".md")
        combined_path = output_dir / combined_name
        total = len(conversions)
        with combined_path.open("w", encoding="utf-8") as handle:
            for position, (index, conversion) in enumerate(conversions, start=1):
                content = conversion.markdown_path.read_text(encoding="utf-8")
                if position > 1:
                    handle.write("\n\n")
                if total > 1:
                    handle.write(f"<!-- Part {index:02d} -->\n\n")
                handle.write(content.rstrip())
            handle.write("\n")
        LOGGER.debug("Combined %d slide note files into %s", total, combined_path)
        return combined_path

    def _ensure_class(self, name: str) -> ClassRecord:
        LOGGER.debug("Ensuring class '%s' exists", name)
        existing = self._repository.find_class_by_name(name)
        if existing:
            LOGGER.debug("Reusing existing class '%s' (id=%s)", existing.name, existing.id)
            return existing
        identifier = self._repository.add_class(name)
        record = self._repository.get_class(identifier)
        if record is None:
            raise IngestionError("Failed to create class record")
        LOGGER.debug("Created class '%s' (id=%s)", record.name, record.id)
        return record

    def _ensure_module(self, class_id: int, name: str) -> ModuleRecord:
        LOGGER.debug("Ensuring module '%s' exists for class_id=%s", name, class_id)
        existing = self._repository.find_module_by_name(class_id, name)
        if existing:
            LOGGER.debug(
                "Reusing existing module '%s' (id=%s) for class_id=%s",
                existing.name,
                existing.id,
                class_id,
            )
            return existing
        identifier = self._repository.add_module(class_id, name)
        record = self._repository.get_module(identifier)
        if record is None:
            raise IngestionError("Failed to create module record")
        LOGGER.debug(
            "Created module '%s' (id=%s) for class_id=%s",
            record.name,
            record.id,
            class_id,
        )
        return record

    def _ensure_lecture(self, module_id: int, name: str, description: str) -> LectureRecord:
        LOGGER.debug("Ensuring lecture '%s' exists for module_id=%s", name, module_id)
        existing = self._repository.find_lecture_by_name(module_id, name)
        if existing:
            if description and existing.description != description:
                LOGGER.debug(
                    "Lecture '%s' (id=%s) description differs; updating",
                    existing.name,
                    existing.id,
                )
                self._repository.update_lecture_description(existing.id, description)
                updated = self._repository.get_lecture(existing.id)
                if updated is not None:
                    LOGGER.debug("Lecture '%s' (id=%s) description updated", updated.name, updated.id)
                    return updated
            LOGGER.debug(
                "Reusing existing lecture '%s' (id=%s) for module_id=%s",
                existing.name,
                existing.id,
                module_id,
            )
            return existing
        identifier = self._repository.add_lecture(module_id, name, description)
        record = self._repository.get_lecture(identifier)
        if record is None:
            raise IngestionError("Failed to create lecture record")
        LOGGER.debug(
            "Created lecture '%s' (id=%s) for module_id=%s",
            record.name,
            record.id,
            module_id,
        )
        return record

    def _copy_asset(self, src: Path, destination_dir: Path, stem: str) -> str:
        LOGGER.debug(
            "Copying asset from %s to %s using stem '%s'",
            src,
            destination_dir,
            stem,
        )
        if not src.exists():
            raise IngestionError(f"Asset not found: {src}")
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / build_timestamped_name(stem, extension=src.suffix)
        shutil.copy2(src, destination)
        LOGGER.debug("Asset copied to %s", destination)
        return destination.name

__all__ = [
    "IngestionError",
    "LectureIngestor",
    "LecturePaths",
    "SlideConversionResult",
    "SlideConverter",
    "TranscriptResult",
    "TranscriptionEngine",
]
