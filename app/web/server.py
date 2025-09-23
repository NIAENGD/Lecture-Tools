"""FastAPI application powering the Lecture Tools web UI."""

from __future__ import annotations

import asyncio
import platform
import shutil
import stat
import subprocess
import threading
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

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
    from ..processing import (
        FasterWhisperTranscription,
        GPUWhisperModelMissingError,
        GPUWhisperUnsupportedError,
        check_gpu_whisper_availability,
    )
except Exception:  # noqa: BLE001 - optional dependency may be absent
    FasterWhisperTranscription = None  # type: ignore[assignment]
    GPUWhisperModelMissingError = RuntimeError  # type: ignore[assignment]
    GPUWhisperUnsupportedError = RuntimeError  # type: ignore[assignment]
    check_gpu_whisper_availability = None  # type: ignore[assignment]

_TEMPLATE_PATH = Path(__file__).parent / "templates" / "index.html"
_PREVIEW_LIMIT = 1200
_WHISPER_MODEL_OPTIONS: Tuple[str, ...] = ("tiny", "base", "small", "medium", "large", "gpu")
_WHISPER_MODEL_SET = set(_WHISPER_MODEL_OPTIONS)
_SLIDE_DPI_OPTIONS: Tuple[int, ...] = (150, 200, 300, 400, 600)
_SLIDE_DPI_SET = set(_SLIDE_DPI_OPTIONS)
_LANGUAGE_OPTIONS: Tuple[str, ...] = ("en", "zh", "es", "fr")
_LANGUAGE_SET = set(_LANGUAGE_OPTIONS)
_DEFAULT_UI_SETTINGS = UISettings()


