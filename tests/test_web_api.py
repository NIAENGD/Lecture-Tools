from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app.web import create_app
from app.web import server as web_server
from app.services.storage import LectureRepository
from app.services.ingestion import TranscriptResult


def _create_sample_data(config) -> tuple[LectureRepository, int, int]:
    repository = LectureRepository(config)
    class_id = repository.add_class("Astronomy", "Introduction to the cosmos")
    module_id = repository.add_module(class_id, "Stellar Physics", "Lifecycle of stars")
    lecture_id = repository.add_lecture(
        module_id,
        "Stellar Evolution",
        description="From nebula to white dwarf",
        audio_path="Astronomy/Stellar Physics/Stellar Evolution/audio.mp3",
        slide_path="Astronomy/Stellar Physics/Stellar Evolution/slides.pdf",
        transcript_path="Astronomy/Stellar Physics/Stellar Evolution/transcript.txt",
        notes_path="Astronomy/Stellar Physics/Stellar Evolution/notes.md",
        slide_image_dir="Astronomy/Stellar Physics/Stellar Evolution/slides.zip",
    )
    # Lecture without assets to ensure counts handle missing data
    repository.add_lecture(module_id, "Light Curves")

    base_dir = config.storage_root / "Astronomy/Stellar Physics/Stellar Evolution"
    base_dir.mkdir(parents=True, exist_ok=True)
    transcript_file = base_dir / "transcript.txt"
    notes_file = base_dir / "notes.md"
    audio_file = base_dir / "audio.mp3"
    audio_file.write_bytes(b"audio")
    transcript_file.write_text("Line one\nLine two\nLine three\n", encoding="utf-8")
    notes_file.write_text("# Notes\nImportant points.\n", encoding="utf-8")

    return repository, lecture_id, module_id


