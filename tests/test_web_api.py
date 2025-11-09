from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path
from typing import Any

import io
import time
import sys
import wave
from concurrent.futures import ThreadPoolExecutor, wait

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from app.processing import SlideConversionDependencyError
from app.services.ingestion import SlideConversionResult
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


def _prepare_canonical_lecture(
    repository: LectureRepository,
    config,
    lecture_id: int,
    module_id: int,
):
    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_record = repository.get_class(module_record.class_id)
    assert class_record is not None
    lecture_record = repository.get_lecture(lecture_id)
    assert lecture_record is not None

    lecture_paths = LecturePaths.build(
        config.storage_root,
        class_record.name,
        module_record.name,
        lecture_record.name,
    )
    lecture_paths.ensure()

    canonical_audio = lecture_paths.raw_dir / "audio.mp3"
    canonical_transcript = lecture_paths.transcript_dir / "transcript.txt"
    canonical_notes = lecture_paths.notes_dir / "notes.md"
    canonical_slide = lecture_paths.raw_dir / "slides.pdf"
    canonical_bundle = lecture_paths.lecture_root / "slides.zip"

    canonical_audio.write_bytes(b"canonical-audio")
    canonical_transcript.write_text("transcript", encoding="utf-8")
    canonical_notes.write_text("# notes", encoding="utf-8")
    canonical_slide.write_bytes(b"slide")
    canonical_bundle.write_bytes(b"bundle")

    repository.update_lecture_assets(
        lecture_id,
        audio_path=canonical_audio.relative_to(config.storage_root).as_posix(),
        slide_path=canonical_slide.relative_to(config.storage_root).as_posix(),
        transcript_path=canonical_transcript.relative_to(config.storage_root).as_posix(),
        notes_path=canonical_notes.relative_to(config.storage_root).as_posix(),
        slide_image_dir=canonical_bundle.relative_to(config.storage_root).as_posix(),
    )

    return (
        class_record,
        module_record,
        lecture_record,
        lecture_paths,
        {
            "audio": canonical_audio,
            "transcript": canonical_transcript,
            "notes": canonical_notes,
            "slides_pdf": canonical_slide,
            "bundle": canonical_bundle,
        },
    )


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

def _wait_for_background_jobs(app, timeout: float = 5.0) -> None:
    jobs = getattr(app.state, "background_jobs", None)
    lock = getattr(app.state, "background_jobs_lock", None)
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


