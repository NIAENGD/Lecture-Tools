from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import io
import time
import wave
from concurrent.futures import wait

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from app.processing import SlideConversionDependencyError
from app.web import create_app
from app.web import server as web_server
from app.services.storage import LectureRepository
from app.services.ingestion import LecturePaths, TranscriptResult

fitz = pytest.importorskip("fitz")


def _build_sample_pdf(page_count: int = 2) -> bytes:
    document = fitz.open()
    for index in range(page_count):
        page = document.new_page()
        page.insert_text((72, 72 + (index * 18)), f"Sample page {index + 1}")
    buffer = io.BytesIO()
    document.save(buffer)
    document.close()
    return buffer.getvalue()


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
    slide_file = base_dir / "slides.pdf"
    audio_file.write_bytes(b"audio")
    transcript_file.write_text("Line one\nLine two\nLine three\n", encoding="utf-8")
    notes_file.write_text("# Notes\nImportant points.\n", encoding="utf-8")
    slide_file.write_bytes(_build_sample_pdf(3))

    return repository, lecture_id, module_id


def _build_wav_bytes(duration_seconds: float = 0.25, sample_rate: int = 16_000) -> bytes:
    frame_count = int(sample_rate * duration_seconds)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        silence = b"\x00\x00" * frame_count
        handle.writeframes(silence)
    return buffer.getvalue()


def _wait_for_audio_mastering(app, timeout: float = 5.0) -> None:
    jobs = getattr(app.state, "audio_mastering_jobs", None)
    lock = getattr(app.state, "audio_mastering_jobs_lock", None)
    if jobs is None or lock is None:
        return
    deadline = time.time() + timeout
    while True:
        with lock:
            pending = list(jobs)
        if not pending:
            return
        remaining = deadline - time.time()
        if remaining <= 0:
            break
        wait(pending, timeout=min(0.2, remaining))
    raise AssertionError("Audio mastering jobs did not finish before timeout")


def test_api_handles_configured_root_path(temp_config):
    repository, _lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config, root_path="/lecture")
    client = TestClient(app)

    response = client.get("/lecture/api/classes")
    assert response.status_code == 200


def test_index_injects_configured_root_path(temp_config):
    repository, _lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config, root_path="/lecture")
    client = TestClient(app)

    response = client.get("/lecture/")
    assert response.status_code == 200
    assert "__LECTURE_TOOLS_ROOT_PATH__" not in response.text
    assert 'window.__LECTURE_TOOLS_SERVER_ROOT_PATH__ = "/lecture";' in response.text


def test_index_injects_empty_root_path(temp_config):
    repository, _lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get("/")
    assert response.status_code == 200
    assert (
        'window.__LECTURE_TOOLS_SERVER_ROOT_PATH__ = "__LECTURE_TOOLS_ROOT_PATH__";'
        in response.text
    )


def test_api_honors_forwarded_prefix_header(temp_config):
    repository, _lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get(
        "/lecture/api/classes",
        headers={"X-Forwarded-Prefix": "/lecture"},
    )
    assert response.status_code == 200


