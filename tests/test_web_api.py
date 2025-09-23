from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from app.web import create_app
from app.web import server as web_server
from app.services.storage import LectureRepository
from app.services.ingestion import LecturePaths, TranscriptResult


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
