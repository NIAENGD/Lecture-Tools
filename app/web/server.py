"""FastAPI application powering the Lecture Tools web UI."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from ..config import AppConfig
from ..services.storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord

_TEMPLATE_PATH = Path(__file__).parent / "templates" / "index.html"


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
    return {
        "id": module.id,
        "class_id": module.class_id,
        "name": module.name,
        "description": module.description,
        "lectures": lectures,
        "lecture_count": len(lectures),
    }


def _serialize_class(repository: LectureRepository, class_record: ClassRecord) -> Dict[str, Any]:
    modules: List[Dict[str, Any]] = [
        _serialize_module(repository, module) for module in repository.iter_modules(class_record.id)
    ]
    return {
        "id": class_record.id,
        "name": class_record.name,
        "description": class_record.description,
        "modules": modules,
        "module_count": len(modules),
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
        return {
            "classes": classes,
            "stats": {
                "class_count": len(classes),
                "module_count": total_modules,
                "lecture_count": total_lectures,
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

    return app


__all__ = ["create_app"]
