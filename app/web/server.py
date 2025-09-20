"""FastAPI application powering the Lecture Tools web UI."""

from __future__ import annotations

import platform
import shutil
import subprocess
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Response
from fastapi import status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ..config import AppConfig
from ..processing import PyMuPDFSlideConverter
from ..services.ingestion import LecturePaths
from ..services.naming import build_asset_stem, build_timestamped_name, slugify
from ..services.settings import SettingsStore, UISettings
from ..services.storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord

try:  # pragma: no cover - optional dependency imported lazily
    from ..processing import FasterWhisperTranscription
except Exception:  # noqa: BLE001 - optional dependency may be absent
    FasterWhisperTranscription = None  # type: ignore[assignment]

_TEMPLATE_PATH = Path(__file__).parent / "templates" / "index.html"
_PREVIEW_LIMIT = 1200
_WHISPER_MODEL_OPTIONS: Tuple[str, ...] = ("tiny", "base", "small", "medium", "large")
_WHISPER_MODEL_SET = set(_WHISPER_MODEL_OPTIONS)
_SLIDE_DPI_OPTIONS: Tuple[int, ...] = (150, 200, 300, 400, 600)
_SLIDE_DPI_SET = set(_SLIDE_DPI_OPTIONS)
_DEFAULT_UI_SETTINGS = UISettings()


def _normalize_whisper_model(value: Any) -> str:
    """Return a supported Whisper model choice."""

    if isinstance(value, str):
        candidate = value.strip()
    else:
        candidate = str(value or "").strip()
    return candidate if candidate in _WHISPER_MODEL_SET else _DEFAULT_UI_SETTINGS.whisper_model


def _normalize_slide_dpi(value: Any) -> int:
    """Return a supported slide DPI choice."""

    try:
        candidate = int(value)
    except (TypeError, ValueError):
        return _DEFAULT_UI_SETTINGS.slide_dpi
    return candidate if candidate in _SLIDE_DPI_SET else _DEFAULT_UI_SETTINGS.slide_dpi


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


def _resolve_storage_path(storage_root: Path, relative_path: str) -> Path:
    candidate = Path(relative_path)
    storage_root = storage_root.resolve()
    if not candidate.is_absolute():
        candidate = (storage_root / candidate).resolve()
    else:
        candidate = candidate.resolve()
    candidate.relative_to(storage_root)
    return candidate


def _open_in_file_manager(path: Path, *, select: bool = False) -> None:
    system = platform.system()
    try:
        if system == "Windows":
            if select and path.exists():
                subprocess.Popen(["explorer", f"/select,{path}"])
            else:
                target = path if path.is_dir() else path.parent
                subprocess.Popen(["explorer", str(target)])
        elif system == "Darwin":
            if select and path.exists():
                subprocess.Popen(["open", "-R", str(path)])
            else:
                subprocess.Popen(["open", str(path)])
        else:
            target = path if path.is_dir() else (path.parent if select else path)
            subprocess.Popen(["xdg-open", str(target)])
    except Exception as error:  # pragma: no cover - depends on host platform
        raise RuntimeError(f"Could not reveal path: {error}")


class LectureCreatePayload(BaseModel):
    module_id: int
    name: str = Field(..., min_length=1)
    description: str = ""


class LectureUpdatePayload(BaseModel):
    module_id: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None


class TranscriptionRequest(BaseModel):
    model: str = Field("base", min_length=1)


class RevealRequest(BaseModel):
    path: str
    select: bool = False


class ClassCreatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""


class ModuleCreatePayload(BaseModel):
    class_id: int
    name: str = Field(..., min_length=1)
    description: str = ""


class SettingsPayload(BaseModel):
    theme: Literal["dark", "light", "system"] = "system"
    whisper_model: Literal[*_WHISPER_MODEL_OPTIONS] = "base"
    whisper_compute_type: str = Field("int8", min_length=1)
    whisper_beam_size: int = Field(5, ge=1, le=10)
    slide_dpi: Literal[*_SLIDE_DPI_OPTIONS] = 200