def test_list_classes_reports_asset_counts(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get("/api/classes")
    assert response.status_code == 200
    payload = response.json()

    assert payload["stats"]["class_count"] == 1
    assert payload["stats"]["module_count"] == 1
    assert payload["stats"]["lecture_count"] == 2
    assert payload["stats"]["transcript_count"] == 1
    assert payload["stats"]["slide_count"] == 1
    assert payload["stats"]["audio_count"] == 1
    assert payload["stats"]["notes_count"] == 1
    assert payload["stats"]["slide_image_count"] == 1

    class_payload = payload["classes"][0]
    assert class_payload["asset_counts"]["transcripts"] == 1
    assert class_payload["asset_counts"]["slides"] == 1
    assert class_payload["asset_counts"]["audio"] == 1
    assert class_payload["asset_counts"]["notes"] == 1
    assert class_payload["asset_counts"]["slide_images"] == 1

    module_payload = class_payload["modules"][0]
    assert module_payload["asset_counts"]["transcripts"] == 1
    assert module_payload["asset_counts"]["slides"] == 1
    assert module_payload["asset_counts"]["audio"] == 1
    assert module_payload["asset_counts"]["notes"] == 1
    assert module_payload["asset_counts"]["slide_images"] == 1


def test_lecture_preview_includes_transcript_and_notes(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get(f"/api/lectures/{lecture_id}/preview")
    assert response.status_code == 200
    payload = response.json()

    transcript = payload["transcript"]
    notes = payload["notes"]
    assert transcript is not None
    assert "Line one" in transcript["text"]
    assert transcript["line_count"] == 3
    assert transcript["truncated"] is False

    assert notes is not None
    assert notes["text"].startswith("# Notes")
    assert notes["line_count"] == 2


def test_lecture_preview_ignores_paths_outside_storage(temp_config):
    repository = LectureRepository(temp_config)
    class_id = repository.add_class("Security", "")
    module_id = repository.add_module(class_id, "Paths", "")
    lecture_id = repository.add_lecture(
        module_id,
        "Traversal",
        transcript_path="../outside.txt",
    )
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get(f"/api/lectures/{lecture_id}/preview")
    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript"] is None
    assert payload["notes"] is None


def test_create_update_delete_lecture(temp_config):
    repository, _lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        "/api/lectures",
        json={"module_id": module_id, "name": "Spectroscopy", "description": "Intro"},
    )
    assert response.status_code == 201
    lecture_id = response.json()["lecture"]["id"]

    response = client.put(
        f"/api/lectures/{lecture_id}",
        json={"description": "Updated description"},
    )
    assert response.status_code == 200
    assert repository.get_lecture(lecture_id).description == "Updated description"

    response = client.delete(f"/api/lectures/{lecture_id}")
    assert response.status_code == 204
    assert repository.get_lecture(lecture_id) is None


def test_upload_asset_updates_repository(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/assets/notes",
        files={"file": ("summary.docx", b"data", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert response.status_code == 200
    assert response.json()["notes_path"].endswith("summary.docx")
    assert repository.get_lecture(lecture_id).notes_path.endswith("summary.docx")


def test_upload_slides_auto_generates_archive(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(self, slide_path, output_dir, *, page_range=None):
            output_dir.mkdir(parents=True, exist_ok=True)
            archive = output_dir / "slides.zip"
            archive.write_bytes(b"zip")
            return [archive]

    monkeypatch.setattr(web_server, "PyMuPDFSlideConverter", lambda: DummyConverter())

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/assets/slides",
        files={"file": ("deck.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["slide_path"].endswith("deck.pdf")
    assert payload["slide_image_dir"].endswith("slides.zip")
    slide_asset = temp_config.storage_root / payload["slide_image_dir"]
    assert slide_asset.exists()
    updated = repository.get_lecture(lecture_id)
    assert updated.slide_path and updated.slide_path.endswith("deck.pdf")
    assert updated.slide_image_dir and updated.slide_image_dir.endswith("slides.zip")


def test_process_slides_generates_archive(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(self, slide_path, output_dir, *, page_range=None):
            output_dir.mkdir(parents=True, exist_ok=True)
            archive = output_dir / "slides.zip"
            archive.write_bytes(b"zip")
            return [archive]

    monkeypatch.setattr(web_server, "PyMuPDFSlideConverter", lambda: DummyConverter())

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/process-slides",
        data={"page_start": "1", "page_end": "2"},
        files={"file": ("deck.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["slide_image_dir"].endswith("slides.zip")
    slide_asset = temp_config.storage_root / payload["slide_image_dir"]
    assert slide_asset.exists()


def test_transcribe_audio_uses_backend(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyEngine:
        def __init__(self, model: str, download_root: Path) -> None:
            self.model = model
            self.download_root = download_root

        def transcribe(self, audio_path: Path, output_dir: Path) -> TranscriptResult:
            output_dir.mkdir(parents=True, exist_ok=True)
            transcript = output_dir / "auto.txt"
            transcript.write_text("auto", encoding="utf-8")
            return TranscriptResult(text_path=transcript, segments_path=None)

    monkeypatch.setattr(web_server, "FasterWhisperTranscription", DummyEngine)

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/transcribe",
        json={"model": "small"},
    )
    assert response.status_code == 200
    updated = repository.get_lecture(lecture_id)
    assert updated.transcript_path.endswith("auto.txt")


def test_reveal_asset_uses_helper(monkeypatch, temp_config):
    repository, _lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    target_file = temp_config.storage_root / "dummy.txt"
    target_file.write_text("hi", encoding="utf-8")

    calls: dict[str, Any] = {}

    def fake_open(path: Path, *, select: bool = False) -> None:
        calls["path"] = path
        calls["select"] = select

    monkeypatch.setattr(web_server, "_open_in_file_manager", fake_open)

    response = client.post(
        "/api/assets/reveal",
        json={"path": target_file.relative_to(temp_config.storage_root).as_posix(), "select": True},
    )
    assert response.status_code == 204
    assert calls["path"] == target_file.resolve()
    assert calls["select"] is True