def test_cors_preflight_is_supported(temp_config):
    repository, _lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.options(
        "/api/classes",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    allow_origin = response.headers.get("access-control-allow-origin")
    allow_methods = response.headers.get("access-control-allow-methods", "")
    allow_headers = response.headers.get("access-control-allow-headers", "")

    assert allow_origin == "*"
    assert "POST" in allow_methods
    assert "content-type" in allow_headers.lower()


def test_static_storage_respects_root_path(temp_config):
    repository = LectureRepository(temp_config)
    sample_file = temp_config.storage_root / "hello.txt"
    sample_file.write_text("hi", encoding="utf-8")

    app = create_app(repository, config=temp_config, root_path="/lecture")
    client = TestClient(app)

    response = client.get("/lecture/storage/hello.txt")
    assert response.status_code == 200
    assert response.text == "hi"


def test_spa_fallback_respects_root_path(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config, root_path="/lecture")
    client = TestClient(app)

    response = client.get("/lecture/overview")
    assert response.status_code == 200
    assert "<!DOCTYPE html>" in response.text


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

    lecture_record = repository.get_lecture(lecture_id)
    assert lecture_record is not None
    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_record = repository.get_class(module_record.class_id)
    assert class_record is not None

    lecture_paths = LecturePaths.build(
        temp_config.storage_root,
        class_record.name,
        module_record.name,
        lecture_record.name,
    )
    lecture_paths.ensure()
    (lecture_paths.raw_dir / "sample.txt").write_text("data", encoding="utf-8")

    legacy_dir = (
        temp_config.storage_root
        / class_record.name
        / module_record.name
        / lecture_record.name
    )
    legacy_dir.mkdir(parents=True, exist_ok=True)
    (legacy_dir / "legacy.txt").write_text("legacy", encoding="utf-8")

    response = client.delete(f"/api/lectures/{lecture_id}")
    assert response.status_code == 204
    assert repository.get_lecture(lecture_id) is None
    assert not lecture_paths.lecture_root.exists()
    assert not legacy_dir.exists()


def test_reorder_endpoint_moves_lecture(temp_config):
    repository, lecture_id, module_id = _create_sample_data(temp_config)
    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_id = module_record.class_id

    lectures = list(repository.iter_lectures(module_id))
    assert len(lectures) == 2
    other_lecture_id = next(lecture.id for lecture in lectures if lecture.id != lecture_id)

    other_module_id = repository.add_module(class_id, "Cosmology")

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        "/api/lectures/reorder",
        json={
            "modules": [
                {"module_id": module_id, "lecture_ids": [other_lecture_id]},
                {"module_id": other_module_id, "lecture_ids": [lecture_id]},
            ]
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert "modules" in payload

    remaining = [lecture.id for lecture in repository.iter_lectures(module_id)]
    moved = [lecture.id for lecture in repository.iter_lectures(other_module_id)]

    assert remaining == [other_lecture_id]
    assert moved == [lecture_id]


def test_export_import_archive(temp_config):
    repository, lecture_id, module_id = _create_sample_data(temp_config)
    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_id = module_record.class_id

    lectures = list(repository.iter_lectures(module_id))
    lecture_names = {lecture.id: lecture.name for lecture in lectures}

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    export_response = client.post("/api/settings/export")
    assert export_response.status_code == 200
    archive_info = export_response.json()["archive"]
    archive_path = temp_config.storage_root / archive_info["path"]
    assert archive_path.exists()

    # Remove data before import
    repository.remove_class(class_id)
    assert not list(repository.iter_classes())

    with archive_path.open("rb") as handle:
        import_response = client.post(
            "/api/settings/import",
            data={"mode": "replace"},
            files={"file": ("export.zip", handle, "application/zip")},
        )
    assert import_response.status_code == 200
    replace_payload = import_response.json()["import"]
    assert replace_payload["mode"] == "replace"
    assert replace_payload["lectures"] >= 1

    restored_class = repository.find_class_by_name("Astronomy")
    assert restored_class is not None
    restored_module = repository.find_module_by_name(restored_class.id, "Stellar Physics")
    assert restored_module is not None
    restored_lectures = list(repository.iter_lectures(restored_module.id))
    restored_names = {lecture.name for lecture in restored_lectures}
    assert set(lecture_names.values()).issubset(restored_names)

    transcript_file = (
        temp_config.storage_root
        / "Astronomy"
        / "Stellar Physics"
        / "Stellar Evolution"
        / "transcript.txt"
    )
    assert transcript_file.exists()

    removed_name = lecture_names[lecture_id]
    repository.remove_lecture(lecture_id)
    assert removed_name not in {lecture.name for lecture in repository.iter_lectures(restored_module.id)}

    with archive_path.open("rb") as handle:
        merge_response = client.post(
            "/api/settings/import",
            data={"mode": "merge"},
            files={"file": ("export.zip", handle, "application/zip")},
        )
    assert merge_response.status_code == 200
    merge_payload = merge_response.json()["import"]
    assert merge_payload["mode"] == "merge"

    merged_names = {lecture.name for lecture in repository.iter_lectures(restored_module.id)}
    assert removed_name in merged_names
def test_delete_module_removes_storage(temp_config):
    repository, _lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_record = repository.get_class(module_record.class_id)
    assert class_record is not None

    slug_module_dir = LecturePaths.build(
        temp_config.storage_root,
        class_record.name,
        module_record.name,
        "Placeholder",
    ).lecture_root.parent
    slug_module_dir.mkdir(parents=True, exist_ok=True)
    (slug_module_dir / "slug.txt").write_text("slug", encoding="utf-8")

    legacy_module_dir = temp_config.storage_root / class_record.name / module_record.name
    legacy_module_dir.mkdir(parents=True, exist_ok=True)
    (legacy_module_dir / "legacy.txt").write_text("legacy", encoding="utf-8")

    response = client.delete(f"/api/modules/{module_id}")
    assert response.status_code == 204
    assert repository.get_module(module_id) is None
    assert not slug_module_dir.exists()
    assert not legacy_module_dir.exists()


def test_delete_class_removes_storage(temp_config):
    repository, _lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_record = repository.get_class(module_record.class_id)
    assert class_record is not None

    slug_class_dir = LecturePaths.build(
        temp_config.storage_root,
        class_record.name,
        module_record.name,
        "Placeholder",
    ).lecture_root.parent.parent
    slug_class_dir.mkdir(parents=True, exist_ok=True)
    (slug_class_dir / "slug.txt").write_text("slug", encoding="utf-8")

    legacy_class_dir = temp_config.storage_root / class_record.name
    legacy_class_dir.mkdir(parents=True, exist_ok=True)
    (legacy_class_dir / "legacy.txt").write_text("legacy", encoding="utf-8")

    response = client.delete(f"/api/classes/{class_record.id}")
    assert response.status_code == 204
    assert repository.get_class(class_record.id) is None
    assert not slug_class_dir.exists()
    assert not legacy_class_dir.exists()


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


def test_upload_audio_processes_file(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    monkeypatch.setattr(web_server, "ffmpeg_available", lambda: True)

    response = client.post(
        f"/api/lectures/{lecture_id}/assets/audio",
        files={"file": ("lecture.wav", _build_wav_bytes(), "audio/wav")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("processing") is True
    audio_relative = payload["audio_path"]
    assert audio_relative.endswith("lecture.wav")
    assert payload.get("processed_audio_path") is None
    raw_file = temp_config.storage_root / audio_relative
    assert raw_file.exists()

    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.audio_path == audio_relative
    assert updated.processed_audio_path is None

    _wait_for_audio_mastering(app)

    refreshed = repository.get_lecture(lecture_id)
    assert refreshed is not None
    assert refreshed.audio_path and refreshed.audio_path.endswith("-master.wav")
    assert refreshed.processed_audio_path == refreshed.audio_path
    processed_file = temp_config.storage_root / refreshed.processed_audio_path
    assert processed_file.exists()

    progress_response = client.get(
        f"/api/lectures/{lecture_id}/processing-progress"
    )
    assert progress_response.status_code == 200
    progress_payload = progress_response.json().get("progress", {})
    assert progress_payload.get("finished") is True
    assert "Audio mastering" in (progress_payload.get("message") or "")


def test_upload_audio_converts_non_wav(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    monkeypatch.setattr(web_server, "ffmpeg_available", lambda: True)

    def fake_ensure_wav(path, *, output_dir, stem, timestamp):
        destination = output_dir / f"{stem}-converted.wav"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(_build_wav_bytes())
        return destination, True

    monkeypatch.setattr(web_server, "ensure_wav", fake_ensure_wav)

    response = client.post(
        f"/api/lectures/{lecture_id}/assets/audio",
        files={"file": ("lecture.mp3", b"id3", "audio/mpeg")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("processing") is True
    assert payload["audio_path"].endswith("-converted.wav")
    assert payload.get("processed_audio_path") is None
    wav_path = temp_config.storage_root / payload["audio_path"]
    assert wav_path.exists()
    assert not (wav_path.parent / "lecture.mp3").exists()

    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.audio_path and updated.audio_path.endswith("-converted.wav")
    assert updated.processed_audio_path is None

    _wait_for_audio_mastering(app)

    refreshed = repository.get_lecture(lecture_id)
    assert refreshed is not None
    assert refreshed.audio_path and refreshed.audio_path.endswith("-converted-master.wav")
    assert refreshed.processed_audio_path == refreshed.audio_path


def test_upload_audio_requires_ffmpeg(monkeypatch, temp_config):
    repository, _existing_lecture_id, module_id = _create_sample_data(temp_config)
    lecture_id = repository.add_lecture(module_id, "FFmpeg Check")
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    monkeypatch.setattr(web_server, "ffmpeg_available", lambda: False)

    response = client.post(
        f"/api/lectures/{lecture_id}/assets/audio",
        files={"file": ("lecture.mp3", b"id3", "audio/mpeg")},
    )
    assert response.status_code == 503
    assert "FFmpeg" in response.json().get("detail", "")

    lecture = repository.get_lecture(lecture_id)
    assert lecture is not None
    assert lecture.audio_path is None

    module = repository.get_module(module_id)
    class_record = repository.get_class(module.class_id) if module else None
    assert module is not None and class_record is not None
    lecture_paths = LecturePaths.build(
        temp_config.storage_root,
        class_record.name,
        module.name,
        "FFmpeg Check",
    )
    assert not any(lecture_paths.raw_dir.iterdir())

def test_delete_asset_clears_path_and_file(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    target_file = temp_config.storage_root / "notes" / "summary.txt"
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("notes", encoding="utf-8")
    relative_path = target_file.relative_to(temp_config.storage_root).as_posix()

    repository.update_lecture_assets(lecture_id, notes_path=relative_path)

    response = client.delete(f"/api/lectures/{lecture_id}/assets/notes")

    assert response.status_code == 200
    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.notes_path is None
    assert not target_file.exists()


def test_delete_audio_asset_removes_processed_audio(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    audio_file = temp_config.storage_root / "audio" / "lecture.wav"
    audio_file.parent.mkdir(parents=True, exist_ok=True)
    audio_file.write_bytes(b"raw")
    processed_file = temp_config.storage_root / "audio" / "lecture-master.wav"
    processed_file.parent.mkdir(parents=True, exist_ok=True)
    processed_file.write_bytes(b"processed")

    repository.update_lecture_assets(
        lecture_id,
        audio_path=audio_file.relative_to(temp_config.storage_root).as_posix(),
        processed_audio_path=processed_file.relative_to(temp_config.storage_root).as_posix(),
    )

    response = client.delete(f"/api/lectures/{lecture_id}/assets/audio")

    assert response.status_code == 200
    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.audio_path is None
    assert updated.processed_audio_path is None
    assert not audio_file.exists()
    assert not processed_file.exists()


def test_delete_slides_asset_removes_related_files(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    slide_file = temp_config.storage_root / "slides" / "deck.pdf"
    slide_file.parent.mkdir(parents=True, exist_ok=True)
    slide_file.write_bytes(b"pdf")

    image_dir = temp_config.storage_root / "slides" / "deck-images"
    image_dir.mkdir(parents=True, exist_ok=True)
    (image_dir / "page-1.png").write_bytes(b"image")

    repository.update_lecture_assets(
        lecture_id,
        slide_path=slide_file.relative_to(temp_config.storage_root).as_posix(),
        slide_image_dir=image_dir.relative_to(temp_config.storage_root).as_posix(),
    )

    response = client.delete(f"/api/lectures/{lecture_id}/assets/slides")

    assert response.status_code == 200
    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.slide_path is None
    assert updated.slide_image_dir is None
    assert not slide_file.exists()
    assert not image_dir.exists()


def test_upload_audio_respects_mastering_setting(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    settings_response = client.get("/api/settings")
    assert settings_response.status_code == 200
    settings_payload = settings_response.json().get("settings", {})
    settings_payload["audio_mastering_enabled"] = False

    update_response = client.put("/api/settings", json=settings_payload)
    assert update_response.status_code == 200

    response = client.post(
        f"/api/lectures/{lecture_id}/assets/audio",
        files={"file": ("lecture.wav", _build_wav_bytes(), "audio/wav")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("processing") is False
    assert payload.get("processed_audio_path") is None
    assert payload["audio_path"].endswith("lecture.wav")
    audio_file = temp_config.storage_root / payload["audio_path"]
    assert audio_file.exists()

    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.processed_audio_path is None
    assert updated.audio_path and updated.audio_path.endswith("lecture.wav")


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
    assert payload["slide_path"].endswith(".pdf")
    assert payload["slide_image_dir"].endswith("slides.zip")
    slide_asset = temp_config.storage_root / payload["slide_image_dir"]
    assert slide_asset.exists()
    updated = repository.get_lecture(lecture_id)
    assert updated.slide_path and updated.slide_path.endswith("deck.pdf")
    assert updated.slide_image_dir and updated.slide_image_dir.endswith("slides.zip")


def test_upload_slides_gracefully_handles_missing_converter(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            output_dir,
            *,
            page_range=None,
            progress_callback=None,
        ):  # noqa: ARG002
            raise SlideConversionDependencyError("PyMuPDF (fitz) is not installed")

    monkeypatch.setattr(web_server, "PyMuPDFSlideConverter", lambda: DummyConverter())

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/assets/slides",
        files={"file": ("deck.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["slide_path"].endswith(".pdf")
    assert payload.get("slide_image_dir") is None


def test_process_slides_generates_archive(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            output_dir,
            *,
            page_range=None,
            progress_callback=None,
        ):
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


def test_slide_preview_lifecycle(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/slides/previews",
        files={"file": ("deck.pdf", _build_sample_pdf(2), "application/pdf")},
    )
    assert response.status_code == 201
    payload = response.json()
    preview_id = payload["preview_id"]
    preview_url = payload["preview_url"]
    assert payload["page_count"] == 2

    lecture_paths = LecturePaths.build(
        temp_config.storage_root,
        "Astronomy",
        "Stellar Physics",
        "Stellar Evolution",
    )
    preview_dir = lecture_paths.raw_dir / ".previews"
    stored_files = list(preview_dir.iterdir())
    assert stored_files
    assert preview_id in stored_files[0].name

    preview_response = client.get(preview_url)
    assert preview_response.status_code == 200
    assert preview_response.headers["content-type"].startswith("application/pdf")

    delete_response = client.delete(preview_url)
    assert delete_response.status_code == 204
    assert not preview_dir.exists() or not any(preview_dir.iterdir())


def test_slide_preview_metadata(temp_config, monkeypatch):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/slides/previews",
        files={"file": ("deck.pdf", _build_sample_pdf(4), "application/pdf")},
    )
    assert response.status_code == 201
    payload = response.json()
    preview_id = payload["preview_id"]
    assert payload["page_count"] == 4

    called_with = {}

    def fake_get_pdf_page_count(path):
        called_with["path"] = path
        return 7

    monkeypatch.setattr(web_server, "get_pdf_page_count", fake_get_pdf_page_count)

    metadata_response = client.get(
        f"/api/lectures/{lecture_id}/slides/previews/{preview_id}/metadata"
    )
    assert metadata_response.status_code == 200
    assert metadata_response.json() == {"page_count": 7}
    assert "path" in called_with


def test_slide_preview_metadata_dependency_error(temp_config, monkeypatch):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/slides/previews",
        files={"file": ("deck.pdf", _build_sample_pdf(1), "application/pdf")},
    )
    assert response.status_code == 201
    preview_payload = response.json()
    preview_id = preview_payload["preview_id"]
    assert preview_payload["page_count"] == 1

    def fake_get_pdf_page_count(_path):
        raise SlideConversionDependencyError("PyMuPDF (fitz) is not installed")

    monkeypatch.setattr(web_server, "get_pdf_page_count", fake_get_pdf_page_count)

    metadata_response = client.get(
        f"/api/lectures/{lecture_id}/slides/previews/{preview_id}/metadata"
    )
    assert metadata_response.status_code == 503
    assert "PyMuPDF" in metadata_response.json()["detail"]


def test_slide_preview_upload_timeout_fallback(temp_config, monkeypatch):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    monkeypatch.setattr(web_server, "_PDF_PAGE_COUNT_TIMEOUT_SECONDS", 0.05)

    def hanging_get_pdf_page_count(_path):
        time.sleep(0.2)
        return 99

    monkeypatch.setattr(web_server, "get_pdf_page_count", hanging_get_pdf_page_count)

    start = time.perf_counter()
    response = client.post(
        f"/api/lectures/{lecture_id}/slides/previews",
        files={"file": ("deck.pdf", _build_sample_pdf(2), "application/pdf")},
    )
    duration = time.perf_counter() - start

    assert response.status_code == 201
    assert response.json()["page_count"] is None
    assert duration < 0.5


def test_slide_preview_metadata_timeout(temp_config, monkeypatch):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    creation_response = client.post(
        f"/api/lectures/{lecture_id}/slides/previews",
        files={"file": ("deck.pdf", _build_sample_pdf(1), "application/pdf")},
    )
    assert creation_response.status_code == 201
    preview_id = creation_response.json()["preview_id"]

    monkeypatch.setattr(web_server, "_PDF_PAGE_COUNT_TIMEOUT_SECONDS", 0.05)

    def hanging_get_pdf_page_count(_path):
        time.sleep(0.2)
        return 42

    monkeypatch.setattr(web_server, "get_pdf_page_count", hanging_get_pdf_page_count)

    start = time.perf_counter()
    metadata_response = client.get(
        f"/api/lectures/{lecture_id}/slides/previews/{preview_id}/metadata"
    )
    duration = time.perf_counter() - start

    assert metadata_response.status_code == 503
    assert metadata_response.json()["detail"] == "Slide preview inspection timed out"
    assert duration < 0.5


def test_slide_preview_page_image(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/slides/previews",
        files={"file": ("deck.pdf", _build_sample_pdf(3), "application/pdf")},
    )
    assert response.status_code == 201
    preview_payload = response.json()
    preview_id = preview_payload["preview_id"]
    assert preview_payload["page_count"] == 3

    image_response = client.get(
        f"/api/lectures/{lecture_id}/slides/previews/{preview_id}/pages/2"
    )
    assert image_response.status_code == 200
    assert image_response.headers["content-type"].startswith("image/png")
    assert len(image_response.content) > 1000


def test_progress_queue_endpoint(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    tracker = app.state.progress_tracker
    tracker.start(lecture_id, context={"operation": "transcription", "model": "base"})

    client = TestClient(app)

    response = client.get("/api/progress")
    assert response.status_code == 200
    entries = response.json()["entries"]
    assert entries
    assert entries[0]["lecture"]["id"] == lecture_id

    delete_response = client.delete(f"/api/progress/{lecture_id}?type=transcription")
    assert delete_response.status_code == 204

    follow_up = client.get("/api/progress")
    assert follow_up.status_code == 200
    assert follow_up.json()["entries"] == []


def test_process_slides_with_preview_token(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            output_dir,
            *,
            page_range=None,
            progress_callback=None,
        ):
            output_dir.mkdir(parents=True, exist_ok=True)
            archive = output_dir / "slides.zip"
            archive.write_bytes(b"zip")
            return [archive]

    monkeypatch.setattr(web_server, "PyMuPDFSlideConverter", lambda: DummyConverter())

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    preview = client.post(
        f"/api/lectures/{lecture_id}/slides/previews",
        files={"file": ("deck.pdf", b"%PDF-1.4\n", "application/pdf")},
    )
    assert preview.status_code == 201
    preview_payload = preview.json()
    preview_id = preview_payload["preview_id"]
    assert "page_count" in preview_payload

    response = client.post(
        f"/api/lectures/{lecture_id}/process-slides",
        data={"preview_token": preview_id, "page_start": "1", "page_end": "1"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["slide_image_dir"].endswith("slides.zip")

    slide_path = temp_config.storage_root / payload["slide_path"]
    assert slide_path.exists()
    assert slide_path.read_bytes().startswith(b"%PDF")

    lecture_paths = LecturePaths.build(
        temp_config.storage_root,
        "Astronomy",
        "Stellar Physics",
        "Stellar Evolution",
    )
    preview_dir = lecture_paths.raw_dir / ".previews"
    assert not preview_dir.exists() or not any(preview_dir.iterdir())


def test_process_slides_gracefully_handles_missing_converter(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            output_dir,
            *,
            page_range=None,
            progress_callback=None,
        ):  # noqa: ARG002
            raise SlideConversionDependencyError("PyMuPDF (fitz) is not installed")

    monkeypatch.setattr(web_server, "PyMuPDFSlideConverter", lambda: DummyConverter())

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/process-slides",
        files={"file": ("deck.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["slide_path"].endswith(".pdf")
    assert payload.get("slide_image_dir") is None


def test_transcribe_audio_uses_backend(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    store = web_server.SettingsStore(temp_config)
    settings = web_server.UISettings()
    settings.whisper_compute_type = "float16"
    settings.whisper_beam_size = 7
    store.save(settings)

    captured: dict[str, Any] = {}

    class DummyEngine:
        def __init__(
            self,
            model: str,
            *,
            download_root: Path,
            compute_type: str,
            beam_size: int,
        ) -> None:
            captured["model"] = model
            captured["download_root"] = download_root
            captured["compute_type"] = compute_type
            captured["beam_size"] = beam_size

        def transcribe(
            self,
            audio_path: Path,
            output_dir: Path,
            *,
            progress_callback=None,
        ) -> TranscriptResult:
            output_dir.mkdir(parents=True, exist_ok=True)
            transcript = output_dir / "auto.txt"
            transcript.write_text("auto", encoding="utf-8")
            if progress_callback is not None:
                progress_callback(1.0, 2.0, "====> mock progress")
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
    assert captured["model"] == "small"
    assert captured["download_root"] == temp_config.assets_root
    assert captured["compute_type"] == "float16"
    assert captured["beam_size"] == 7


def test_transcription_progress_endpoint_defaults(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get("/api/lectures/999/transcription-progress")
    assert response.status_code == 200
    progress = response.json()["progress"]
    assert progress["active"] is False
    assert progress["finished"] is False


def test_gpu_status_endpoint_handles_unavailable(monkeypatch, temp_config):
    monkeypatch.setattr(web_server, "check_gpu_whisper_availability", None)
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get("/api/settings/whisper-gpu/status")
    assert response.status_code == 200
    status = response.json()["status"]
    assert status["unavailable"] is True
    assert status["supported"] is False


def test_gpu_test_endpoint_returns_probe(monkeypatch, temp_config):
    def fake_probe(_root):
        return {"supported": True, "message": "ready", "output": "Using GPU"}

    monkeypatch.setattr(web_server, "check_gpu_whisper_availability", fake_probe)
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post("/api/settings/whisper-gpu/test")
    assert response.status_code == 200
    status = response.json()["status"]
    assert status["supported"] is True
    assert status["message"] == "ready"


def test_update_settings_rejects_gpu_without_support(monkeypatch, temp_config):
    def fake_probe(_root):
        return {"supported": False, "message": "unsupported", "output": ""}

    monkeypatch.setattr(web_server, "check_gpu_whisper_availability", fake_probe)
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.put(
        "/api/settings",
        json={
            "theme": "light",
            "language": "en",
            "whisper_model": "gpu",
            "whisper_compute_type": "float16",
            "whisper_beam_size": 5,
            "slide_dpi": 200,
        },
    )
    assert response.status_code == 400


def test_transcribe_audio_falls_back_when_gpu_unsupported(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    store = web_server.SettingsStore(temp_config)
    settings = web_server.UISettings()
    settings.whisper_model = "gpu"
    store.save(settings)

    captured_models: list[str] = []

    class DummyEngine:
        def __init__(
            self,
            model: str,
            *,
            download_root: Path,
            compute_type: str,
            beam_size: int,
        ) -> None:
            captured_models.append(model)
            if model == "gpu":
                raise web_server.GPUWhisperUnsupportedError("unsupported")
            self._model = model

        def transcribe(
            self,
            audio_path: Path,
            output_dir: Path,
            *,
            progress_callback=None,
        ) -> TranscriptResult:
            if progress_callback is not None:
                progress_callback(0.5, 1.0, "====> halfway")
            output_dir.mkdir(parents=True, exist_ok=True)
            transcript = output_dir / "auto.txt"
            transcript.write_text("auto", encoding="utf-8")
            return TranscriptResult(text_path=transcript, segments_path=None)

    monkeypatch.setattr(web_server, "FasterWhisperTranscription", DummyEngine)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/transcribe",
        json={"model": "gpu"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["fallback_model"] == "base"
    assert "fallback_reason" in payload
    assert captured_models == ["gpu", "base"]
def test_get_settings_coerces_invalid_choices(temp_config):
    repository = LectureRepository(temp_config)
    settings_path = temp_config.storage_root / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(
        json.dumps(
            {
                "theme": "dark",
                "language": "xx",
                "whisper_model": "giant",
                "whisper_compute_type": "int8",
                "whisper_beam_size": 4,
                "slide_dpi": 180,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get("/api/settings")
    assert response.status_code == 200
    payload = response.json()["settings"]
    assert payload["whisper_model"] == "base"
    assert payload["slide_dpi"] == 200
    assert payload["language"] == "en"
    assert payload["audio_mastering_enabled"] is True


def test_update_settings_enforces_choices(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    valid_payload = {
        "theme": "light",
        "language": "fr",
        "whisper_model": "small",
        "whisper_compute_type": "float16",
        "whisper_beam_size": 6,
        "slide_dpi": 300,
    }

    response = client.put("/api/settings", json=valid_payload)
    assert response.status_code == 200
    payload = response.json()["settings"]
    assert payload["whisper_model"] == "small"
    assert payload["slide_dpi"] == 300
    assert payload["language"] == "fr"

    invalid_model = client.put(
        "/api/settings",
        json={**valid_payload, "whisper_model": "giant"},
    )
    assert invalid_model.status_code == 422

    invalid_dpi = client.put(
        "/api/settings",
        json={**valid_payload, "slide_dpi": 180},
    )
    assert invalid_dpi.status_code == 422

    invalid_language = client.put(
        "/api/settings",
        json={**valid_payload, "language": "de"},
    )
    assert invalid_language.status_code == 422


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