class TranscriptionProgressTracker:
    """Track transcription status for UI polling."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._states: Dict[int, Dict[str, Any]] = {}

    def _baseline(self) -> Dict[str, Any]:
        return {
            "active": False,
            "current": None,
            "total": None,
            "ratio": None,
            "message": "",
            "finished": False,
            "error": None,
            "timestamp": None,
        }

    def start(self, lecture_id: int) -> None:
        with self._lock:
            state = self._baseline()
            state.update(
                {
                    "active": True,
                    "message": "====> Preparing transcription…",
                    "timestamp": time.time(),
                }
            )
            self._states[lecture_id] = state

    def update(
        self,
        lecture_id: int,
        current: Optional[float],
        total: Optional[float],
        message: str,
    ) -> None:
        with self._lock:
            state = self._states.get(lecture_id, self._baseline())
            ratio = None
            if total and total > 0 and current is not None:
                ratio = max(0.0, min(current / total, 1.0))
            state.update(
                {
                    "active": True,
                    "current": current,
                    "total": total,
                    "ratio": ratio,
                    "message": message,
                    "finished": False,
                    "error": None,
                    "timestamp": time.time(),
                }
            )
            self._states[lecture_id] = state

    def note(self, lecture_id: int, message: str) -> None:
        self.update(lecture_id, None, None, message)

    def finish(self, lecture_id: int, message: Optional[str] = None) -> None:
        with self._lock:
            state = self._states.get(lecture_id, self._baseline())
            state.update(
                {
                    "active": False,
                    "finished": True,
                    "message": message or state.get("message", ""),
                    "timestamp": time.time(),
                }
            )
            self._states[lecture_id] = state

    def fail(self, lecture_id: int, message: str) -> None:
        with self._lock:
            state = self._states.get(lecture_id, self._baseline())
            state.update(
                {
                    "active": False,
                    "finished": True,
                    "message": message,
                    "error": message,
                    "timestamp": time.time(),
                }
            )
            self._states[lecture_id] = state

    def get(self, lecture_id: int) -> Dict[str, Any]:
        with self._lock:
            state = self._states.get(lecture_id)
            if state is None:
                return self._baseline()
            return dict(state)


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


def _normalize_language(value: Any) -> str:
    """Return a supported interface language code."""

    if isinstance(value, str):
        candidate = value.strip().lower()
    else:
        candidate = str(value or "").strip().lower()
    return candidate if candidate in _LANGUAGE_SET else _DEFAULT_UI_SETTINGS.language


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


class StorageEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int
    modified: Optional[str] = None


class StorageListResponse(BaseModel):
    path: str
    parent: Optional[str]
    entries: List[StorageEntry]


class StorageDeleteRequest(BaseModel):
    path: str


class LectureStorageSummary(BaseModel):
    id: int
    name: str
    size: int
    has_audio: bool
    has_transcript: bool
    has_notes: bool
    has_slides: bool
    eligible_audio: bool


class ModuleStorageSummary(BaseModel):
    id: int
    name: str
    size: int
    lecture_count: int
    audio_count: int
    transcript_count: int
    notes_count: int
    slide_count: int
    eligible_audio_count: int
    lectures: List[LectureStorageSummary]


class ClassStorageSummary(BaseModel):
    id: int
    name: str
    size: int
    module_count: int
    lecture_count: int
    audio_count: int
    transcript_count: int
    notes_count: int
    slide_count: int
    eligible_audio_count: int
    modules: List[ModuleStorageSummary]


class StorageOverviewResponse(BaseModel):
    classes: List[ClassStorageSummary]
    eligible_audio_total: int


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
    language: Literal[*_LANGUAGE_OPTIONS] = _DEFAULT_UI_SETTINGS.language


def create_app(repository: LectureRepository, *, config: AppConfig) -> FastAPI:
    """Return a configured FastAPI application."""

    app = FastAPI(title="Lecture Tools", description="Browse lectures from any device")
    app.state.server = None
    settings_store = SettingsStore(config)
    progress_tracker = TranscriptionProgressTracker()
    gpu_support_state: Dict[str, Any] = {
        "supported": False,
        "checked": False,
        "message": "GPU acceleration not tested.",
        "output": "",
        "last_checked": None,
    }

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
        settings.language = _normalize_language(getattr(settings, "language", None))
        return settings

    def _record_gpu_probe(probe: Dict[str, Any], *, checked: bool = True) -> Dict[str, Any]:
        timestamp = datetime.now(timezone.utc).isoformat()
        gpu_support_state.update(
            {
                "supported": bool(probe.get("supported")),
                "message": str(probe.get("message") or ""),
                "output": str(probe.get("output") or ""),
                "checked": checked,
                "last_checked": timestamp,
                "binary": probe.get("binary"),
                "model": probe.get("model"),
                "unavailable": False,
            }
        )
        return dict(gpu_support_state)

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

    def _handle_remove_readonly(func, path, exc_info) -> None:
        _, error, _ = exc_info
        if not isinstance(error, PermissionError):
            raise error
        target = Path(path)
        try:
            target.chmod(target.stat().st_mode | stat.S_IWRITE)
        except Exception:
            target.chmod(stat.S_IWRITE)
        func(path)

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
            shutil.rmtree(candidate, onerror=_handle_remove_readonly)
        else:
            try:
                candidate.unlink()
            except PermissionError:
                candidate.chmod(candidate.stat().st_mode | stat.S_IWRITE)
                candidate.unlink()

    def _delete_asset_path(relative: Optional[str]) -> None:
        if not relative:
            return
        try:
            asset_path = _resolve_storage_path(config.storage_root, relative)
        except ValueError:
            return
        _delete_storage_path(asset_path)

    def _calculate_directory_size(target: Path) -> int:
        total = 0
        try:
            for child in target.rglob("*"):
                if child.is_symlink():
                    continue
                try:
                    if child.is_file():
                        total += child.stat().st_size
                except (FileNotFoundError, PermissionError, OSError):
                    continue
        except (FileNotFoundError, PermissionError, OSError):
            return total
        return total

    def _build_storage_entry(path: Path) -> StorageEntry:
        stat_result = path.lstat()
        is_dir = path.is_dir() and not path.is_symlink()
        size = 0
        if is_dir:
            size = _calculate_directory_size(path)
        else:
            try:
                size = stat_result.st_size
            except (OSError, ValueError):
                size = 0
        try:
            modified = datetime.fromtimestamp(stat_result.st_mtime, tz=timezone.utc)
            modified_iso = modified.isoformat()
        except (OverflowError, OSError, ValueError):
            modified_iso = None
        relative_path = path.relative_to(config.storage_root).as_posix()
        return StorageEntry(
            name=path.name or relative_path,
            path=relative_path,
            is_dir=is_dir,
            size=size,
            modified=modified_iso,
        )

    def _name_variants(value: str) -> List[str]:
        cleaned = value.strip()
        variants = {slugify(cleaned)}
        if cleaned:
            variants.add(cleaned)
        return list(variants)

    def _resolve_existing_asset(relative: Optional[str]) -> Optional[Path]:
        if not relative:
            return None
        try:
            candidate = _resolve_storage_path(config.storage_root, relative)
        except ValueError:
            return None
        return candidate if candidate.exists() else None

    def _summarize_lecture_storage(
        lecture: LectureRecord, class_record: ClassRecord, module: ModuleRecord
    ) -> LectureStorageSummary:
        total_size = 0
        counted_dirs: List[Path] = []

        def _add_directory(path: Path) -> None:
            nonlocal total_size
            try:
                resolved = path.resolve()
            except (OSError, RuntimeError):
                return
            if not resolved.exists():
                return
            for existing in counted_dirs:
                if resolved == existing:
                    return
                if resolved.is_relative_to(existing):
                    return
                if existing.is_relative_to(resolved):
                    return
            counted_dirs.append(resolved)
            total_size += _calculate_directory_size(resolved)

        for directory in _iter_lecture_dirs(class_record, module, lecture):
            _add_directory(directory)

        counted_files: Set[Path] = set()

        def _add_path(relative: Optional[str]) -> None:
            nonlocal total_size
            asset = _resolve_existing_asset(relative)
            if not asset:
                return
            try:
                resolved = asset.resolve()
            except (OSError, RuntimeError):
                return
            for directory in counted_dirs:
                if resolved.is_relative_to(directory):
                    return
            if resolved in counted_files:
                return
            if resolved.is_dir():
                total_size += _calculate_directory_size(resolved)
            else:
                try:
                    total_size += resolved.stat().st_size
                except (OSError, ValueError):
                    return
            counted_files.add(resolved)

        _add_path(lecture.audio_path)
        _add_path(lecture.slide_path)
        _add_path(lecture.transcript_path)
        _add_path(lecture.notes_path)
        _add_path(lecture.slide_image_dir)

        return LectureStorageSummary(
            id=lecture.id,
            name=lecture.name,
            size=total_size,
            has_audio=bool(lecture.audio_path),
            has_transcript=bool(lecture.transcript_path),
            has_notes=bool(lecture.notes_path),
            has_slides=bool(lecture.slide_path or lecture.slide_image_dir),
            eligible_audio=bool(lecture.audio_path and lecture.transcript_path),
        )

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

    @app.get("/api/settings/whisper-gpu/status")
    async def get_gpu_status() -> Dict[str, Any]:
        if check_gpu_whisper_availability is None:
            state = dict(gpu_support_state)
            state.update(
                {
                    "supported": False,
                    "checked": False,
                    "message": "GPU detection is unavailable on this server.",
                    "unavailable": True,
                }
            )
            return {"status": state}
        state = dict(gpu_support_state)
        state.setdefault("unavailable", False)
        return {"status": state}

    @app.post("/api/settings/whisper-gpu/test")
    async def test_gpu_status() -> Dict[str, Any]:
        if check_gpu_whisper_availability is None:
            raise HTTPException(
                status_code=503,
                detail="GPU detection is unavailable on this server.",
            )
        probe = check_gpu_whisper_availability(config.assets_root)
        state = _record_gpu_probe(probe)
        return {"status": state}

    @app.get("/api/settings")
    async def get_settings() -> Dict[str, Any]:
        settings = _load_ui_settings()
        return {"settings": asdict(settings)}

    @app.put("/api/settings")
    async def update_settings(payload: SettingsPayload) -> Dict[str, Any]:
        settings = _load_ui_settings()
        settings.theme = payload.theme
        settings.language = _normalize_language(payload.language)
        desired_model = _normalize_whisper_model(payload.whisper_model)
        if desired_model == "gpu":
            if check_gpu_whisper_availability is None:
                raise HTTPException(
                    status_code=503,
                    detail="GPU detection is unavailable on this server.",
                )
            probe = check_gpu_whisper_availability(config.assets_root)
            if not probe.get("supported"):
                state = _record_gpu_probe(probe)
                raise HTTPException(status_code=400, detail=str(state.get("message", "")))
            _record_gpu_probe(probe)
        settings.whisper_model = desired_model
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

    @app.get("/api/lectures/{lecture_id}/transcription-progress")
    async def get_transcription_progress(lecture_id: int) -> Dict[str, Any]:
        progress = progress_tracker.get(lecture_id)
        return {"progress": progress}

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

        progress_tracker.start(lecture_id)
        fallback_model: Optional[str] = None
        fallback_reason: Optional[str] = None
        error_reported = False

        def handle_progress(current: float, total: Optional[float], message: str) -> None:
            progress_tracker.update(lecture_id, current, total, message)

        try:
            try:
                engine = FasterWhisperTranscription(
                    payload.model,
                    download_root=config.assets_root,
                    compute_type=compute_type,
                    beam_size=beam_size,
                )
            except GPUWhisperUnsupportedError as error:
                fallback_model = _DEFAULT_UI_SETTINGS.whisper_model
                fallback_reason = str(error)
                _record_gpu_probe({"supported": False, "message": str(error), "output": ""})
                progress_tracker.note(
                    lecture_id,
                    f"====> {error} Falling back to {fallback_model} model.",
                )
                engine = FasterWhisperTranscription(
                    fallback_model,
                    download_root=config.assets_root,
                    compute_type=compute_type,
                    beam_size=beam_size,
                )
            except GPUWhisperModelMissingError as error:
                message = f"====> {error}"
                progress_tracker.fail(lecture_id, message)
                _record_gpu_probe({"supported": False, "message": str(error), "output": ""})
                error_reported = True
                raise HTTPException(status_code=400, detail=str(error)) from error

            result = await asyncio.to_thread(
                engine.transcribe,
                audio_file,
                lecture_paths.transcript_dir,
                progress_callback=handle_progress,
            )
        except HTTPException as error:
            if not error_reported:
                detail = getattr(error, "detail", str(error))
                progress_tracker.fail(lecture_id, f"====> {detail}")
            raise
        except Exception as error:  # noqa: BLE001 - backend may raise arbitrary errors
            progress_tracker.fail(lecture_id, f"====> {error}")
            raise HTTPException(status_code=500, detail=str(error)) from error
        else:
            if payload.model == "gpu" and fallback_model is None:
                _record_gpu_probe(
                    {"supported": True, "message": "GPU Whisper CLI active.", "output": ""}
                )
            progress_tracker.finish(lecture_id, "====> Transcription completed.")

        transcript_relative = result.text_path.relative_to(config.storage_root).as_posix()
        repository.update_lecture_assets(lecture_id, transcript_path=transcript_relative)
        updated = repository.get_lecture(lecture_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Lecture update failed")
        response = {"lecture": _serialize_lecture(updated), "transcript_path": transcript_relative}
        if result.segments_path:
            response["segments_path"] = result.segments_path.relative_to(config.storage_root).as_posix()
        if fallback_model:
            response["fallback_model"] = fallback_model
            if fallback_reason:
                response["fallback_reason"] = fallback_reason
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

    @app.get("/api/storage/usage")
    async def get_storage_usage() -> Dict[str, Any]:
        usage = shutil.disk_usage(config.storage_root)
        return {
            "usage": {
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
            }
        }

    @app.get("/api/storage/list")
    async def list_storage(path: str = "") -> StorageListResponse:
        if path:
            try:
                target = _resolve_storage_path(config.storage_root, path)
            except ValueError as error:
                raise HTTPException(status_code=400, detail="Path is outside storage root") from error
        else:
            target = config.storage_root

        if not target.exists():
            raise HTTPException(status_code=404, detail="Path not found")

        if target.is_file():
            raise HTTPException(status_code=400, detail="Path is not a directory")

        relative_path = ""
        parent_relative: Optional[str]
        if target == config.storage_root:
            parent_relative = None
        else:
            relative_path = target.relative_to(config.storage_root).as_posix()
            parent_path = target.parent
            if parent_path == config.storage_root:
                parent_relative = ""
            else:
                parent_relative = parent_path.relative_to(config.storage_root).as_posix()

        entries: List[StorageEntry] = []
        try:
            for child in target.iterdir():
                try:
                    entries.append(_build_storage_entry(child))
                except (OSError, ValueError):
                    continue
        except (OSError, PermissionError, FileNotFoundError):
            entries = []

        entries.sort(key=lambda entry: (not entry.is_dir, entry.name.lower()))

        return StorageListResponse(path=relative_path, parent=parent_relative, entries=entries)

    @app.get("/api/storage/overview")
    async def get_storage_overview() -> StorageOverviewResponse:
        classes: List[ClassStorageSummary] = []
        eligible_total = 0

        for class_record in repository.iter_classes():
            modules: List[ModuleStorageSummary] = []
            class_size = 0
            class_lecture_count = 0
            class_audio = 0
            class_transcripts = 0
            class_notes = 0
            class_slides = 0
            class_eligible = 0

            module_records = list(repository.iter_modules(class_record.id))
            for module in module_records:
                lectures: List[LectureStorageSummary] = []
                module_size = 0
                module_audio = 0
                module_transcripts = 0
                module_notes = 0
                module_slides = 0
                module_eligible = 0

                lecture_records = list(repository.iter_lectures(module.id))
                for lecture in lecture_records:
                    summary = _summarize_lecture_storage(lecture, class_record, module)
                    lectures.append(summary)
                    module_size += summary.size
                    class_size += summary.size

                    module_audio += int(summary.has_audio)
                    module_transcripts += int(summary.has_transcript)
                    module_notes += int(summary.has_notes)
                    module_slides += int(summary.has_slides)
                    module_eligible += int(summary.eligible_audio)

                module_lecture_count = len(lectures)
                class_lecture_count += module_lecture_count
                class_audio += module_audio
                class_transcripts += module_transcripts
                class_notes += module_notes
                class_slides += module_slides
                class_eligible += module_eligible
                eligible_total += module_eligible

                modules.append(
                    ModuleStorageSummary(
                        id=module.id,
                        name=module.name,
                        size=module_size,
                        lecture_count=module_lecture_count,
                        audio_count=module_audio,
                        transcript_count=module_transcripts,
                        notes_count=module_notes,
                        slide_count=module_slides,
                        eligible_audio_count=module_eligible,
                        lectures=lectures,
                    )
                )

            classes.append(
                ClassStorageSummary(
                    id=class_record.id,
                    name=class_record.name,
                    size=class_size,
                    module_count=len(module_records),
                    lecture_count=class_lecture_count,
                    audio_count=class_audio,
                    transcript_count=class_transcripts,
                    notes_count=class_notes,
                    slide_count=class_slides,
                    eligible_audio_count=class_eligible,
                    modules=modules,
                )
            )

        return StorageOverviewResponse(classes=classes, eligible_audio_total=eligible_total)

    @app.delete("/api/storage")
    async def delete_storage(payload: StorageDeleteRequest) -> Dict[str, str]:
        try:
            target = _resolve_storage_path(config.storage_root, payload.path)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Path is outside storage root") from error

        if target == config.storage_root:
            raise HTTPException(status_code=400, detail="Cannot delete storage root")

        if not target.exists():
            raise HTTPException(status_code=404, detail="Path not found")

        _delete_storage_path(target)

        return {"status": "deleted"}

    @app.post("/api/storage/purge-audio")
    async def purge_transcribed_audio() -> Dict[str, int]:
        deleted = 0
        for class_record in repository.iter_classes():
            for module in repository.iter_modules(class_record.id):
                for lecture in repository.iter_lectures(module.id):
                    if not (lecture.audio_path and lecture.transcript_path):
                        continue
                    audio_path = _resolve_existing_asset(lecture.audio_path)
                    if audio_path:
                        _delete_storage_path(audio_path)
                    repository.update_lecture_assets(lecture.id, audio_path=None)
                    deleted += 1
        return {"deleted": deleted}

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

    @app.post("/api/system/shutdown", status_code=status.HTTP_202_ACCEPTED)
    async def shutdown_application() -> Dict[str, str]:
        server = getattr(app.state, "server", None)
        if server is None:
            raise HTTPException(status_code=503, detail="Shutdown is unavailable.")

        server.should_exit = True
        if hasattr(server, "force_exit"):
            server.force_exit = True

        return {"status": "shutting_down"}

    return app


__all__ = ["create_app"]