def create_app(repository: LectureRepository, *, config: AppConfig) -> FastAPI:
    """Return a configured FastAPI application."""

    app = FastAPI(title="Lecture Tools", description="Browse lectures from any device")
    settings_store = SettingsStore(config)

    app.mount(
        "/storage",
        StaticFiles(directory=config.storage_root, check_dir=False),
        name="storage",
    )

    index_html = _TEMPLATE_PATH.read_text(encoding="utf-8")

    def _load_ui_settings() -> UISettings:
        try:
            settings = settings_store.load()
        except Exception:  # pragma: no cover - defensive fallback
            settings = UISettings()
        settings.whisper_model = _normalize_whisper_model(settings.whisper_model)
        settings.slide_dpi = _normalize_slide_dpi(settings.slide_dpi)
        return settings

    def _make_slide_converter() -> PyMuPDFSlideConverter:
        settings = _load_ui_settings()
        converter_cls = PyMuPDFSlideConverter
        try:
            return converter_cls(dpi=settings.slide_dpi)
        except TypeError:  # pragma: no cover - allows monkeypatched callables without kwargs
            return converter_cls()

    def _require_hierarchy(lecture: LectureRecord) -> Tuple[ClassRecord, ModuleRecord]:
        module = repository.get_module(lecture.module_id)
        if module is None:
            raise HTTPException(status_code=404, detail="Module not found")
        class_record = repository.get_class(module.class_id)
        if class_record is None:
            raise HTTPException(status_code=404, detail="Class not found")
        return class_record, module

    def _delete_storage_path(target: Path) -> None:
        storage_root = config.storage_root.resolve()
        candidate = target.resolve()
        try:
            candidate.relative_to(storage_root)
        except ValueError:
            return
        if candidate == storage_root or not candidate.exists():
            return
        if candidate.is_dir():
            shutil.rmtree(candidate)
        else:
            candidate.unlink()

    def _delete_asset_path(relative: Optional[str]) -> None:
        if not relative:
            return
        try:
            asset_path = _resolve_storage_path(config.storage_root, relative)
        except ValueError:
            return
        _delete_storage_path(asset_path)

    def _name_variants(value: str) -> List[str]:
        cleaned = value.strip()
        variants = {slugify(cleaned)}
        if cleaned:
            variants.add(cleaned)
        return list(variants)

    def _iter_class_dirs(class_record: ClassRecord) -> List[Path]:
        storage_root = config.storage_root
        candidates: List[Path] = []
        for class_name in _name_variants(class_record.name):
            candidate = storage_root / class_name
            if candidate not in candidates:
                candidates.append(candidate)
        return candidates

    def _iter_module_dirs(class_record: ClassRecord, module: ModuleRecord) -> List[Path]:
        candidates: List[Path] = []
        for class_dir in _iter_class_dirs(class_record):
            for module_name in _name_variants(module.name):
                candidate = class_dir / module_name
                if candidate not in candidates:
                    candidates.append(candidate)
        return candidates

    def _iter_lecture_dirs(
        class_record: ClassRecord, module: ModuleRecord, lecture: LectureRecord
    ) -> List[Path]:
        candidates: List[Path] = []
        for module_dir in _iter_module_dirs(class_record, module):
            for lecture_name in _name_variants(lecture.name):
                candidate = module_dir / lecture_name
                if candidate not in candidates:
                    candidates.append(candidate)
        return candidates

    def _purge_lecture_storage(
        lecture: LectureRecord, class_record: ClassRecord, module: ModuleRecord
    ) -> None:
        for attribute in (
            lecture.audio_path,
            lecture.slide_path,
            lecture.transcript_path,
            lecture.notes_path,
            lecture.slide_image_dir,
        ):
            _delete_asset_path(attribute)
        for directory in _iter_lecture_dirs(class_record, module, lecture):
            _delete_storage_path(directory)

    def _purge_module_storage(class_record: ClassRecord, module: ModuleRecord) -> None:
        lectures = list(repository.iter_lectures(module.id))
        for lecture in lectures:
            _purge_lecture_storage(lecture, class_record, module)
        for directory in _iter_module_dirs(class_record, module):
            _delete_storage_path(directory)

    def _generate_slide_archive(
        pdf_path: Path,
        lecture_paths: LecturePaths,
        converter: PyMuPDFSlideConverter,
        *,
        page_range: Optional[Tuple[int, int]] = None,
    ) -> Optional[str]:
        existing_items: List[Path] = []
        if lecture_paths.slide_dir.exists():
            existing_items = list(lecture_paths.slide_dir.iterdir())

        try:
            generated = list(
                converter.convert(
                    pdf_path,
                    lecture_paths.slide_dir,
                    page_range=page_range,
                )
            )
        except Exception as error:  # noqa: BLE001 - propagate conversion errors
            raise HTTPException(status_code=500, detail=str(error)) from error

        slide_image_relative = None
        if generated:
            archive_path = generated[0]
            slide_image_relative = archive_path.relative_to(config.storage_root).as_posix()
            for leftover in existing_items:
                if leftover.resolve() == archive_path.resolve():
                    continue
                try:
                    if leftover.is_dir():
                        shutil.rmtree(leftover)
                    else:
                        leftover.unlink()
                except OSError:
                    continue

        return slide_image_relative

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

    @app.post("/api/classes", status_code=status.HTTP_201_CREATED)
    async def create_class(payload: ClassCreatePayload) -> Dict[str, Any]:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Class name is required")

        try:
            class_id = repository.add_class(name, payload.description.strip())
        except Exception as error:  # noqa: BLE001 - propagate integrity issues
            raise HTTPException(status_code=400, detail=str(error)) from error

        record = repository.get_class(class_id)
        if record is None:
            raise HTTPException(status_code=500, detail="Class creation failed")

        return {"class": _serialize_class(repository, record)}

    @app.delete(
        "/api/classes/{class_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def delete_class(class_id: int) -> Response:
        record = repository.get_class(class_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Class not found")
        modules = list(repository.iter_modules(class_id))
        try:
            for module in modules:
                _purge_module_storage(record, module)
            for directory in _iter_class_dirs(record):
                _delete_storage_path(directory)
        except OSError as error:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove class files: {error}",
            ) from error
        repository.remove_class(class_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/modules", status_code=status.HTTP_201_CREATED)
    async def create_module(payload: ModuleCreatePayload) -> Dict[str, Any]:
        class_record = repository.get_class(payload.class_id)
        if class_record is None:
            raise HTTPException(status_code=404, detail="Class not found")

        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Module name is required")

        try:
            module_id = repository.add_module(
                payload.class_id,
                name,
                payload.description.strip(),
            )
        except Exception as error:  # noqa: BLE001 - propagate integrity issues
            raise HTTPException(status_code=400, detail=str(error)) from error

        record = repository.get_module(module_id)
        if record is None:
            raise HTTPException(status_code=500, detail="Module creation failed")

        return {"module": _serialize_module(repository, record)}

    @app.delete(
        "/api/modules/{module_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def delete_module(module_id: int) -> Response:
        record = repository.get_module(module_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Module not found")
        class_record = repository.get_class(record.class_id)
        if class_record is None:
            raise HTTPException(status_code=404, detail="Class not found")
        try:
            _purge_module_storage(class_record, record)
        except OSError as error:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove module files: {error}",
            ) from error
        repository.remove_module(module_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/lectures", status_code=status.HTTP_201_CREATED)
    async def create_lecture(payload: LectureCreatePayload) -> Dict[str, Any]:
        module = repository.get_module(payload.module_id)
        if module is None:
            raise HTTPException(status_code=404, detail="Module not found")

        try:
            lecture_id = repository.add_lecture(
                payload.module_id,
                payload.name.strip(),
                payload.description.strip(),
            )
        except Exception as error:  # noqa: BLE001 - surface integrity errors
            raise HTTPException(status_code=400, detail=str(error)) from error

        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=500, detail="Lecture creation failed")

        return {"lecture": _serialize_lecture(lecture)}

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

    @app.put("/api/lectures/{lecture_id}")
    async def update_lecture(lecture_id: int, payload: LectureUpdatePayload) -> Dict[str, Any]:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        module_id = payload.module_id if payload.module_id is not None else lecture.module_id
        if repository.get_module(module_id) is None:
            raise HTTPException(status_code=404, detail="Module not found")

        try:
            repository.update_lecture(
                lecture_id,
                name=payload.name.strip() if payload.name is not None else None,
                description=payload.description.strip() if payload.description is not None else None,
                module_id=payload.module_id,
            )
        except Exception as error:  # noqa: BLE001 - propagate integrity errors
            raise HTTPException(status_code=400, detail=str(error)) from error

        updated = repository.get_lecture(lecture_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Lecture update failed")
        return {"lecture": _serialize_lecture(updated)}

    @app.delete(
        "/api/lectures/{lecture_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def delete_lecture(lecture_id: int) -> Response:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")
        class_record, module = _require_hierarchy(lecture)
        try:
            _purge_lecture_storage(lecture, class_record, module)
        except OSError as error:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove lecture files: {error}",
            ) from error
        repository.remove_lecture(lecture_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/lectures/{lecture_id}/assets/{asset_type}")
    async def upload_asset(
        lecture_id: int,
        asset_type: str,
        file: UploadFile = File(...),
    ) -> Dict[str, Any]:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        lecture_paths = LecturePaths.build(
            config.storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        asset_key = asset_type.lower()
        destinations = {
            "audio": ("audio_path", lecture_paths.raw_dir),
            "slides": ("slide_path", lecture_paths.raw_dir),
            "transcript": ("transcript_path", lecture_paths.transcript_dir),
            "notes": ("notes_path", lecture_paths.notes_dir),
        }
        if asset_key not in destinations:
            raise HTTPException(status_code=400, detail="Unsupported asset type")

        attribute, destination = destinations[asset_key]
        destination.mkdir(parents=True, exist_ok=True)
        original_name = Path(file.filename or "").name
        suffix = Path(original_name).suffix if original_name else Path(file.filename or "").suffix
        stem = build_asset_stem(
            class_record.name,
            module.name,
            lecture.name,
            asset_key,
        )
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        candidate_name = original_name or ""
        if not candidate_name:
            candidate_name = build_timestamped_name(stem, timestamp=timestamp, extension=suffix)
        target = destination / candidate_name
        if target.exists():
            candidate_name = build_timestamped_name(stem, timestamp=timestamp, extension=suffix)
            target = destination / candidate_name

        try:
            with target.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        finally:
            await file.close()

        relative = target.relative_to(config.storage_root).as_posix()
        update_kwargs: Dict[str, Optional[str]] = {attribute: relative}

        if asset_key == "slides":
            slide_archive = _generate_slide_archive(
                target, lecture_paths, _make_slide_converter()
            )
            update_kwargs["slide_image_dir"] = slide_archive

        repository.update_lecture_assets(lecture_id, **update_kwargs)
        updated = repository.get_lecture(lecture_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Lecture update failed")
        response: Dict[str, Any] = {"lecture": _serialize_lecture(updated), attribute: relative}
        if asset_key == "slides":
            response["slide_image_dir"] = update_kwargs.get("slide_image_dir")
        return response

    @app.get("/api/settings")
    async def get_settings() -> Dict[str, Any]:
        settings = _load_ui_settings()
        return {"settings": asdict(settings)}

    @app.put("/api/settings")
    async def update_settings(payload: SettingsPayload) -> Dict[str, Any]:
        settings = _load_ui_settings()
        settings.theme = payload.theme
        settings.whisper_model = _normalize_whisper_model(payload.whisper_model)
        settings.whisper_compute_type = (
            payload.whisper_compute_type.strip() or settings.whisper_compute_type
        )
        settings.whisper_beam_size = payload.whisper_beam_size
        settings.slide_dpi = _normalize_slide_dpi(payload.slide_dpi)
        settings_store.save(settings)
        return {"settings": asdict(settings)}

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

    @app.post("/api/lectures/{lecture_id}/transcribe")
    async def transcribe_audio(lecture_id: int, payload: TranscriptionRequest) -> Dict[str, Any]:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")
        if not lecture.audio_path:
            raise HTTPException(status_code=400, detail="Upload an audio file first")
        if FasterWhisperTranscription is None:
            raise HTTPException(
                status_code=503,
                detail="Transcription backend is unavailable. Install faster-whisper.",
            )

        class_record, module = _require_hierarchy(lecture)
        audio_file = _resolve_storage_path(config.storage_root, lecture.audio_path)
        if not audio_file.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")

        lecture_paths = LecturePaths.build(
            config.storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        settings = _load_ui_settings()
        default_settings = UISettings()
        compute_type = settings.whisper_compute_type or default_settings.whisper_compute_type
        beam_size = settings.whisper_beam_size or default_settings.whisper_beam_size

        try:
            engine = FasterWhisperTranscription(
                payload.model,
                download_root=config.assets_root,
                compute_type=compute_type,
                beam_size=beam_size,
            )
            result = engine.transcribe(audio_file, lecture_paths.transcript_dir)
        except Exception as error:  # noqa: BLE001 - backend may raise arbitrary errors
            raise HTTPException(status_code=500, detail=str(error)) from error

        transcript_relative = result.text_path.relative_to(config.storage_root).as_posix()
        repository.update_lecture_assets(lecture_id, transcript_path=transcript_relative)
        updated = repository.get_lecture(lecture_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Lecture update failed")
        response = {"lecture": _serialize_lecture(updated), "transcript_path": transcript_relative}
        if result.segments_path:
            response["segments_path"] = result.segments_path.relative_to(config.storage_root).as_posix()
        return response

    @app.post("/api/lectures/{lecture_id}/process-slides")
    async def process_slides(
        lecture_id: int,
        file: UploadFile = File(...),
        page_start: Optional[int] = Form(None),
        page_end: Optional[int] = Form(None),
    ) -> Dict[str, Any]:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        lecture_paths = LecturePaths.build(
            config.storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        slide_stem = build_asset_stem(
            class_record.name,
            module.name,
            lecture.name,
            "slides",
        )
        slide_filename = build_timestamped_name(slide_stem, timestamp=timestamp, extension=".pdf")
        slide_destination = lecture_paths.raw_dir / slide_filename
        slide_destination.parent.mkdir(parents=True, exist_ok=True)

        try:
            with slide_destination.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        finally:
            await file.close()

        selected_range: Optional[Tuple[int, int]] = None
        if page_start is not None or page_end is not None:
            start = page_start if page_start and page_start > 0 else 1
            end = page_end if page_end and page_end > 0 else start
            if end < start:
                start, end = end, start
            selected_range = (start, end)

        slide_relative = slide_destination.relative_to(config.storage_root).as_posix()
        slide_image_relative = _generate_slide_archive(
            slide_destination,
            lecture_paths,
            _make_slide_converter(),
            page_range=selected_range,
        )

        repository.update_lecture_assets(
            lecture_id,
            slide_path=slide_relative,
            slide_image_dir=slide_image_relative,
        )

        updated = repository.get_lecture(lecture_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Lecture update failed")

        return {
            "lecture": _serialize_lecture(updated),
            "slide_path": slide_relative,
            "slide_image_dir": slide_image_relative,
        }

    @app.post(
        "/api/assets/reveal",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def reveal_asset(payload: RevealRequest) -> Response:
        try:
            target = _resolve_storage_path(config.storage_root, payload.path)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Path is outside storage root") from error

        try:
            _open_in_file_manager(target, select=payload.select)
        except RuntimeError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


__all__ = ["create_app"]