def test_storage_endpoints_recover_missing_root(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    shutil.rmtree(temp_config.storage_root, ignore_errors=True)
    assert not temp_config.storage_root.exists()

    usage_response = client.get("/api/storage/usage")
    assert usage_response.status_code == 200
    assert temp_config.storage_root.exists()
    usage_payload = usage_response.json()
    assert usage_payload["usage"]["used"] >= 0
    storage_summary = usage_payload.get("storage") or {}
    assert storage_summary.get("size") == 0
    assert isinstance(storage_summary.get("largest"), list)

    listing_response = client.get("/api/storage/list")
    assert listing_response.status_code == 200
    payload = listing_response.json()
    assert payload.get("path") == ""
    assert payload.get("entries") == []


def test_storage_listing_and_delete_orphan_directory(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    orphan_dir = temp_config.storage_root / "orphan"
    orphan_dir.mkdir(parents=True, exist_ok=True)
    (orphan_dir / "note.txt").write_text("orphan", encoding="utf-8")

    root_listing = client.get("/api/storage/list")
    assert root_listing.status_code == 200
    entries = root_listing.json().get("entries", [])
    orphan_entry = next((entry for entry in entries if entry.get("path") == "orphan"), None)
    assert orphan_entry is not None
    assert orphan_entry.get("is_dir") is True

    nested_listing = client.get("/api/storage/list", params={"path": orphan_entry["path"]})
    assert nested_listing.status_code == 200
    nested_entries = nested_listing.json().get("entries", [])
    assert any(item.get("name") == "note.txt" for item in nested_entries)

    delete_response = client.request("DELETE", "/api/storage", json={"path": orphan_entry["path"]})
    assert delete_response.status_code == 200
    assert delete_response.json().get("status") == "deleted"
    assert not orphan_dir.exists()

    refreshed_listing = client.get("/api/storage/list")
    assert refreshed_listing.status_code == 200
    refreshed_entries = refreshed_listing.json().get("entries", [])
    assert all(entry.get("path") != orphan_entry["path"] for entry in refreshed_entries)


def test_storage_usage_reports_directory_summary(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    base = temp_config.storage_root
    big_dir = base / "alpha"
    big_dir.mkdir(parents=True, exist_ok=True)
    (big_dir / "big.bin").write_bytes(b"a" * 2048)
    (base / "beta.txt").write_bytes(b"hello world")
    small_dir = base / "gamma"
    small_dir.mkdir(parents=True, exist_ok=True)
    (small_dir / "tiny.bin").write_bytes(b"b" * 16)

    usage_response = client.get("/api/storage/usage")
    assert usage_response.status_code == 200
    payload = usage_response.json()
    storage_summary = payload.get("storage") or {}
    assert storage_summary.get("size", 0) >= 2048 + len("hello world") + 16
    largest = storage_summary.get("largest") or []
    assert isinstance(largest, list) and largest
    paths = {entry.get("path"): entry for entry in largest}
    alpha_entry = paths.get("alpha")
    assert alpha_entry is not None
    assert alpha_entry.get("is_dir") is True
    assert alpha_entry.get("size", 0) >= 2048
    assert "beta.txt" in paths


def test_storage_batch_download_creates_archive(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    first_file = temp_config.storage_root / "audio" / "lecture.wav"
    first_file.parent.mkdir(parents=True, exist_ok=True)
    first_file.write_text("audio", encoding="utf-8")

    second_dir = temp_config.storage_root / "slides"
    second_dir.mkdir(parents=True, exist_ok=True)
    second_file = second_dir / "deck.pdf"
    second_file.write_text("pdf", encoding="utf-8")

    payload = {
        "paths": [
            first_file.relative_to(temp_config.storage_root).as_posix(),
            "slides",
        ]
    }

    response = client.post("/api/storage/download", json=payload)
    assert response.status_code == 200
    archive_info = response.json()["archive"]
    archive_path = temp_config.storage_root / archive_info["path"]
    assert archive_path.exists()

    with zipfile.ZipFile(archive_path, "r") as bundle:
        names = set(bundle.namelist())
        assert f"storage/{first_file.relative_to(temp_config.storage_root).as_posix()}" in names
        assert f"storage/{second_file.relative_to(temp_config.storage_root).as_posix()}" in names
        assert archive_info["count"] == 2


def test_storage_batch_download_requires_selection(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post("/api/storage/download", json={"paths": []})
    assert response.status_code == 400
    assert "selected" in response.json()["detail"].lower()


def test_storage_repair_removes_legacy_artifacts(temp_config):
    repository, lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_record = repository.get_class(module_record.class_id)
    assert class_record is not None
    lecture_record = repository.get_lecture(lecture_id)
    assert lecture_record is not None

    lecture_paths = LecturePaths.build(
        temp_config.storage_root,
        class_record.name,
        module_record.name,
        lecture_record.name,
    )
    lecture_paths.ensure()

    canonical_audio = lecture_paths.raw_dir / "audio.mp3"
    canonical_audio.write_bytes(b"canonical-audio")
    canonical_transcript = lecture_paths.transcript_dir / "transcript.txt"
    canonical_transcript.write_text("transcript", encoding="utf-8")
    canonical_notes = lecture_paths.notes_dir / "notes.md"
    canonical_notes.write_text("# notes", encoding="utf-8")
    canonical_slide = lecture_paths.raw_dir / "slides.pdf"
    canonical_slide.write_bytes(b"slide")
    canonical_slide_bundle_dir = lecture_paths.slide_dir
    canonical_slide_bundle_dir.mkdir(parents=True, exist_ok=True)
    (canonical_slide_bundle_dir / "slide.png").write_bytes(b"img")

    repository.update_lecture_assets(
        lecture_id,
        audio_path=canonical_audio.relative_to(temp_config.storage_root).as_posix(),
        slide_path=canonical_slide.relative_to(temp_config.storage_root).as_posix(),
        transcript_path=canonical_transcript.relative_to(temp_config.storage_root).as_posix(),
        notes_path=canonical_notes.relative_to(temp_config.storage_root).as_posix(),
        slide_image_dir=canonical_slide_bundle_dir.relative_to(temp_config.storage_root).as_posix(),
    )

    temp_dir = lecture_paths.raw_dir / "tmp-old"
    temp_dir.mkdir(parents=True, exist_ok=True)
    (temp_dir / "junk.bin").write_bytes(b"x" * 64)
    stray_file = lecture_paths.processed_dir / "Thumbs.db"
    stray_file.write_bytes(b"x" * 16)
    numeric_tmp_dir = lecture_paths.processed_dir / "tmp12345"
    numeric_tmp_dir.mkdir(parents=True, exist_ok=True)
    (numeric_tmp_dir / "junk.bin").write_bytes(b"x" * 32)
    pycache_dir = lecture_paths.processed_dir / "__pycache__"
    pycache_dir.mkdir(parents=True, exist_ok=True)
    (pycache_dir / "module.cpython-311.pyc").write_bytes(b"p" * 24)
    cache_dir = lecture_paths.processed_dir / "cache-data"
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "data.bin").write_bytes(b"c" * 40)
    cache_file = lecture_paths.processed_dir / "render.cache"
    cache_file.write_bytes(b"r" * 12)

    legacy_class_dir = temp_config.storage_root / class_record.name
    legacy_module_dir = lecture_paths.lecture_root.parent / module_record.name
    legacy_lecture_dir = legacy_module_dir / lecture_record.name
    legacy_class_dir.mkdir(parents=True, exist_ok=True)
    (legacy_class_dir / "legacy.txt").write_text("legacy", encoding="utf-8")
    legacy_module_dir.mkdir(parents=True, exist_ok=True)
    (legacy_module_dir / "legacy.txt").write_text("legacy", encoding="utf-8")
    legacy_lecture_dir.mkdir(parents=True, exist_ok=True)
    (legacy_lecture_dir / "legacy.txt").write_text("legacy", encoding="utf-8")

    orphan_dir = temp_config.storage_root / "orphan"
    orphan_dir.mkdir(parents=True, exist_ok=True)
    (orphan_dir / "note.txt").write_bytes(b"orphan")

    archive_root = temp_config.archive_root
    archive_root.mkdir(parents=True, exist_ok=True)
    old_archive = archive_root / "old.zip"
    old_archive.write_bytes(b"z" * 128)

    response = client.post("/api/storage/repair")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    removed_paths = {entry["path"] for entry in payload["removed"]}

    legacy_class_rel = legacy_class_dir.relative_to(temp_config.storage_root).as_posix()
    legacy_module_rel = legacy_module_dir.relative_to(temp_config.storage_root).as_posix()
    legacy_lecture_rel = legacy_lecture_dir.relative_to(temp_config.storage_root).as_posix()
    orphan_rel = orphan_dir.relative_to(temp_config.storage_root).as_posix()
    temp_rel = temp_dir.relative_to(temp_config.storage_root).as_posix()
    stray_rel = stray_file.relative_to(temp_config.storage_root).as_posix()
    numeric_tmp_rel = numeric_tmp_dir.relative_to(temp_config.storage_root).as_posix()
    pycache_rel = pycache_dir.relative_to(temp_config.storage_root).as_posix()
    cache_dir_rel = cache_dir.relative_to(temp_config.storage_root).as_posix()
    cache_file_rel = cache_file.relative_to(temp_config.storage_root).as_posix()
    archive_rel = old_archive.relative_to(temp_config.storage_root).as_posix()

    assert legacy_class_rel in removed_paths
    assert legacy_module_rel in removed_paths
    assert orphan_rel in removed_paths
    assert temp_rel in removed_paths
    assert stray_rel in removed_paths
    assert numeric_tmp_rel in removed_paths
    assert pycache_rel in removed_paths
    assert cache_dir_rel in removed_paths
    assert cache_file_rel in removed_paths
    assert archive_rel in removed_paths

    assert not legacy_class_dir.exists()
    assert not legacy_module_dir.exists()
    assert not legacy_lecture_dir.exists()
    assert not orphan_dir.exists()
    assert not temp_dir.exists()
    assert not stray_file.exists()
    assert not numeric_tmp_dir.exists()
    assert not pycache_dir.exists()
    assert not cache_dir.exists()
    assert not cache_file.exists()
    assert not any(archive_root.iterdir())
    assert lecture_paths.lecture_root.exists()

    expected_minimum = (
        len("legacy") * 3
        + len(b"orphan")
        + 64
        + 16
        + 32
        + 24
        + 40
        + 12
        + 128
    )
    assert payload["freed_bytes"] >= expected_minimum
    assert payload.get("skipped", []) == []


def test_storage_repair_preserves_referenced_paths(temp_config):
    repository, lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    module_record = repository.get_module(module_id)
    assert module_record is not None
    class_record = repository.get_class(module_record.class_id)
    assert class_record is not None
    lecture_record = repository.get_lecture(lecture_id)
    assert lecture_record is not None

    base_dir = (
        temp_config.storage_root
        / class_record.name
        / module_record.name
        / lecture_record.name
    )
    temp_dir = base_dir / "tmp-old"
    temp_dir.mkdir(parents=True, exist_ok=True)
    (temp_dir / "junk.bin").write_bytes(b"x" * 32)
    stray_file = base_dir / "Thumbs.db"
    stray_file.write_bytes(b"x" * 8)

    archive_root = temp_config.archive_root
    archive_root.mkdir(parents=True, exist_ok=True)
    old_archive = archive_root / "stale.zip"
    old_archive.write_bytes(b"zip" * 10)

    temp_rel = temp_dir.relative_to(temp_config.storage_root).as_posix()
    stray_rel = stray_file.relative_to(temp_config.storage_root).as_posix()
    archive_rel = old_archive.relative_to(temp_config.storage_root).as_posix()

    response = client.post("/api/storage/repair")
    assert response.status_code == 200
    payload = response.json()
    removed_paths = {entry["path"] for entry in payload["removed"]}
    skipped_paths = {entry["path"] for entry in payload.get("skipped", [])}

    assert (temp_config.storage_root / class_record.name).exists()
    assert base_dir.exists()
    assert temp_rel in removed_paths
    assert stray_rel in removed_paths
    assert archive_rel in removed_paths
    assert not temp_dir.exists()
    assert not stray_file.exists()
    assert not any(archive_root.iterdir())

    legacy_class_rel = (temp_config.storage_root / class_record.name).relative_to(
        temp_config.storage_root
    ).as_posix()
    assert legacy_class_rel in skipped_paths

    expected_minimum = len(b"x" * 32) + len(b"x" * 8) + len(b"zip" * 10)
    assert payload["freed_bytes"] >= expected_minimum


def test_storage_repair_cleans_preview_and_cache_explosions(temp_config):
    repository, lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    (
        _class_record,
        _module_record,
        _lecture_record,
        lecture_paths,
        assets,
    ) = _prepare_canonical_lecture(repository, temp_config, lecture_id, module_id)

    preview_dir = lecture_paths.raw_dir / ".previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    preview_file = preview_dir / "preview-0001.png"
    preview_file.write_bytes(b"p" * 2048)

    raw_cache_dir = lecture_paths.raw_dir / "cache-12345"
    raw_cache_dir.mkdir(parents=True, exist_ok=True)
    raw_cache_file = raw_cache_dir / "junk.bin"
    raw_cache_file.write_bytes(b"c" * 1024)

    processed_tmp_dir = lecture_paths.processed_dir / "tmp20231109"
    processed_tmp_dir.mkdir(parents=True, exist_ok=True)
    processed_tmp_file = processed_tmp_dir / "junk.bin"
    processed_tmp_file.write_bytes(b"x" * 4096)

    processed_cache_dir = lecture_paths.processed_dir / "cache-data"
    processed_cache_dir.mkdir(parents=True, exist_ok=True)
    processed_cache_file = processed_cache_dir / "cache.bin"
    processed_cache_file.write_bytes(b"d" * 2048)

    slides_dir = lecture_paths.processed_dir / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)
    for index in range(1, 51):
        render_file = slides_dir / f"render-{index:04d}.png"
        render_file.write_bytes(b"r" * 256)

    extra_bundle = lecture_paths.lecture_root / "slides-extra.zip"
    extra_bundle.write_bytes(b"z" * 512)

    stray_preview_dir = lecture_paths.processed_dir / "_previews"
    stray_preview_dir.mkdir(parents=True, exist_ok=True)
    stray_preview_file = stray_preview_dir / "ghost.bin"
    stray_preview_file.write_bytes(b"g" * 128)

    stray_archive = temp_config.storage_root / "astronomy-export.zip"
    stray_archive.write_bytes(b"z" * 256)

    response = client.post("/api/storage/repair")
    assert response.status_code == 200
    payload = response.json()
    removed_paths = {entry["path"] for entry in payload["removed"]}

    preview_rel = preview_dir.relative_to(temp_config.storage_root).as_posix()
    raw_cache_rel = raw_cache_dir.relative_to(temp_config.storage_root).as_posix()
    processed_tmp_rel = processed_tmp_dir.relative_to(temp_config.storage_root).as_posix()
    processed_cache_rel = processed_cache_dir.relative_to(temp_config.storage_root).as_posix()
    slides_dir_rel = slides_dir.relative_to(temp_config.storage_root).as_posix()
    stray_preview_rel = stray_preview_dir.relative_to(temp_config.storage_root).as_posix()
    extra_bundle_rel = extra_bundle.relative_to(temp_config.storage_root).as_posix()
    stray_archive_rel = stray_archive.relative_to(temp_config.storage_root).as_posix()

    assert preview_rel in removed_paths
    assert raw_cache_rel in removed_paths
    assert processed_tmp_rel in removed_paths
    assert processed_cache_rel in removed_paths
    assert slides_dir_rel in removed_paths
    assert stray_preview_rel in removed_paths
    assert extra_bundle_rel in removed_paths
    assert stray_archive_rel in removed_paths

    assert not preview_dir.exists()
    assert not raw_cache_dir.exists()
    assert not processed_tmp_dir.exists()
    assert not processed_cache_dir.exists()
    assert not slides_dir.exists()
    assert not stray_preview_dir.exists()
    assert not extra_bundle.exists()
    assert not stray_archive.exists()

    assert lecture_paths.lecture_root.exists()
    assert assets["audio"].exists()
    assert assets["transcript"].exists()
    assert assets["notes"].exists()
    assert assets["slides_pdf"].exists()
    assert assets["bundle"].exists()

    expected_freed = (
        len(b"p" * 2048)
        + len(b"c" * 1024)
        + len(b"x" * 4096)
        + len(b"d" * 2048)
        + (len(b"r" * 256) * 50)
        + len(b"g" * 128)
        + len(b"z" * 512)
        + len(b"z" * 256)
    )
    assert payload["freed_bytes"] >= expected_freed


def test_storage_repair_aggressive_cleanup_for_large_lecture(temp_config):
    repository, lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    (
        _class_record,
        _module_record,
        _lecture_record,
        lecture_paths,
        assets,
    ) = _prepare_canonical_lecture(repository, temp_config, lecture_id, module_id)

    assets["audio"].write_bytes(b"a" * 128)
    assets["slides_pdf"].write_bytes(b"s" * 256)
    assets["bundle"].write_bytes(b"b" * 128)
    assets["transcript"].write_text("tiny", encoding="utf-8")
    assets["notes"].write_text("tiny", encoding="utf-8")

    preview_dir = lecture_paths.processed_dir / ".previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    preview_bytes = 0
    for index in range(1, 101):
        file_path = preview_dir / f"preview-{index:04d}.png"
        file_path.write_bytes(b"p" * 4096)
        preview_bytes += len(b"p" * 4096)

    cache_dir = lecture_paths.processed_dir / "cache-heavy"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_bytes = 0
    for index in range(5):
        cache_file = cache_dir / f"cache-{index}.bin"
        cache_file.write_bytes(b"c" * 8192)
        cache_bytes += len(b"c" * 8192)

    tmp_dir = lecture_paths.processed_dir / "tmp-2025-11-09"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_file = tmp_dir / "junk.bin"
    tmp_file.write_bytes(b"x" * 2048)

    preview_root = lecture_paths.lecture_root / "previews"
    preview_root.mkdir(parents=True, exist_ok=True)
    preview_root_file = preview_root / "ghost.png"
    preview_root_file.write_bytes(b"g" * 1024)

    response = client.post("/api/storage/repair")
    assert response.status_code == 200
    payload = response.json()
    removed_paths = {entry["path"] for entry in payload["removed"]}

    preview_rel = preview_dir.relative_to(temp_config.storage_root).as_posix()
    cache_rel = cache_dir.relative_to(temp_config.storage_root).as_posix()
    tmp_rel = tmp_dir.relative_to(temp_config.storage_root).as_posix()
    preview_root_rel = preview_root.relative_to(temp_config.storage_root).as_posix()

    assert preview_rel in removed_paths
    assert cache_rel in removed_paths
    assert tmp_rel in removed_paths
    assert preview_root_rel in removed_paths

    assert not preview_dir.exists()
    assert not cache_dir.exists()
    assert not tmp_dir.exists()
    assert not preview_root.exists()

    assert lecture_paths.lecture_root.exists()
    assert assets["audio"].exists()
    assert assets["slides_pdf"].exists()
    assert assets["bundle"].exists()

    expected_freed = preview_bytes + cache_bytes + len(b"x" * 2048) + len(b"g" * 1024)
    assert payload["freed_bytes"] >= expected_freed
    assert payload.get("skipped", []) == []


def test_storage_repair_pdf_with_image_burst_is_cleaned(temp_config):
    repository = LectureRepository(temp_config)
    class_id = repository.add_class("Cleanup 101", "Storage repair burst test")
    module_id = repository.add_module(class_id, "Slide Cleanup", "")

    lecture_dir = temp_config.storage_root / "Cleanup 101" / "Slide Cleanup" / "Burst Session"
    lecture_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = lecture_dir / "slides.pdf"
    pdf_bytes = b"p" * 4096
    pdf_path.write_bytes(pdf_bytes)

    images_dir = lecture_dir / "slides.pdf_images"
    images_dir.mkdir(parents=True, exist_ok=True)
    image_bytes = b"i" * 2048
    image_count = 120
    for index in range(image_count):
        (images_dir / f"page-{index:03d}.png").write_bytes(image_bytes)

    zip_path = lecture_dir / "slides.pdf_images.zip"
    zip_bytes = b"z" * 8192
    zip_path.write_bytes(zip_bytes)

    slide_relative = pdf_path.relative_to(temp_config.storage_root).as_posix()
    repository.add_lecture(module_id, "Slide Burst", slide_path=slide_relative)

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post("/api/storage/repair")
    assert response.status_code == 200
    payload = response.json()

    removed_paths = {entry["path"] for entry in payload["removed"]}
    images_rel = images_dir.relative_to(temp_config.storage_root).as_posix()
    zip_rel = zip_path.relative_to(temp_config.storage_root).as_posix()

    assert pdf_path.exists()
    assert not images_dir.exists()
    assert not zip_path.exists()
    assert lecture_dir.exists()

    assert images_rel in removed_paths or any(path.startswith(f"{images_rel}/") for path in removed_paths)
    assert zip_rel in removed_paths

    expected_removed = len(image_bytes) * image_count + len(zip_bytes)
    assert payload["freed_bytes"] >= expected_removed


def test_storage_repair_detects_unknown_image_directory(temp_config):
    repository = LectureRepository(temp_config)
    class_id = repository.add_class("Databases", "Cleanup unknown dirs")
    module_id = repository.add_module(class_id, "SQL", "")

    lecture_dir = temp_config.storage_root / "Databases" / "SQL" / "Lesson"
    lecture_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = lecture_dir / "lesson.pdf"
    pdf_bytes = b"s" * 2048
    pdf_path.write_bytes(pdf_bytes)

    pages_dir = lecture_dir / "07a_Basic_SQL (pages)"
    pages_dir.mkdir(parents=True, exist_ok=True)
    page_bytes = b"p" * 1024
    page_count = 200
    for index in range(page_count):
        (pages_dir / f"07a_Basic_SQL-{index:03d}.png").write_bytes(page_bytes)

    slide_relative = pdf_path.relative_to(temp_config.storage_root).as_posix()
    repository.add_lecture(module_id, "SQL Session", slide_path=slide_relative)

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post("/api/storage/repair")
    assert response.status_code == 200
    payload = response.json()

    pages_rel = pages_dir.relative_to(temp_config.storage_root).as_posix()
    removed_paths = {entry["path"] for entry in payload["removed"]}

    assert pdf_path.exists()
    assert not pages_dir.exists()
    assert lecture_dir.exists()
    assert pages_rel in removed_paths

    expected_removed = len(page_bytes) * page_count
    assert payload["freed_bytes"] >= expected_removed


def test_system_update_endpoint(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    script_path = temp_config.storage_root / "fake_update.py"
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(
        "import sys, time\n"
        "sys.stdout.write('update-start\\n')\n"
        "sys.stdout.flush()\n"
        "time.sleep(0.2)\n"
        "sys.stdout.write('update-finish\\n')\n",
        encoding="utf-8",
    )

    manager = getattr(app.state, "update_manager")

    def fake_build_commands(self):
        return [[sys.executable, str(script_path)]]

    manager._build_commands = fake_build_commands.__get__(manager, type(manager))

    status = client.get("/api/system/update")
    assert status.status_code == 200
    initial = status.json()["update"]
    assert initial["running"] is False

    started = client.post("/api/system/update")
    assert started.status_code == 200
    first_payload = started.json()["update"]
    assert isinstance(first_payload, dict)

    if first_payload.get("running"):
        time.sleep(0.05)
        conflict = client.post("/api/system/update")
        assert conflict.status_code == 409
        assert "detail" in conflict.json()

    final_payload = None
    for _ in range(40):
        poll = client.get("/api/system/update")
        assert poll.status_code == 200
        body = poll.json()["update"]
        if not body["running"]:
            final_payload = body
            break
        time.sleep(0.05)

    assert final_payload is not None
    assert final_payload["success"] in {True, False}
    log_messages = [entry.get("message", "") for entry in final_payload.get("log", [])]
    assert any("update-start" in message for message in log_messages)
    assert any("update-finish" in message for message in log_messages)

def test_storage_endpoints_fail_when_root_unwritable(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    shutil.rmtree(temp_config.storage_root, ignore_errors=True)
    temp_config.storage_root.parent.mkdir(parents=True, exist_ok=True)
    temp_config.storage_root.write_text("blocked", encoding="utf-8")

    list_response = client.get("/api/storage/list")
    assert list_response.status_code == 503
    detail = list_response.json().get("detail", "")
    assert "Storage directory" in detail

    usage_response = client.get("/api/storage/usage")
    assert usage_response.status_code == 503


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


def test_upload_large_audio_respects_configured_limit(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    large_audio = b"\x01" * (2 * 1024 * 1024)
    response = client.post(
        f"/api/lectures/{lecture_id}/assets/audio",
        files={"file": ("big.mp3", large_audio, "audio/mpeg")},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    relative_path = payload.get("audio_path")
    assert isinstance(relative_path, str) and relative_path.endswith("big.mp3")
    stored_path = temp_config.storage_root / relative_path
    assert stored_path.exists()
    assert stored_path.stat().st_size == len(large_audio)

    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.audio_path == relative_path


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

    _wait_for_background_jobs(app)
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

    _wait_for_background_jobs(app)

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


def test_delete_slide_bundle_asset_clears_archive(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    archive_file = temp_config.storage_root / "slides" / "lecture-bundle.zip"
    archive_file.parent.mkdir(parents=True, exist_ok=True)
    archive_file.write_bytes(b"zip")
    relative_path = archive_file.relative_to(temp_config.storage_root).as_posix()

    repository.update_lecture_assets(lecture_id, slide_image_dir=relative_path)

    response = client.delete(f"/api/lectures/{lecture_id}/assets/slide_bundle")

    assert response.status_code == 200
    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.slide_image_dir is None
    assert not archive_file.exists()


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


def test_purge_audio_clears_processed_only_assets(temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    processed_file = (
        temp_config.storage_root
        / "Astronomy"
        / "Stellar Physics"
        / "Stellar Evolution"
        / "lecture-mastered.wav"
    )
    processed_file.parent.mkdir(parents=True, exist_ok=True)
    processed_file.write_bytes(b"processed")

    repository.update_lecture_assets(
        lecture_id,
        audio_path=None,
        processed_audio_path=processed_file.relative_to(temp_config.storage_root).as_posix(),
    )

    response = client.post("/api/storage/purge-audio")

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("deleted") == 1

    updated = repository.get_lecture(lecture_id)
    assert updated is not None
    assert updated.audio_path is None
    assert updated.processed_audio_path is None
    assert not processed_file.exists()


def test_storage_overview_includes_processed_audio(temp_config):
    repository, lecture_id, module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    processed_file = (
        temp_config.storage_root
        / "Astronomy"
        / "Stellar Physics"
        / "Stellar Evolution"
        / "mastered.wav"
    )
    processed_file.write_bytes(b"processed-audio")
    repository.update_lecture_assets(
        lecture_id,
        processed_audio_path=processed_file.relative_to(temp_config.storage_root).as_posix(),
    )

    response = client.get("/api/storage/overview")
    assert response.status_code == 200
    payload = response.json()

    classes = payload.get("classes") or []
    assert classes
    class_entry = classes[0]
    assert class_entry.get("processed_audio_count") == 1

    modules = class_entry.get("modules") or []
    module_entry = next((module for module in modules if module.get("id") == module_id), None)
    assert module_entry is not None
    assert module_entry.get("processed_audio_count") == 1

    lectures = module_entry.get("lectures") or []
    lecture_entry = next((item for item in lectures if item.get("id") == lecture_id), None)
    assert lecture_entry is not None
    assert lecture_entry.get("has_processed_audio") is True

    base_dir = (
        temp_config.storage_root
        / "Astronomy"
        / "Stellar Physics"
        / "Stellar Evolution"
    )
    total_size = sum(path.stat().st_size for path in base_dir.rglob("*") if path.is_file())
    assert lecture_entry.get("size") == total_size


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


def test_upload_slides_does_not_process_automatically(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            bundle_dir,
            notes_dir,
            *,
            page_range=None,
            progress_callback=None,
        ):  # noqa: D401, ANN001, ANN002 - signature mirrors real converter
            raise AssertionError("Slide conversion should not run during upload")

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
    assert payload.get("processing") is False
    assert not payload.get("processing_operations")
    assert payload.get("slide_image_dir") is None

    _wait_for_background_jobs(app)

    updated = repository.get_lecture(lecture_id)
    assert updated.slide_path and updated.slide_path.endswith("deck.pdf")
    assert updated.slide_image_dir is None


def test_upload_slides_gracefully_handles_missing_converter(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            bundle_dir,
            notes_dir,
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
    assert payload.get("processing") is False
    assert payload.get("slide_image_dir") is None

    updated = repository.get_lecture(lecture_id)
    assert updated.slide_path and updated.slide_path.endswith("deck.pdf")
    assert updated.slide_image_dir is None


def test_process_slides_generates_archive(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            bundle_dir,
            notes_dir,
            *,
            page_range=None,
            progress_callback=None,
        ):
            bundle_dir.mkdir(parents=True, exist_ok=True)
            notes_dir.mkdir(parents=True, exist_ok=True)
            archive = bundle_dir / "slides.zip"
            archive.write_bytes(b"zip")
            markdown = notes_dir / "slides-ocr.md"
            markdown.write_text("# Notes", encoding="utf-8")
            return SlideConversionResult(bundle_path=archive, markdown_path=markdown)

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
    assert payload["notes_path"].endswith(".md")
    notes_asset = temp_config.storage_root / payload["notes_path"]
    assert notes_asset.exists()


def test_process_slides_uses_converter_result(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)

    class DummyConverter:
        def convert(
            self,
            slide_path,
            bundle_dir,
            notes_dir,
            *,
            page_range=None,
            progress_callback=None,
        ) -> SlideConversionResult:
            bundle_dir.mkdir(parents=True, exist_ok=True)
            notes_dir.mkdir(parents=True, exist_ok=True)
            archive = bundle_dir / "slides.zip"
            archive.write_bytes(b"zip")
            markdown = notes_dir / "slides-ocr.md"
            markdown.write_text("# Slide Notes\n\n## Slide 1\n- Section Title\n- Key insight here", encoding="utf-8")
            if progress_callback is not None:
                progress_callback(1, 2)
            return SlideConversionResult(bundle_path=archive, markdown_path=markdown)

    monkeypatch.setattr(web_server, "PyMuPDFSlideConverter", lambda: DummyConverter())

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.post(
        f"/api/lectures/{lecture_id}/process-slides",
        files={"file": ("deck.pdf", b"%PDF-1.4", "application/pdf")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["slide_image_dir"].endswith("slides.zip")
    assert payload["notes_path"].endswith("slides-ocr.md")
    notes_asset = temp_config.storage_root / payload["notes_path"]
    assert notes_asset.exists()
    content = notes_asset.read_text(encoding="utf-8")
    assert "Section Title" in content
    assert "Key insight here" in content


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
            bundle_dir,
            notes_dir,
            *,
            page_range=None,
            progress_callback=None,
        ):
            bundle_dir.mkdir(parents=True, exist_ok=True)
            notes_dir.mkdir(parents=True, exist_ok=True)
            archive = bundle_dir / "slides.zip"
            archive.write_bytes(b"zip")
            markdown = notes_dir / "slides-ocr.md"
            markdown.write_text("# Notes", encoding="utf-8")
            return SlideConversionResult(bundle_path=archive, markdown_path=markdown)

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
    assert payload["notes_path"].endswith(".md")

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
            bundle_dir,
            notes_dir,
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


def test_process_slides_tasks_are_queued(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    call_events: list[tuple[str, float]] = []

    def fake_generate(
        pdf_path,
        lecture_paths,
        converter,
        *,
        page_range=None,
        progress_callback=None,
    ):
        start_time = time.perf_counter()
        call_events.append(("start", start_time))
        time.sleep(0.1)
        bundle_target = lecture_paths.slide_dir / "slides.zip"
        notes_target = lecture_paths.notes_dir / "slides-ocr.md"
        bundle_target.parent.mkdir(parents=True, exist_ok=True)
        notes_target.parent.mkdir(parents=True, exist_ok=True)
        bundle_target.write_bytes(b"zip")
        notes_target.write_text("# Notes", encoding="utf-8")
        if progress_callback is not None:
            progress_callback(1, 1)
        end_time = time.perf_counter()
        call_events.append(("end", end_time))
        return (
            bundle_target.relative_to(temp_config.storage_root).as_posix(),
            notes_target.relative_to(temp_config.storage_root).as_posix(),
        )

    monkeypatch.setattr(web_server, "_generate_slide_bundle", fake_generate)

    pdf_payload = _build_sample_pdf(1)

    def trigger_request() -> None:
        response = client.post(
            f"/api/lectures/{lecture_id}/process-slides",
            files={"file": ("slides.pdf", pdf_payload, "application/pdf")},
        )
        assert response.status_code == 200

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(trigger_request)
        time.sleep(0.05)
        second = pool.submit(trigger_request)
        first.result(timeout=5)
        second.result(timeout=5)

    assert [event for event, _ in call_events] == ["start", "end", "start", "end"]
    assert call_events[2][1] >= call_events[1][1]


def test_transcription_requests_are_serialized(monkeypatch, temp_config):
    repository, lecture_id, _module_id = _create_sample_data(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    events: list[tuple[int, str, float]] = []
    request_counter = {"value": 0}

    def next_request_id() -> int:
        request_counter["value"] += 1
        return request_counter["value"]

    class DummyEngine:
        def __init__(
            self,
            model: str,
            *,
            download_root: Path,
            compute_type: str,
            beam_size: int,
        ) -> None:
            self._request_id = next_request_id()
            events.append((self._request_id, "init-start", time.perf_counter()))
            time.sleep(0.05)
            events.append((self._request_id, "init-end", time.perf_counter()))

        def transcribe(
            self,
            audio_path: Path,
            output_dir: Path,
            *,
            progress_callback=None,
        ) -> TranscriptResult:
            events.append((self._request_id, "transcribe-start", time.perf_counter()))
            time.sleep(0.1)
            output_dir.mkdir(parents=True, exist_ok=True)
            transcript = output_dir / f"auto-{self._request_id}.txt"
            transcript.write_text("auto", encoding="utf-8")
            if progress_callback is not None:
                progress_callback(1.0, 1.0, "====> done")
            events.append((self._request_id, "transcribe-end", time.perf_counter()))
            return TranscriptResult(text_path=transcript, segments_path=None)

    monkeypatch.setattr(web_server, "FasterWhisperTranscription", DummyEngine)

    def trigger_request() -> None:
        response = client.post(
            f"/api/lectures/{lecture_id}/transcribe",
            json={"model": "base"},
        )
        assert response.status_code == 200

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(trigger_request)
        time.sleep(0.05)
        second = pool.submit(trigger_request)
        first.result(timeout=5)
        second.result(timeout=5)

    _wait_for_background_jobs(app)

    ordered_events = [(request_id, name) for request_id, name, _ in events]
    assert ordered_events == [
        (1, "init-start"),
        (1, "init-end"),
        (1, "transcribe-start"),
        (1, "transcribe-end"),
        (2, "init-start"),
        (2, "init-end"),
        (2, "transcribe-start"),
        (2, "transcribe-end"),
    ]

    first_init_end = next(
        timestamp for req_id, name, timestamp in events if req_id == 1 and name == "init-end"
    )
    second_init_start = next(
        timestamp for req_id, name, timestamp in events if req_id == 2 and name == "init-start"
    )
    assert second_init_start > first_init_end

    first_transcribe_end = next(
        timestamp for req_id, name, timestamp in events if req_id == 1 and name == "transcribe-end"
    )
    second_transcribe_start = next(
        timestamp for req_id, name, timestamp in events if req_id == 2 and name == "transcribe-start"
    )
    assert second_transcribe_start > first_transcribe_end

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
            "display_mode": "bright",
            "theme": "vibrant",
            "visual_effects": "mid",
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
    assert payload["display_mode"] == "dark"
    assert payload["theme"] == "obsidian"
    assert payload["visual_effects"] == "mid"
    assert payload["whisper_model"] == "base"
    assert payload["slide_dpi"] == 200
    assert payload["language"] == "en"
    assert payload["audio_mastering_enabled"] is True


def test_get_settings_accepts_none_effects(temp_config):
    repository = LectureRepository(temp_config)
    settings_path = temp_config.storage_root / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(
        json.dumps({"visual_effects": "off"}, indent=2),
        encoding="utf-8",
    )

    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    response = client.get("/api/settings")
    assert response.status_code == 200
    payload = response.json()["settings"]
    assert payload["visual_effects"] == "none"


def test_update_settings_enforces_choices(temp_config):
    repository = LectureRepository(temp_config)
    app = create_app(repository, config=temp_config)
    client = TestClient(app)

    valid_payload = {
        "display_mode": "dark",
        "theme": "cyber",
        "visual_effects": "high",
        "language": "fr",
        "whisper_model": "small",
        "whisper_compute_type": "float16",
        "whisper_beam_size": 6,
        "slide_dpi": 300,
    }

    response = client.put("/api/settings", json=valid_payload)
    assert response.status_code == 200
    payload = response.json()["settings"]
    assert payload["display_mode"] == "dark"
    assert payload["theme"] == "cyber"
    assert payload["visual_effects"] == "high"
    assert payload["whisper_model"] == "small"
    assert payload["slide_dpi"] == 300
    assert payload["language"] == "fr"

    none_response = client.put(
        "/api/settings",
        json={**valid_payload, "visual_effects": "none"},
    )
    assert none_response.status_code == 200
    none_payload = none_response.json()["settings"]
    assert none_payload["visual_effects"] == "none"

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
