from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app.web import create_app
from app.services.storage import LectureRepository


def _create_sample_data(config) -> tuple[LectureRepository, int]:
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
        slide_image_dir="Astronomy/Stellar Physics/Stellar Evolution/slides",
    )
    # Lecture without assets to ensure counts handle missing data
    repository.add_lecture(module_id, "Light Curves")

    transcript_file = config.storage_root / "Astronomy/Stellar Physics/Stellar Evolution/transcript.txt"
    notes_file = config.storage_root / "Astronomy/Stellar Physics/Stellar Evolution/notes.md"
    transcript_file.parent.mkdir(parents=True, exist_ok=True)
    transcript_file.write_text("Line one\nLine two\nLine three\n", encoding="utf-8")
    notes_file.write_text("# Notes\nImportant points.\n", encoding="utf-8")

    return repository, lecture_id


def test_list_classes_reports_asset_counts(temp_config):
    repository, lecture_id = _create_sample_data(temp_config)
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
    repository, lecture_id = _create_sample_data(temp_config)
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
