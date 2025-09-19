"""FastAPI application powering the Lecture Tools web UI."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from ..config import AppConfig
from ..services.storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord

_TEMPLATE_PATH = Path(__file__).parent / "templates" / "index.html"
_PREVIEW_LIMIT = 1200


def _format_asset_counts(lectures: List[Dict[str, Any]]) -> Dict[str, int]:
    """Return aggregated asset availability counts for a collection of lectures."""

    return {
        "transcripts": sum(1 for lecture in lectures if lecture["transcript_path"]),
        "slides": sum(1 for lecture in lectures if lecture["slide_path"]),
        "audio": sum(1 for lecture in lectures if lecture["audio_path"]),
        "notes": sum(1 for lecture in lectures if lecture["notes_path"]),
        "slide_images": sum(1 for lecture in lectures if lecture["slide_image_dir"]),
    }


def _serialize_lecture(lecture: LectureRecord) -> Dict[str, Any]:
    return {
        "id": lecture.id,
        "module_id": lecture.module_id,
        "name": lecture.name,
        "description": lecture.description,
        "audio_path": lecture.audio_path,
        "slide_path": lecture.slide_path,
        "transcript_path": lecture.transcript_path,
        "notes_path": lecture.notes_path,
        "slide_image_dir": lecture.slide_image_dir,
    }


def _serialize_module(repository: LectureRepository, module: ModuleRecord) -> Dict[str, Any]:
    lectures: List[Dict[str, Any]] = [
        _serialize_lecture(lecture) for lecture in repository.iter_lectures(module.id)
    ]
    asset_counts = _format_asset_counts(lectures)
    return {
        "id": module.id,
        "class_id": module.class_id,
        "name": module.name,
        "description": module.description,
        "lectures": lectures,
        "lecture_count": len(lectures),
        "asset_counts": asset_counts,
    }


def _serialize_class(repository: LectureRepository, class_record: ClassRecord) -> Dict[str, Any]:
    modules: List[Dict[str, Any]] = [
        _serialize_module(repository, module) for module in repository.iter_modules(class_record.id)
    ]
    lecture_dicts: List[Dict[str, Any]] = [
        lecture
        for module in modules
        for lecture in module["lectures"]
    ]
    asset_counts = _format_asset_counts(lecture_dicts)
    return {
        "id": class_record.id,
        "name": class_record.name,
        "description": class_record.description,
        "modules": modules,
        "module_count": len(modules),
        "asset_counts": asset_counts,
    }


def _safe_preview_for_path(storage_root: Path, relative_path: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return a preview payload for the provided asset path if available."""

    if not relative_path:
        return None

    candidate = (storage_root / relative_path).resolve()
    storage_root = storage_root.resolve()
    try:
        candidate.relative_to(storage_root)
    except ValueError:
        # Attempted path traversal – ignore the asset for previews.
        return None

    if not candidate.exists() or not candidate.is_file():
        return None

    try:
        with candidate.open("r", encoding="utf-8", errors="ignore") as handle:
            # Read a limited window so very large transcripts do not exhaust memory.
            raw_snippet = handle.read(_PREVIEW_LIMIT)
    except OSError:
        return None

    if not raw_snippet:
        return None

    info = candidate.stat()
    truncated = info.st_size > _PREVIEW_LIMIT
    snippet = raw_snippet.rstrip()
    modified = datetime.fromtimestamp(info.st_mtime, tz=timezone.utc)
    line_count = snippet.count("\n") + 1 if snippet else 0
    return {
        "text": snippet,
        "truncated": truncated,
        "byte_size": info.st_size,
        "modified": modified.isoformat(),
        "path": relative_path,
        "line_count": line_count,
    }


def create_app(repository: LectureRepository, *, config: AppConfig) -> FastAPI:
    """Return a configured FastAPI application."""

    app = FastAPI(title="Lecture Tools", description="Browse lectures from any device")

    app.mount(
        "/storage",
        StaticFiles(directory=config.storage_root, check_dir=False),
        name="storage",
    )

    index_html = _TEMPLATE_PATH.read_text(encoding="utf-8")

    @app.get("/", response_class=HTMLResponse)
    async def index() -> HTMLResponse:
        return HTMLResponse(index_html)

    @app.get("/api/classes")
    async def list_classes() -> Dict[str, Any]:
        classes = [_serialize_class(repository, record) for record in repository.iter_classes()]
        total_modules = sum(item["module_count"] for item in classes)
        total_lectures = sum(
            module["lecture_count"] for item in classes for module in item["modules"]
        )
        total_asset_counts = {
            "transcript_count": sum(
                klass["asset_counts"]["transcripts"] for klass in classes
            ),
            "slide_count": sum(klass["asset_counts"]["slides"] for klass in classes),
            "audio_count": sum(klass["asset_counts"]["audio"] for klass in classes),
            "notes_count": sum(klass["asset_counts"]["notes"] for klass in classes),
            "slide_image_count": sum(
                klass["asset_counts"]["slide_images"] for klass in classes
            ),
        }
        return {
            "classes": classes,
            "stats": {
                "class_count": len(classes),
                "module_count": total_modules,
                "lecture_count": total_lectures,
                **total_asset_counts,
            },
        }

    @app.get("/api/lectures/{lecture_id}")
    async def get_lecture(lecture_id: int) -> Dict[str, Any]:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        module = repository.get_module(lecture.module_id)
        if module is None:
            raise HTTPException(status_code=404, detail="Module not found")

        class_record = repository.get_class(module.class_id)
        if class_record is None:
            raise HTTPException(status_code=404, detail="Class not found")

        return {
            "lecture": _serialize_lecture(lecture),
            "module": {
                "id": module.id,
                "name": module.name,
                "description": module.description,
            },
            "class": {
                "id": class_record.id,
                "name": class_record.name,
                "description": class_record.description,
            },
        }

    @app.get("/api/lectures/{lecture_id}/preview")
    async def get_lecture_preview(lecture_id: int) -> Dict[str, Any]:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        transcript_preview = _safe_preview_for_path(
            config.storage_root, lecture.transcript_path
        )
        notes_preview = _safe_preview_for_path(config.storage_root, lecture.notes_path)
        return {
            "transcript": transcript_preview,
            "notes": notes_preview,
        }

    return app


__all__ = ["create_app"]
