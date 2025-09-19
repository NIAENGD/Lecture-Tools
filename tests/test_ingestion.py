from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Iterable, Optional
import zipfile

import pytest
from PIL import Image

from app.config import AppConfig
from app.services.ingestion import LectureIngestor, SlideConverter, TranscriptResult, TranscriptionEngine
from app.services.storage import LectureRepository


class DummyTranscriptionEngine(TranscriptionEngine):
    def transcribe(self, audio_path: Path, output_dir: Path) -> TranscriptResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        transcript_file = output_dir / "transcript.txt"
        transcript_file.write_text(f"Transcript for {audio_path.name}", encoding="utf-8")
        segments_file = output_dir / "segments.json"
        segments_file.write_text("[]", encoding="utf-8")
        return TranscriptResult(text_path=transcript_file, segments_path=segments_file)


class DummySlideConverter(SlideConverter):
    def convert(
        self,
        slide_path: Path,
        output_dir: Path,
        *,
        page_range: Optional[tuple[int, int]] = None,
    ) -> Iterable[Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        archive_path = output_dir / "slides.zip"
        image = Image.new("RGB", (100, 200), color=(255, 255, 255))
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("page_001.png", buffer.read())
        return [archive_path]


def test_ingestion_pipeline(temp_config: AppConfig, tmp_path: Path) -> None:
    repository = LectureRepository(temp_config)
    ingestor = LectureIngestor(
        temp_config,
        repository,
        transcription_engine=DummyTranscriptionEngine(),
        slide_converter=DummySlideConverter(),
    )

    audio_source = tmp_path / "lecture.wav"
    audio_source.write_text("dummy audio", encoding="utf-8")
    slide_source = tmp_path / "slides.pdf"
    slide_source.write_text("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", encoding="latin1")

    lecture = ingestor.ingest(
        class_name="Computer Science",
        module_name="Algorithms",
        lecture_name="Sorting",
        audio_file=audio_source,
        slide_file=slide_source,
    )

    assert lecture.audio_path is not None
    assert lecture.transcript_path is not None
    assert lecture.slide_image_dir is not None

    audio_file = temp_config.storage_root / lecture.audio_path
    transcript_file = temp_config.storage_root / lecture.transcript_path
    slide_asset = temp_config.storage_root / lecture.slide_image_dir

    assert audio_file.exists()
    assert transcript_file.exists()
    assert slide_asset.exists()
    with zipfile.ZipFile(slide_asset, "r") as archive:
        assert "page_001.png" in archive.namelist()


def test_ingestion_requires_assets(temp_config: AppConfig) -> None:
    repository = LectureRepository(temp_config)
    ingestor = LectureIngestor(temp_config, repository)

    with pytest.raises(Exception) as exc_info:  # noqa: B017 - broad for behaviour check
        ingestor.ingest(
            class_name="History",
            module_name="Ancient",
            lecture_name="Rome",
        )

    assert "audio_file" in str(exc_info.value)
