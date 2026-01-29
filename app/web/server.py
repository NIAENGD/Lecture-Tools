"""FastAPI application powering the Lecture Tools web UI."""

from __future__ import annotations

import asyncio
import functools
import contextlib
import contextvars
import json
import logging
import mimetypes
import os
import platform
import re
import shlex
import shutil
import stat
import sqlite3
import sys
import subprocess
import threading
import time
import traceback
import uuid
import zipfile
from collections import Counter, defaultdict, deque
from collections.abc import Mapping, Sequence, Set as AbstractSet
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import (
    Any,
    Awaitable,
    Callable,
    Deque,
    Dict,
    Iterable,
    List,
    Literal,
    Optional,
    Set,
    Tuple,
    TypeVar,
)

from concurrent.futures import Future, ThreadPoolExecutor

T = TypeVar("T")

TaskOperation = Literal["audio_mastering", "slide_bundle", "slide_merge", "transcription"]

BULK_DOWNLOAD_ASSET_FIELDS: Dict[str, Tuple[str, ...]] = {
    "audio": ("processed_audio_path", "audio_path"),
    "txt": ("transcript_path",),
    "pdf": ("slide_path",),
    "md": ("notes_path",),
    "zip": ("slide_image_dir",),
}


class AudioMasteringUnavailableError(RuntimeError):
    """Raised when mastering cannot proceed because WAV conversion failed."""


@dataclass
class QueuedTask:
    """Represents a background task scheduled by the task queue."""

    id: str
    lecture_id: int
    operation: TaskOperation
    options: Dict[str, Any] = field(default_factory=dict)
    status: Literal["pending", "running", "succeeded", "failed"] = "pending"
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    error: Optional[str] = None

    def mark_running(self) -> None:
        self.status = "running"
        self.started_at = time.time()
        self.error = None

    def mark_finished(self) -> None:
        self.status = "succeeded"
        self.completed_at = time.time()

    def mark_failed(self, message: str) -> None:
        self.status = "failed"
        self.completed_at = time.time()
        self.error = message


class TaskQueue:
    """Simple FIFO queue that executes tasks sequentially."""

    def __init__(self, processor: Callable[[QueuedTask], Awaitable[None]]) -> None:
        self._processor = processor
        self._pending: Deque[QueuedTask] = deque()
        self._tasks: Deque[QueuedTask] = deque()
        self._index: Dict[str, QueuedTask] = {}
        self._lock = asyncio.Lock()
        self._pending_event = asyncio.Event()
        self._worker: Optional[asyncio.Task[None]] = None
        self._history_limit = 200
        self._stopping = False

    async def start(self) -> None:
        async with self._lock:
            if self._worker is None or self._worker.done():
                self._stopping = False
                loop = asyncio.get_running_loop()
                self._worker = loop.create_task(self._run(), name="task-queue-worker")

    async def stop(self) -> None:
        async with self._lock:
            self._stopping = True
            self._pending_event.set()
            worker = self._worker
            self._worker = None
        if worker is not None:
            worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await worker

    async def enqueue(
        self, lecture_id: int, operation: TaskOperation, options: Optional[Dict[str, Any]] = None
    ) -> QueuedTask:
        entry = QueuedTask(
            id=_new_correlation_id(),
            lecture_id=lecture_id,
            operation=operation,
            options=dict(options or {}),
        )
        async with self._lock:
            self._pending.append(entry)
            self._tasks.append(entry)
            self._index[entry.id] = entry
            self._pending_event.set()
            self._prune_history_locked()
        await self.start()
        return entry

    async def list(self) -> List[QueuedTask]:
        async with self._lock:
            return [task for task in self._tasks]

    async def _wait_for_task(self) -> None:
        while True:
            async with self._lock:
                if self._pending or self._stopping:
                    return
                self._pending_event.clear()
            await self._pending_event.wait()

    async def _acquire_next(self) -> Optional[QueuedTask]:
        async with self._lock:
            if self._pending:
                task = self._pending.popleft()
                task.mark_running()
                return task
            return None

    async def _run(self) -> None:
        try:
            while True:
                await self._wait_for_task()
                if self._stopping:
                    return
                task = await self._acquire_next()
                if task is None:
                    continue
                try:
                    await self._processor(task)
                except Exception as error:  # noqa: BLE001 - surface task failure
                    message = str(error)
                    task.mark_failed(message or "Task failed")
                    LOGGER.exception(
                        "Background task %s failed for lecture %s", task.operation, task.lecture_id
                    )
                else:
                    task.mark_finished()
                finally:
                    async with self._lock:
                        self._prune_history_locked()
        except asyncio.CancelledError:  # pragma: no cover - cooperative cancellation
            raise

    def _prune_history_locked(self) -> None:
        while len(self._tasks) > self._history_limit:
            oldest = self._tasks[0]
            if oldest.status in {"succeeded", "failed"}:
                self._tasks.popleft()
                self._index.pop(oldest.id, None)
            else:
                break

    async def clear_completed(self) -> int:
        async with self._lock:
            remaining: Deque[QueuedTask] = deque()
            cleared = 0
            for task in self._tasks:
                if task.status in {"succeeded", "failed"}:
                    self._index.pop(task.id, None)
                    cleared += 1
                else:
                    remaining.append(task)
            self._tasks = remaining
            return cleared

    async def cancel_all(self, reason: str = "Cancelled") -> int:
        async with self._lock:
            cancelled = 0
            for task in self._tasks:
                if task.status in {"pending", "running"}:
                    task.mark_failed(reason)
                    cancelled += 1
            self._pending.clear()
            self._stopping = True
            self._pending_event.set()
            worker = self._worker
            self._worker = None
        if worker is not None:
            worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await worker
        return cancelled

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Form,
    Query,
    Response,
    Request,
)
from fastapi import status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.formparsers import MultiPartParser
from starlette.types import ASGIApp, Receive, Scope, Send

from .. import config as config_module
from ..config import AppConfig
from ..processing import (
    PyMuPDFSlideConverter,
    SlideConversionDependencyError,
    SlideConversionError,
    describe_audio_debug_stats,
    get_pdf_page_count,
    load_wav_file,
    preprocess_audio,
    render_pdf_page,
    save_preprocessed_wav,
)
from ..services.audio_conversion import ensure_wav, ffmpeg_available
from ..services.events import (
    emit_db_event,
    emit_file_event,
    emit_structured_event,
    emit_task_event,
    normalize_context as _normalize_event_context,
    sanitize_context_value as _sanitize_context_value,
)
from ..services.ingestion import LecturePaths, TranscriptResult
from ..services.naming import build_asset_stem, build_timestamped_name, slugify
from ..services.progress import (
    AUDIO_MASTERING_TOTAL_STEPS,
    build_mastering_stage_progress_message,
    format_progress_message,
)
from ..services.settings import (
    DEFAULT_DISPLAY_MODE,
    DEFAULT_THEME,
    DEFAULT_VISUAL_EFFECTS,
    DISPLAY_MODE_OPTIONS,
    EFFECTS_LEVEL_OPTIONS,
    SettingsStore,
    THEME_OPTIONS,
    UISettings,
    normalize_display_mode,
    normalize_theme,
    normalize_visual_effects,
    resolve_theme_preferences,
)
from ..services.storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord
from ..logging_utils import DEFAULT_LOG_FORMAT

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

_STATIC_ROOT = Path(__file__).parent / "static"
_TEMPLATE_PATH = Path(__file__).parent / "templates" / "index.html"
_PREVIEW_LIMIT = 1200
_WHISPER_MODEL_OPTIONS: Tuple[str, ...] = ("tiny", "base", "small", "medium", "large", "gpu")
_WHISPER_MODEL_SET = set(_WHISPER_MODEL_OPTIONS)
_SLIDE_DPI_OPTIONS: Tuple[int, ...] = (150, 200, 300, 400, 600)
_SLIDE_DPI_SET = set(_SLIDE_DPI_OPTIONS)
_LANGUAGE_OPTIONS: Tuple[str, ...] = ("en", "zh", "es", "fr")
_LANGUAGE_SET = set(_LANGUAGE_OPTIONS)
_THEME_OPTIONS: Tuple[str, ...] = tuple(THEME_OPTIONS)
_THEME_INPUT_OPTIONS: Tuple[str, ...] = _THEME_OPTIONS + (
    "bright-vibrant",
    "bright-serene",
    "bright-kawaii",
    "dark-cool",
    "dark-aurora",
    "dark-midnight",
    "light",
    "dark",
)
_DISPLAY_MODE_OPTIONS: Tuple[str, ...] = tuple(DISPLAY_MODE_OPTIONS)
_VISUAL_EFFECT_OPTIONS: Tuple[str, ...] = tuple(EFFECTS_LEVEL_OPTIONS)
_DEFAULT_UI_SETTINGS = UISettings()
_SERVER_LOGGER_PREFIXES: Tuple[str, ...] = ("uvicorn", "gunicorn", "hypercorn", "werkzeug")
_SLIDE_PREVIEW_DIR_NAME = ".previews"
_AUDIO_MANIFEST_FILENAME = "audio_manifest.json"
_SLIDE_MANIFEST_FILENAME = "slides_manifest.json"
_SLIDE_PREVIEW_TOKEN_PATTERN = re.compile(r"^[a-f0-9]{16,64}$")
_DB_SLOW_WARNING_MS = 450.0
_FILE_SLOW_WARNING_MS = 300.0

_DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
_UPDATE_LOG_LIMIT = 500
try:
    _MAX_UPLOAD_BYTES = int(
        (os.environ.get("LECTURE_TOOLS_MAX_UPLOAD_BYTES") or "").strip() or _DEFAULT_MAX_UPLOAD_BYTES
    )
except ValueError:
    _MAX_UPLOAD_BYTES = _DEFAULT_MAX_UPLOAD_BYTES

_DEFAULT_UPLOAD_CHUNK_SIZE = 1024 * 1024

def get_max_upload_bytes() -> int:
    """Return the configured maximum upload size in bytes."""

    return int(_MAX_UPLOAD_BYTES)


_REQUEST_ID_VAR: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "lecture_tools_request_id",
    default=None,
)
_JOB_ID_VAR: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "lecture_tools_job_id",
    default=None,
)
_ACTOR_VAR: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "lecture_tools_actor",
    default=None,
)


def _new_correlation_id() -> str:
    return uuid.uuid4().hex


def _format_actor_label(role: str, detail: Optional[str] = None) -> str:
    base = role.strip() if role else "actor"
    if detail is None:
        return base
    suffix = str(detail).strip()
    return f"{base}:{suffix}" if suffix else base


def _collect_correlation_context() -> Dict[str, str]:
    context: Dict[str, str] = {}
    request_id = _REQUEST_ID_VAR.get()
    if request_id:
        context["request_id"] = str(request_id)
    job_id = _JOB_ID_VAR.get()
    if job_id:
        context["job_id"] = str(job_id)
    actor = _ACTOR_VAR.get()
    if actor:
        context["actor"] = str(actor)
    return context


class LargeUploadRequest(Request):
    """Request subclass that applies the configured multipart upload limit."""

    async def _get_form(
        self,
        *,
        max_files: int | float = 1000,
        max_fields: int | float = 1000,
        max_part_size: int = 1024 * 1024,
    ) -> "FormData":
        configured_limit = get_max_upload_bytes()
        effective_limit = int(max_part_size)
        if configured_limit > 0:
            effective_limit = max(int(configured_limit), effective_limit)
        else:
            effective_limit = sys.maxsize
        return await super()._get_form(
            max_files=max_files,
            max_fields=max_fields,
            max_part_size=effective_limit,
        )


class RequestContextMiddleware:
    """Assign a correlation identifier to each request and expose it via contextvars."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request_id = _new_correlation_id()
        scope_state = scope.get("state")
        if scope_state is None:
            scope_state = {}
            scope["state"] = scope_state
        if isinstance(scope_state, dict):
            scope_state["request_id"] = request_id
        else:
            setattr(scope_state, "request_id", request_id)

        method = scope.get("method")
        actor_hint = _format_actor_label("request", method.upper() if isinstance(method, str) else None)
        request_token = _REQUEST_ID_VAR.set(request_id)
        actor_token = _ACTOR_VAR.set(actor_hint)
        job_token = _JOB_ID_VAR.set(None)

        try:
            await self.app(scope, receive, send)
        finally:
            _JOB_ID_VAR.reset(job_token)
            _ACTOR_VAR.reset(actor_token)
            _REQUEST_ID_VAR.reset(request_token)


def _copy_upload_stream(
    upload: UploadFile,
    target: Path,
    *,
    chunk_size: int = _DEFAULT_UPLOAD_CHUNK_SIZE,
) -> None:
    """Synchronously copy ``upload`` to ``target`` using a bounded chunk size."""

    source = upload.file
    if hasattr(source, "seek"):
        with contextlib.suppress(OSError, ValueError):
            source.seek(0)
    with target.open("wb") as buffer:
        shutil.copyfileobj(source, buffer, length=chunk_size)


async def _persist_upload_file(
    upload: UploadFile,
    target: Path,
    *,
    chunk_size: int = _DEFAULT_UPLOAD_CHUNK_SIZE,
) -> None:
    """Persist an uploaded file to disk without blocking the event loop."""

    loop = asyncio.get_running_loop()
    copy_operation = functools.partial(_copy_upload_stream, upload, target, chunk_size=chunk_size)
    await loop.run_in_executor(None, copy_operation)

class ContextualLoggerAdapter(logging.LoggerAdapter):
    """Logger adapter that injects correlation context into records."""

    def process(self, msg: Any, kwargs: Dict[str, Any]) -> tuple[Any, Dict[str, Any]]:  # type: ignore[override]
        extra: Dict[str, Any] = dict(self.extra)
        provided = kwargs.get("extra")
        if isinstance(provided, dict):
            extra.update(provided)
        correlation = _collect_correlation_context()
        for key, value in correlation.items():
            extra.setdefault(key, value)
        kwargs["extra"] = extra
        return msg, kwargs


LOGGER = ContextualLoggerAdapter(logging.getLogger(__name__), {})
EVENT_LOGGER = ContextualLoggerAdapter(logging.getLogger("lecture_tools.ui.events"), {})


_PDF_PAGE_COUNT_TIMEOUT_SECONDS = 8.0
def _emit_debug_event(
    event_type: str,
    message: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    level: int = logging.INFO,
    logger: logging.Logger = EVENT_LOGGER,
) -> None:
    correlation = _collect_correlation_context()
    emit_structured_event(
        event_type,
        message,
        payload=payload,
        context=context,
        correlation=correlation,
        duration_ms=duration_ms,
        level=level,
        logger=logger,
    )


def _emit_db_event(
    action: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    level: int = logging.INFO,
) -> None:
    correlation = _collect_correlation_context()
    emit_db_event(
        action,
        payload=payload,
        context=context,
        correlation=correlation,
        duration_ms=duration_ms,
        level=level,
        logger=EVENT_LOGGER,
    )


def _emit_file_event(
    operation: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    level: int = logging.INFO,
) -> None:
    correlation = _collect_correlation_context()
    emit_file_event(
        operation,
        payload=payload,
        context=context,
        correlation=correlation,
        duration_ms=duration_ms,
        level=level,
        logger=EVENT_LOGGER,
    )


def _emit_task_state(
    phase: str,
    *,
    tracker: str,
    lecture_id: Optional[int],
    message: str,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
) -> None:
    event_payload: Dict[str, Any] = {"task": tracker, "phase": phase}
    if lecture_id is not None:
        event_payload["lecture_id"] = lecture_id
    if payload:
        event_payload.update(payload)
    correlation = _collect_correlation_context()
    emit_task_event(
        phase,
        message or phase,
        payload=event_payload,
        context=context,
        correlation=correlation,
        duration_ms=duration_ms,
        logger=EVENT_LOGGER,
    )


def _log_event(message: str, **context: Any) -> None:
    _emit_debug_event("APP_EVENT", message, context=context)


# Ensure PDF.js module assets are served with the correct MIME type for dynamic import.
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/javascript", ".mjs")


class DebugLogHandler(logging.Handler):
    """In-memory log handler used to power the live debug console."""

    _IGNORED_FIELDS: Set[str] = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "process",
        "processName",
        "getMessage",
    }
    _SEVERITY_PRIORITY: Dict[str, int] = {"error": 3, "warning": 2, "info": 1}

    def __init__(self, capacity: int = 500) -> None:
        super().__init__(level=logging.DEBUG)
        self._capacity = max(1, capacity)
        self._entries: Deque[Dict[str, Any]] = deque()
        self._entry_index: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._last_id = 0
        self.setFormatter(logging.Formatter(DEFAULT_LOG_FORMAT))
        self._started_at = datetime.now(timezone.utc)

    def _extract_duration(self, record: logging.LogRecord) -> Optional[float]:
        candidate = getattr(record, "debug_duration_ms", None)
        if candidate is None:
            candidate = getattr(record, "duration_ms", None)
        if candidate is None:
            return None
        try:
            return float(candidate)
        except (TypeError, ValueError):
            return None

    def _extract_context(self, record: logging.LogRecord) -> Dict[str, Any]:
        context = getattr(record, "debug_context", None)
        if isinstance(context, dict):
            return {
                str(key): value
                for key, value in _normalize_event_context(context).items()
            }
        return {}

    def _extract_payload(self, record: logging.LogRecord) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        raw_payload = getattr(record, "debug_payload", None)
        if isinstance(raw_payload, dict):
            payload.update(_normalize_event_context(raw_payload))
        for key, value in record.__dict__.items():
            if key in self._IGNORED_FIELDS or key.startswith("_"):
                continue
            if key in {
                "debug_context",
                "debug_event",
                "debug_event_type",
                "debug_payload",
                "debug_duration_ms",
                "request_id",
                "job_id",
                "actor",
            }:
                continue
            sanitized = _sanitize_context_value(value)
            if sanitized is None:
                continue
            payload[str(key)] = sanitized
        if "duration_ms" in payload:
            payload.pop("duration_ms")
        return payload

    def _extract_correlation(self, record: logging.LogRecord) -> Dict[str, str]:
        correlation: Dict[str, str] = {}
        stored = getattr(record, "debug_correlation", None)
        if isinstance(stored, dict):
            for key, value in stored.items():
                sanitized = _sanitize_context_value(value)
                if sanitized is None:
                    continue
                correlation[str(key)] = str(sanitized)
        for field in ("request_id", "job_id", "actor"):
            value = getattr(record, field, None)
            if value is None:
                continue
            sanitized = _sanitize_context_value(value)
            if sanitized is None:
                continue
            correlation.setdefault(field, str(sanitized))
        return correlation

    def _compute_severity(
        self,
        record: logging.LogRecord,
        payload: Dict[str, Any],
        duration_ms: Optional[float],
    ) -> Optional[str]:
        event_type = str(getattr(record, "debug_event_type", "") or "")
        level = record.levelno
        error_flag = False
        if payload:
            error_flag = bool(
                payload.get("error")
                or payload.get("status") in {"error", "failed", "exception"}
                or payload.get("severity") == "error"
            )
        if level >= logging.ERROR or error_flag:
            return "error"
        slow_threshold: Optional[float] = None
        if event_type == "DB_QUERY":
            slow_threshold = _DB_SLOW_WARNING_MS
        elif event_type == "FILE_OP":
            slow_threshold = _FILE_SLOW_WARNING_MS
        if slow_threshold is not None and duration_ms is not None:
            if duration_ms >= slow_threshold:
                return "warning"
        if level >= logging.WARNING:
            return "warning"
        return None

    def _freeze_value(self, value: Any) -> Any:
        """Return a hashable representation of *value* for key construction."""

        if isinstance(value, Mapping):
            return tuple(
                (str(key), self._freeze_value(item))
                for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
            )
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            return tuple(self._freeze_value(item) for item in value)
        if isinstance(value, AbstractSet):
            return tuple(sorted(self._freeze_value(item) for item in value))
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, Path):
            return str(value)
        try:
            hash(value)
        except TypeError:
            return str(value)
        return value

    def _build_key(
        self,
        event_type: str,
        message: str,
        context: Dict[str, Any],
        payload: Dict[str, Any],
        correlation: Dict[str, Any],
    ) -> Tuple[Any, ...]:
        context_items = (
            tuple((key, self._freeze_value(value)) for key, value in sorted(context.items()))
            if context
            else tuple()
        )
        payload_items = (
            tuple((key, self._freeze_value(value)) for key, value in sorted(payload.items()))
            if payload
            else tuple()
        )
        correlation_items = (
            tuple(
                (key, self._freeze_value(value)) for key, value in sorted(correlation.items())
            )
            if correlation
            else tuple()
        )
        return (event_type, message, context_items, payload_items, correlation_items)

    def _serialize_entry(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        exported = {key: value for key, value in entry.items() if key != "_key"}
        if "last_seen" in exported and "timestamp" not in exported:
            exported["timestamp"] = exported["last_seen"]
        return exported

    def emit(self, record: logging.LogRecord) -> None:  # noqa: D401 - inherited documentation
        rendered_message = record.getMessage()
        if not isinstance(rendered_message, str):
            rendered_message = str(rendered_message)
        if record.exc_info:
            formatter = self.formatter or logging.Formatter()
            try:
                exception_text = formatter.formatException(record.exc_info)
            except Exception:  # pragma: no cover - defensive
                exception_text = logging.Formatter().formatException(record.exc_info)
            if exception_text:
                rendered_message = f"{rendered_message}\n{exception_text}"

        base_message = getattr(record, "debug_event", None)
        if base_message is None:
            base_message = rendered_message
        else:
            base_message = str(base_message)

        context = self._extract_context(record)
        payload = self._extract_payload(record)
        duration_ms = self._extract_duration(record)
        correlation = self._extract_correlation(record)
        severity = self._compute_severity(record, payload, duration_ms)

        timestamp = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat()
        event_type = str(getattr(record, "debug_event_type", record.name))
        category = (
            "server"
            if any(record.name.startswith(prefix) for prefix in _SERVER_LOGGER_PREFIXES)
            else "application"
        )
        if event_type == "TASK_STATE":
            category = "task"
        key = self._build_key(event_type, base_message, context, payload, correlation)

        with self._lock:
            self._last_id += 1
            occurrence_id = self._last_id
            existing = self._entry_index.get(key)
            if existing is not None:
                try:
                    self._entries.remove(existing)
                except ValueError:  # pragma: no cover - defensive
                    pass
                existing["id"] = occurrence_id
                existing["last_seen"] = timestamp
                existing["count"] = existing.get("count", 1) + 1
                existing["level"] = record.levelname
                existing["logger"] = record.name
                existing["category"] = category
                if context:
                    existing["context"] = context
                elif "context" in existing:
                    existing.pop("context", None)
                if payload:
                    existing["payload"] = payload
                elif "payload" in existing:
                    existing.pop("payload", None)
                if rendered_message != base_message:
                    existing["rendered"] = rendered_message
                elif "rendered" in existing:
                    existing.pop("rendered", None)
                if duration_ms is not None:
                    total_duration = existing.get("total_duration_ms", 0.0) + duration_ms
                    existing["total_duration_ms"] = total_duration
                    existing["last_duration_ms"] = duration_ms
                    existing["average_duration_ms"] = total_duration / existing["count"]
                    existing["min_duration_ms"] = min(
                        existing.get("min_duration_ms", duration_ms), duration_ms
                    )
                    existing["max_duration_ms"] = max(
                        existing.get("max_duration_ms", duration_ms), duration_ms
                    )
                if severity:
                    previous = str(existing.get("severity", "")) if existing.get("severity") else ""
                    prev_rank = self._SEVERITY_PRIORITY.get(previous.lower(), 0)
                    new_rank = self._SEVERITY_PRIORITY.get(severity, 0)
                    if new_rank >= prev_rank:
                        existing["severity"] = severity
                if correlation:
                    existing.update(correlation)
                existing["_key"] = key
                self._entries.append(existing)
            else:
                entry: Dict[str, Any] = {
                    "id": occurrence_id,
                    "message": base_message,
                    "event_type": event_type,
                    "level": record.levelname,
                    "logger": record.name,
                    "category": category,
                    "count": 1,
                    "first_seen": timestamp,
                    "last_seen": timestamp,
                    "_key": key,
                }
                if severity:
                    entry["severity"] = severity
                if context:
                    entry["context"] = context
                if payload:
                    entry["payload"] = payload
                if rendered_message != base_message:
                    entry["rendered"] = rendered_message
                if duration_ms is not None:
                    entry["total_duration_ms"] = duration_ms
                    entry["average_duration_ms"] = duration_ms
                    entry["last_duration_ms"] = duration_ms
                    entry["min_duration_ms"] = duration_ms
                    entry["max_duration_ms"] = duration_ms
                if correlation:
                    entry.update(correlation)
                self._entries.append(entry)
                self._entry_index[key] = entry
                while len(self._entries) > self._capacity:
                    oldest = self._entries.popleft()
                    old_key = oldest.pop("_key", None)
                    if old_key is not None:
                        self._entry_index.pop(old_key, None)

    def collect(self, after: Optional[int] = None, limit: int = 200) -> List[Dict[str, Any]]:
        with self._lock:
            if after is None or after <= 0:
                data = list(self._entries)
            else:
                data = [entry for entry in self._entries if entry.get("id", 0) > after]
        if not data:
            return []
        sliced = data[-limit:]
        return [self._serialize_entry(entry) for entry in sliced]

    def export_text(self) -> str:
        with self._lock:
            entries = [self._serialize_entry(entry) for entry in self._entries]
        if not entries:
            return "# Debug log is currently empty.\n"

        lines: List[str] = []
        for entry in entries:
            timestamp = (
                entry.get("timestamp")
                or entry.get("last_seen")
                or entry.get("first_seen")
                or ""
            )
            level = str(entry.get("level", "")).upper()
            event_type = str(entry.get("event_type", ""))
            message = str(entry.get("message", ""))
            severity = entry.get("severity")
            duration = (
                entry.get("last_duration_ms")
                or entry.get("average_duration_ms")
                or entry.get("total_duration_ms")
            )
            context = entry.get("context") if isinstance(entry.get("context"), Mapping) else None
            payload = entry.get("payload") if isinstance(entry.get("payload"), Mapping) else None
            correlation = {
                key: entry.get(key)
                for key in ("request_id", "job_id", "actor")
                if entry.get(key)
            }

            base = f"[{timestamp}] {level:<7} {event_type}: {message}".strip()
            detail_parts: List[str] = []
            if severity:
                detail_parts.append(f"severity={severity}")
            if duration:
                try:
                    detail_parts.append(f"duration_ms={float(duration):.3f}")
                except (TypeError, ValueError):
                    detail_parts.append(f"duration_ms={duration}")
            if context:
                detail_parts.append(
                    "context=" + json.dumps(context, ensure_ascii=False, sort_keys=True)
                )
            if payload:
                detail_parts.append(
                    "payload=" + json.dumps(payload, ensure_ascii=False, sort_keys=True)
                )
            if correlation:
                detail_parts.append(
                    "correlation="
                    + json.dumps(correlation, ensure_ascii=False, sort_keys=True)
                )
            line = base
            if detail_parts:
                line = f"{base} | " + " | ".join(detail_parts)
            lines.append(line)

        return "\n".join(lines) + "\n"

    @property
    def started_at(self) -> datetime:
        return self._started_at

    @property
    def last_id(self) -> int:
        with self._lock:
            return self._last_id


class TranscriptionProgressTracker:
    """Track transcription status for UI polling."""

    def __init__(self, *, name: str = "task") -> None:
        self._lock = threading.Lock()
        self._states: Dict[str, Dict[str, Any]] = {}
        self._name = name

    def _task_id(self, lecture_id: int) -> str:
        return f"{self._name}:{lecture_id}"

    def _baseline(self, task_id: str, lecture_id: int) -> Dict[str, Any]:
        return {
            "task_id": task_id,
            "lecture_id": lecture_id,
            "operation": self._name,
            "status": "idle",
            "phase": "idle",
            "step": None,
            "active": False,
            "finished": False,
            "message": "",
            "error": None,
            "exception": None,
            "current": None,
            "total": None,
            "ratio": None,
            "started_at": None,
            "updated_at": None,
            "completed_at": None,
            "context": {},
        }

    def _merge_context(
        self, state: Dict[str, Any], context: Optional[Dict[str, Any]] = None
    ) -> None:
        filtered: Dict[str, Any] = {}
        if context:
            filtered = {
                key: value
                for key, value in context.items()
                if key is not None and value is not None
            }
        existing_context = state.get("context")
        combined: Dict[str, Any] = {}
        if isinstance(existing_context, dict):
            combined.update(existing_context)
        correlation = _collect_correlation_context()
        correlation_keys = set(correlation)
        if correlation:
            combined.update(correlation)
        for key, value in filtered.items():
            if key in correlation_keys and correlation.get(key) is not None:
                continue
            combined[key] = value
        if combined:
            state["context"] = combined

    def _emit(self, lecture_id: int, state: Dict[str, Any], message: str) -> None:
        snapshot = dict(state)
        payload = {
            "task_id": snapshot.get("task_id"),
            "operation": snapshot.get("operation"),
            "status": snapshot.get("status"),
            "phase": snapshot.get("phase"),
            "step": snapshot.get("step"),
            "lecture_id": snapshot.get("lecture_id"),
            "active": snapshot.get("active"),
            "finished": snapshot.get("finished"),
            "message": snapshot.get("message"),
            "error": snapshot.get("error"),
            "exception": snapshot.get("exception"),
            "current": snapshot.get("current"),
            "total": snapshot.get("total"),
            "ratio": snapshot.get("ratio"),
            "started_at": snapshot.get("started_at"),
            "updated_at": snapshot.get("updated_at"),
            "completed_at": snapshot.get("completed_at"),
        }
        _emit_task_state(
            snapshot.get("phase", "update"),
            tracker=self._name,
            lecture_id=lecture_id,
            message=message,
            payload=payload,
            context=snapshot.get("context"),
        )

    def _calculate_ratio(
        self, current: Optional[float], total: Optional[float]
    ) -> Optional[float]:
        if total and total > 0 and current is not None:
            return max(0.0, min(current / total, 1.0))
        return None

    def start(
        self,
        lecture_id: int,
        message: str = "====> Preparing transcription…",
        *,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        task_id = self._task_id(lecture_id)
        timestamp = time.time()
        with self._lock:
            state = self._baseline(task_id, lecture_id)
            state.update(
                {
                    "active": True,
                    "status": "running",
                    "phase": "start",
                    "step": message,
                    "message": message,
                    "started_at": timestamp,
                    "updated_at": timestamp,
                    "finished": False,
                    "error": None,
                    "exception": None,
                }
            )
            self._merge_context(state, context)
            self._states[task_id] = state
        self._emit(lecture_id, state, message)
        return task_id

    def update(
        self,
        lecture_id: int,
        current: Optional[float],
        total: Optional[float],
        message: str,
        *,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        task_id = self._task_id(lecture_id)
        timestamp = time.time()
        with self._lock:
            state = self._states.get(task_id, self._baseline(task_id, lecture_id))
            ratio = self._calculate_ratio(current, total)
            state.update(
                {
                    "active": True,
                    "status": "running",
                    "phase": "progress",
                    "step": message,
                    "message": message,
                    "current": current,
                    "total": total,
                    "ratio": ratio,
                    "updated_at": timestamp,
                    "finished": False,
                    "error": None,
                    "exception": None,
                }
            )
            self._merge_context(state, context)
            self._states[task_id] = state
        self._emit(lecture_id, state, message)

    def note(
        self,
        lecture_id: int,
        message: str,
        *,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        task_id = self._task_id(lecture_id)
        timestamp = time.time()
        with self._lock:
            state = self._states.get(task_id, self._baseline(task_id, lecture_id))
            state.update(
                {
                    "active": True,
                    "status": "running",
                    "phase": "note",
                    "step": message,
                    "message": message,
                    "updated_at": timestamp,
                    "finished": False,
                }
            )
            self._merge_context(state, context)
            self._states[task_id] = state
        self._emit(lecture_id, state, message)

    def finish(
        self,
        lecture_id: int,
        message: Optional[str] = None,
        *,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        task_id = self._task_id(lecture_id)
        timestamp = time.time()
        with self._lock:
            state = self._states.get(task_id, self._baseline(task_id, lecture_id))
            final_message = message or state.get("message", "")
            state.update(
                {
                    "active": False,
                    "status": "succeeded",
                    "phase": "finish",
                    "step": final_message,
                    "message": final_message,
                    "finished": True,
                    "updated_at": timestamp,
                    "completed_at": timestamp,
                    "error": None,
                }
            )
            self._merge_context(state, context)
            self._states[task_id] = state
        self._emit(lecture_id, state, final_message)

    def fail(
        self,
        lecture_id: int,
        message: str,
        *,
        context: Optional[Dict[str, Any]] = None,
        exception: Optional[BaseException] = None,
    ) -> None:
        task_id = self._task_id(lecture_id)
        timestamp = time.time()
        exception_info: Optional[Dict[str, Any]] = None
        if exception is not None:
            stack = "".join(
                traceback.format_exception(type(exception), exception, exception.__traceback__)
            ).strip()
            exception_info = {
                "type": exception.__class__.__name__,
                "message": str(exception),
                "stack": stack or None,
            }
        with self._lock:
            state = self._states.get(task_id, self._baseline(task_id, lecture_id))
            state.update(
                {
                    "active": False,
                    "status": "failed",
                    "phase": "failure",
                    "step": message,
                    "message": message,
                    "error": message,
                    "exception": exception_info,
                    "finished": True,
                    "updated_at": timestamp,
                    "completed_at": timestamp,
                }
            )
            self._merge_context(state, context)
            self._states[task_id] = state
        self._emit(lecture_id, state, message)

    def get(self, lecture_id: int) -> Dict[str, Any]:
        task_id = self._task_id(lecture_id)
        with self._lock:
            state = self._states.get(task_id)
            if state is None:
                return self._baseline(task_id, lecture_id)
            return dict(state)

    def all(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            return {task_id: dict(state) for task_id, state in self._states.items()}

    def clear(self, lecture_id: int) -> bool:
        task_id = self._task_id(lecture_id)
        with self._lock:
            return self._states.pop(task_id, None) is not None


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


def _normalize_local_boost_url(value: Any) -> str:
    """Return a normalized local boost base URL."""

    if isinstance(value, str):
        candidate = value.strip()
    else:
        candidate = str(value or "").strip()

    if not candidate:
        return _DEFAULT_UI_SETTINGS.local_boost_url

    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", candidate):
        candidate = f"http://{candidate}"

    return candidate.rstrip("/")


def _format_asset_counts(lectures: List[Dict[str, Any]]) -> Dict[str, int]:
    """Return aggregated asset availability counts for a collection of lectures."""

    return {
        "transcripts": sum(1 for lecture in lectures if lecture["transcript_path"]),
        "slides": sum(1 for lecture in lectures if lecture["slide_path"]),
        "audio": sum(1 for lecture in lectures if lecture["audio_path"]),
        "processed_audio": sum(1 for lecture in lectures if lecture["processed_audio_path"]),
        "notes": sum(1 for lecture in lectures if lecture["notes_path"]),
        "slide_images": sum(1 for lecture in lectures if lecture["slide_image_dir"]),
    }


def _serialize_lecture(lecture: LectureRecord) -> Dict[str, Any]:
    return {
        "id": lecture.id,
        "module_id": lecture.module_id,
        "name": lecture.name,
        "description": lecture.description,
        "position": lecture.position,
        "audio_path": lecture.audio_path,
        "processed_audio_path": lecture.processed_audio_path,
        "slide_path": lecture.slide_path,
        "transcript_path": lecture.transcript_path,
        "notes_path": lecture.notes_path,
        "slide_image_dir": lecture.slide_image_dir,
        "raw_audio_files": [],
        "raw_slide_files": [],
        "raw_slide_file_count": 0,
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
        "position": module.position,
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
        "position": class_record.position,
        "modules": modules,
        "module_count": len(modules),
        "asset_counts": asset_counts,
    }


def _annotate_slide_manifest_counts(
    classes: List[Dict[str, Any]], storage_root: Path
) -> None:
    """Populate slide manifest counts for serialized class payloads."""

    if not classes:
        return

    for class_entry in classes:
        class_name = class_entry.get("name") or ""
        modules = class_entry.get("modules") or []
        if not isinstance(modules, list):
            continue
        for module_entry in modules:
            module_name = module_entry.get("name") or ""
            lectures = module_entry.get("lectures") or []
            if not isinstance(lectures, list):
                continue
            for lecture_entry in lectures:
                lecture_name = lecture_entry.get("name") or ""
                try:
                    lecture_paths = LecturePaths.build(
                        storage_root, class_name, module_name, lecture_name
                    )
                except Exception:
                    lecture_entry["raw_slide_file_count"] = lecture_entry.get(
                        "raw_slide_file_count", 0
                    )
                    continue
                manifest_path = lecture_paths.raw_dir / _SLIDE_MANIFEST_FILENAME
                if not manifest_path.exists():
                    lecture_entry["raw_slide_file_count"] = lecture_entry.get(
                        "raw_slide_file_count", 0
                    )
                    continue
                try:
                    raw = manifest_path.read_text(encoding="utf-8")
                    data = json.loads(raw)
                except (OSError, json.JSONDecodeError):
                    lecture_entry["raw_slide_file_count"] = lecture_entry.get(
                        "raw_slide_file_count", 0
                    )
                    continue
                if isinstance(data, list):
                    count = sum(
                        1 for entry in data if isinstance(entry, dict) and entry.get("path")
                    )
                else:
                    count = 0
                lecture_entry["raw_slide_file_count"] = count


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


def _resolve_storage_path(_storage_root: Path, relative_path: str) -> Path:
    root_path = _storage_root.resolve()
    candidate = Path(relative_path)
    if not candidate.is_absolute():
        candidate = (root_path / candidate).resolve()
    else:
        candidate = candidate.resolve()
    candidate.relative_to(root_path)
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


class UpdateManager:
    """Track and execute application update commands."""

    def __init__(self, project_root: Path, settings_store: SettingsStore) -> None:
        self._project_root = project_root
        self._settings_store = settings_store
        self._lock = threading.Lock()
        self._running = False
        self._started_at: datetime | None = None
        self._finished_at: datetime | None = None
        self._success: Optional[bool] = None
        self._exit_code: Optional[int] = None
        self._error: Optional[str] = None
        self._log: Deque[Dict[str, str]] = deque(maxlen=_UPDATE_LOG_LIMIT)
        self._thread: threading.Thread | None = None

    def _append_log(self, message: str) -> None:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": message.rstrip("\n"),
        }
        with self._lock:
            self._log.append(entry)

    def _build_commands(self, *, allow_sudo_prompt: bool) -> List[List[str]]:
        env_command = os.environ.get("LECTURE_TOOLS_UPDATE_COMMAND", "").strip()
        if env_command:
            try:
                parsed = shlex.split(env_command)
            except ValueError:
                parsed = []
            if parsed:
                return [parsed]

        helper_cli = shutil.which("lecturetool")
        if helper_cli:
            sudo_cli = shutil.which("sudo")
            systemd_run = shutil.which("systemd-run")
            sudo_arg = "-S" if allow_sudo_prompt else "-n"
            if sudo_cli and systemd_run:
                return [
                    [
                        sudo_cli,
                        sudo_arg,
                        systemd_run,
                        "--unit=lecturetools-update",
                        "--collect",
                        "--wait",
                        "--pipe",
                        helper_cli,
                        "update",
                    ]
                ]
            if sudo_cli:
                return [[sudo_cli, sudo_arg, helper_cli, "update"]]
            return [[helper_cli, "update"]]

        helper_script = self._project_root / "scripts" / "install_server.sh"
        if helper_script.exists():
            return [["/usr/bin/env", "bash", str(helper_script), "update"]]

        commands: List[List[str]] = [["/usr/bin/env", "git", "-C", str(self._project_root), "pull", "--ff-only"]]
        requirements_dev = self._project_root / "requirements-dev.txt"
        requirements = self._project_root / "requirements.txt"
        if requirements_dev.exists():
            commands.append([sys.executable, "-m", "pip", "install", "-r", str(requirements_dev)])
        elif requirements.exists():
            commands.append([sys.executable, "-m", "pip", "install", "-r", str(requirements)])
        return commands

    @staticmethod
    def _is_sudo_command(command: List[str]) -> bool:
        if not command:
            return False
        return Path(command[0]).name == "sudo"

    @staticmethod
    def _fallback_for_systemd_run(
        command: List[str],
        *,
        allow_sudo_prompt: bool,
    ) -> Optional[List[str]]:
        if "systemd-run" not in command:
            return None
        if len(command) < 2:
            return None
        helper_cli = command[-2]
        helper_action = command[-1]
        if helper_action != "update":
            return None
        if UpdateManager._is_sudo_command(command):
            sudo_arg = "-S" if allow_sudo_prompt else "-n"
            return ["sudo", sudo_arg, helper_cli, helper_action]
        return [helper_cli, helper_action]

    def _finalize(
        self,
        *,
        success: bool,
        exit_code: Optional[int],
        error_message: Optional[str],
    ) -> None:
        with self._lock:
            self._running = False
            self._finished_at = datetime.now(timezone.utc)
            self._success = success
            self._exit_code = exit_code if exit_code is not None else None
            self._error = error_message
            self._thread = None

    def _execute(self, commands: List[List[str]], *, sudo_password: Optional[str]) -> None:
        env = os.environ.copy()
        env.setdefault("PYTHONUNBUFFERED", "1")
        env.setdefault("PIP_DISABLE_PIP_VERSION_CHECK", "1")

        if not commands:
            message = (
                "No update commands are configured. Set LECTURE_TOOLS_UPDATE_COMMAND or "
                "install the lecturetool helper CLI."
            )
            self._append_log(message)
            self._finalize(success=False, exit_code=None, error_message=message)
            return

        self._append_log(f"Starting update (steps: {len(commands)})")
        success = True
        exit_code: Optional[int] = 0
        error_message: Optional[str] = None

        for command in commands:
            current_command = command
            while True:
                if sudo_password and self._is_sudo_command(current_command) and "-n" in current_command:
                    current_command = [
                        "-S" if part == "-n" else part for part in current_command
                    ]
                display = " ".join(shlex.quote(part) for part in current_command)
                self._append_log(f"$ {display}")
                try:
                    needs_sudo_input = bool(sudo_password) and self._is_sudo_command(current_command)
                    process = subprocess.Popen(
                        current_command,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        cwd=str(self._project_root),
                        env=env,
                        stdin=subprocess.PIPE if needs_sudo_input else subprocess.DEVNULL,
                    )
                except OSError as error:
                    error_message = str(error)
                    self._append_log(f"Failed to start command: {error_message}")
                    success = False
                    exit_code = None
                    break
                if needs_sudo_input and process.stdin is not None:
                    try:
                        process.stdin.write(f"{sudo_password}\n")
                        process.stdin.flush()
                    finally:
                        process.stdin.close()

                assert process.stdout is not None
                for raw_line in process.stdout:
                    self._append_log(raw_line.rstrip("\n"))
                return_code = process.wait()
                if return_code != 0:
                    fallback = self._fallback_for_systemd_run(
                        current_command,
                        allow_sudo_prompt=bool(sudo_password),
                    )
                    if fallback:
                        self._append_log("systemd-run failed; retrying without systemd-run.")
                        current_command = fallback
                        continue
                    exit_code = return_code
                    error_message = f"Command exited with status {return_code}"
                    self._append_log(error_message)
                    success = False
                break
            if not success:
                break

        if success:
            self._append_log("Update completed successfully.")
        else:
            self._append_log("Update stopped due to errors.")

        self._finalize(success=success, exit_code=exit_code, error_message=error_message)

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "running": self._running,
                "started_at": self._started_at.isoformat() if self._started_at else None,
                "finished_at": self._finished_at.isoformat() if self._finished_at else None,
                "success": self._success,
                "exit_code": self._exit_code,
                "error": self._error,
                "log": list(self._log),
            }

    def start(self) -> Dict[str, Any]:
        with self._lock:
            if self._running:
                raise RuntimeError("Update already in progress")
            settings = self._settings_store.load()
            sudo_password = getattr(settings, "update_sudo_password", None)
            commands = self._build_commands(allow_sudo_prompt=bool(sudo_password))
            self._running = True
            self._started_at = datetime.now(timezone.utc)
            self._finished_at = None
            self._success = None
            self._exit_code = None
            self._error = None
            self._log.clear()
            thread = threading.Thread(
                target=self._execute,
                args=(commands,),
                kwargs={"sudo_password": sudo_password},
                daemon=True,
            )
            self._thread = thread
        self._append_log("Update requested")
        thread.start()
        return self.get_status()


class LectureCreatePayload(BaseModel):
    module_id: int
    name: str = Field(..., min_length=1)
    description: str = ""


class LectureUpdatePayload(BaseModel):
    module_id: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None


class LectureReorderEntry(BaseModel):
    module_id: int
    lecture_ids: List[int] = Field(default_factory=list)


class LectureReorderPayload(BaseModel):
    modules: List[LectureReorderEntry] = Field(default_factory=list)


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


class StorageBatchDownloadRequest(BaseModel):
    paths: List[str] = Field(default_factory=list)


class BulkDownloadItem(BaseModel):
    lecture_id: int
    assets: List[str] = Field(default_factory=list)


class BulkDownloadRequest(BaseModel):
    items: List[BulkDownloadItem] = Field(default_factory=list)


class LectureStorageSummary(BaseModel):
    id: int
    name: str
    size: int
    has_audio: bool
    has_processed_audio: bool
    has_transcript: bool
    has_notes: bool
    has_slides: bool
    eligible_audio: bool
    storage_path: Optional[str] = None


class ModuleStorageSummary(BaseModel):
    id: int
    name: str
    size: int
    lecture_count: int
    audio_count: int
    processed_audio_count: int
    transcript_count: int
    notes_count: int
    slide_count: int
    eligible_audio_count: int
    lectures: List[LectureStorageSummary]
    storage_path: Optional[str] = None


class ClassStorageSummary(BaseModel):
    id: int
    name: str
    size: int
    module_count: int
    lecture_count: int
    audio_count: int
    processed_audio_count: int
    transcript_count: int
    notes_count: int
    slide_count: int
    eligible_audio_count: int
    modules: List[ModuleStorageSummary]
    storage_path: Optional[str] = None


class StorageOverviewResponse(BaseModel):
    classes: List[ClassStorageSummary]
    eligible_audio_total: int


class ClassCreatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""


class ClassUpdatePayload(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ClassReorderPayload(BaseModel):
    class_ids: List[int] = Field(default_factory=list)


class ModuleCreatePayload(BaseModel):
    class_id: int
    name: str = Field(..., min_length=1)
    description: str = ""


class ModuleUpdatePayload(BaseModel):
    class_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None


class ModuleReorderEntry(BaseModel):
    class_id: int
    module_ids: List[int] = Field(default_factory=list)


class ModuleReorderPayload(BaseModel):
    classes: List[ModuleReorderEntry] = Field(default_factory=list)


class SettingsPayload(BaseModel):
    display_mode: Literal[*_DISPLAY_MODE_OPTIONS] = DEFAULT_DISPLAY_MODE
    theme: Literal[*_THEME_INPUT_OPTIONS] = DEFAULT_THEME
    visual_effects: Literal[*_VISUAL_EFFECT_OPTIONS] = DEFAULT_VISUAL_EFFECTS
    whisper_model: Literal[*_WHISPER_MODEL_OPTIONS] = "base"
    whisper_compute_type: str = Field("int8", min_length=1)
    whisper_beam_size: int = Field(5, ge=1, le=10)
    slide_dpi: Literal[*_SLIDE_DPI_OPTIONS] = 200
    slide_force_ocr: bool = False
    language: Literal[*_LANGUAGE_OPTIONS] = _DEFAULT_UI_SETTINGS.language
    audio_mastering_enabled: bool = True
    debug_enabled: bool = False
    update_sudo_password: Optional[str] = None
    local_boost_enabled: bool = False
    local_boost_url: str = _DEFAULT_UI_SETTINGS.local_boost_url


class TaskDefinition(BaseModel):
    lecture_id: int = Field(..., ge=1)
    operation: TaskOperation
    options: Optional[Dict[str, Any]] = None


class TaskBatchRequest(BaseModel):
    tasks: List[TaskDefinition] = Field(default_factory=list)


class TaskCancelRequest(BaseModel):
    reason: Optional[str] = None


class ForwardedRootPathMiddleware:
    """Apply proxy-provided root path information to incoming requests."""

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") not in {"http", "websocket"}:
            await self._app(scope, receive, send)
            return

        prefix = _extract_forwarded_prefix(scope)
        if prefix is None:
            await self._app(scope, receive, send)
            return

        adjusted_scope = dict(scope)
        adjusted_scope["root_path"] = prefix
        adjusted_scope["path"] = _trim_path(scope.get("path", "/"), prefix)

        raw_path = scope.get("raw_path")
        if isinstance(raw_path, (bytes, bytearray)):
            decoded = raw_path.decode("latin-1")
            trimmed = _trim_path(decoded, prefix)
            adjusted_scope["raw_path"] = trimmed.encode("latin-1")

        await self._app(adjusted_scope, receive, send)


def _normalize_root_path(value: Optional[str]) -> str:
    if value is None:
        return ""
    normalized = value.strip()
    if not normalized:
        return ""
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    normalized = normalized.rstrip("/")
    if normalized == "":
        return ""
    return normalized


def _extract_forwarded_prefix(scope: Scope) -> Optional[str]:
    headers = _headers_to_dict(scope)

    prefix_value = headers.get("x-forwarded-prefix")
    prefix = _normalize_forwarded_prefix(prefix_value)
    if prefix is not None:
        return prefix

    path_value = headers.get("x-forwarded-path")
    forwarded_path = _normalize_forwarded_path(path_value)
    if forwarded_path is not None:
        current_path = scope.get("path") or "/"
        if not current_path.startswith("/"):
            current_path = f"/{current_path}"

        if forwarded_path.endswith(current_path):
            prefix_candidate = forwarded_path[: len(forwarded_path) - len(current_path)]
            normalized = _normalize_forwarded_prefix(prefix_candidate)
            if normalized is not None:
                return normalized

    inferred = _infer_prefix_from_path(scope.get("path"))
    if inferred:
        return inferred

    return None


def _infer_prefix_from_path(value: Any) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, (bytes, bytearray)):
        path = value.decode("latin-1", errors="ignore")
    else:
        path = str(value)

    if not path:
        return None
    if not path.startswith("/"):
        path = f"/{path}"

    markers: Tuple[str, ...] = (
        "/api/",
        "/storage/",
        "/static/",
        "/docs",
        "/openapi.json",
    )
    reserved_prefixes: Tuple[str, ...] = ("/api", "/storage", "/static")
    for marker in markers:
        index = path.find(marker)
        if index <= 0:
            continue
        prefix = path[:index]
        prefix = prefix.rstrip("/")
        if prefix and prefix not in reserved_prefixes:
            return prefix

    return None


def _headers_to_dict(scope: Scope) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    for key, value in scope.get("headers", []):
        try:
            lower_key = key.decode("latin-1").lower()
            if lower_key in headers:
                continue
            headers[lower_key] = value.decode("latin-1")
        except Exception:  # pragma: no cover - defensive decoding
            continue
    return headers


def _normalize_forwarded_prefix(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    candidate = value.split(",", 1)[0].strip()
    if not candidate:
        return None
    if not candidate.startswith("/"):
        candidate = f"/{candidate}"
    candidate = candidate.rstrip("/")
    if candidate == "":
        return None
    return candidate


def _normalize_forwarded_path(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    candidate = value.split(",", 1)[0].strip()
    if not candidate:
        return None
    if not candidate.startswith("/"):
        candidate = f"/{candidate}"
    return candidate


def _trim_path(path: Any, prefix: str) -> str:
    if isinstance(path, (bytes, bytearray)):
        working = path.decode("latin-1")
    else:
        working = str(path)
    if not working:
        working = "/"
    if not working.startswith("/"):
        working = f"/{working}"

    if prefix and working.startswith(prefix):
        trimmed = working[len(prefix) :]
        if not trimmed:
            trimmed = "/"
    else:
        trimmed = working

    if not trimmed.startswith("/"):
        trimmed = f"/{trimmed}"
    return trimmed


def create_app(
    repository: LectureRepository,
    *,
    config: AppConfig,
    root_path: str | None = None,
) -> FastAPI:
    """Return a configured FastAPI application."""

    normalized_root = _normalize_root_path(root_path)
    app = FastAPI(
        title="Lecture Tools",
        description="Browse lectures from any device",
        root_path=normalized_root,
        request_class=LargeUploadRequest,
    )
    app.state.server = None
    def _repository_event_emitter(event_type: str, message: str, **kwargs: Any) -> None:
        if event_type == "DB_QUERY":
            _emit_db_event(message, **kwargs)
        elif event_type == "FILE_OP":
            _emit_file_event(message, **kwargs)
        else:
            _emit_debug_event(event_type, message, **kwargs)

    configure_emitter = getattr(repository, "configure_event_emitter", None)
    if callable(configure_emitter):
        configure_emitter(_repository_event_emitter)
    root_logger = logging.getLogger()
    debug_handler = next(
        (handler for handler in root_logger.handlers if isinstance(handler, DebugLogHandler)),
        None,
    )
    if debug_handler is None:
        debug_handler = DebugLogHandler()
        root_logger.addHandler(debug_handler)
    app.state.debug_log_handler = debug_handler
    app.state.debug_enabled = False
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(ForwardedRootPathMiddleware)
    settings_store = SettingsStore(config)
    progress_tracker = TranscriptionProgressTracker(name="transcription")
    processing_tracker = TranscriptionProgressTracker(name="processing")

    project_root = Path(__file__).resolve().parents[2]
    update_manager = UpdateManager(project_root, settings_store)
    app.state.update_manager = update_manager

    background_executor = ThreadPoolExecutor(
        max_workers=1,
        thread_name_prefix="media-processing",
    )
    app.state.background_executor = background_executor
    app.state.background_jobs: Set[Future] = set()
    app.state.background_jobs_lock = threading.Lock()
    # Backwards compatibility for existing helpers/tests that still reference the
    # previous audio-specific executor state attributes.
    app.state.audio_mastering_executor = background_executor
    app.state.audio_mastering_jobs = app.state.background_jobs
    app.state.audio_mastering_jobs_lock = app.state.background_jobs_lock

    async def _run_serialized_background_task(
        operation: Callable[[], T],
        *,
        context_label: str,
        queued_callback: Optional[Callable[[], None]] = None,
        job_id: Optional[str] = None,
    ) -> T:
        """Run ``operation`` in the shared worker, queueing if necessary."""

        executor: ThreadPoolExecutor = getattr(app.state, "background_executor")
        jobs: Set[Future] = getattr(app.state, "background_jobs")
        jobs_lock: threading.Lock = getattr(app.state, "background_jobs_lock")

        current_job_id = _JOB_ID_VAR.get()
        active_job_id = job_id or current_job_id or _new_correlation_id()
        job_token: Optional[contextvars.Token[Optional[str]]] = None
        if current_job_id != active_job_id:
            job_token = _JOB_ID_VAR.set(active_job_id)

        loop = asyncio.get_running_loop()
        parent_context = contextvars.copy_context()

        def _run_with_context() -> T:
            def _invoke() -> T:
                actor_token = _ACTOR_VAR.set(_format_actor_label("job", context_label))
                try:
                    return operation()
                finally:
                    _ACTOR_VAR.reset(actor_token)

            return parent_context.run(_invoke)

        future = loop.run_in_executor(executor, _run_with_context)

        with jobs_lock:
            active_jobs = {job for job in jobs if not job.done()}
            jobs.clear()
            jobs.update(active_jobs)
            queued = bool(active_jobs)
            active_count = len(active_jobs)
            jobs.add(future)

        if queued:
            LOGGER.debug(
                "Queued %s task behind %s active job(s)",
                context_label,
                active_count,
            )
            if queued_callback is not None:
                try:
                    queued_callback()
                except Exception:  # pragma: no cover - defensive
                    LOGGER.exception("Queued callback for %s raised an error", context_label)

        try:
            result = await future
        finally:
            with jobs_lock:
                jobs.discard(future)
            if job_token is not None:
                _JOB_ID_VAR.reset(job_token)

        return result

    def _shutdown_background_executor() -> None:
        background_executor.shutdown(wait=True, cancel_futures=True)

    app.add_event_handler("shutdown", _shutdown_background_executor)
    app.state.progress_tracker = progress_tracker
    app.state.processing_tracker = processing_tracker
    gpu_support_state: Dict[str, Any] = {
        "supported": False,
        "checked": False,
        "message": "GPU acceleration not tested.",
        "output": "",
        "last_checked": None,
    }

    app.mount(
        "/static",
        StaticFiles(directory=_STATIC_ROOT, check_dir=False),
        name="assets",
    )

    index_html = _TEMPLATE_PATH.read_text(encoding="utf-8")

    _STORAGE_HEALTH_CACHE_SECONDS = 5.0
    storage_health_state: Dict[str, Any] = {
        "checked_at": 0.0,
        "available": False,
        "error": None,
    }
    storage_health_lock = threading.Lock()
    storage_unavailable_detail = (
        f"Storage directory '{config.storage_root}' is unavailable. "
        "Ensure the configured location exists and is writable."
    )
    storage_unwritable_detail = (
        f"Storage directory '{config.storage_root}' is not writable. "
        "Check permissions and free space."
    )

    def _require_storage_root(*, force: bool = False) -> Path:
        now = time.monotonic()
        root_path = config.storage_root
        if not force:
            if storage_health_state["available"] and (
                now - storage_health_state["checked_at"]
            ) < _STORAGE_HEALTH_CACHE_SECONDS:
                if root_path.exists() and root_path.is_dir():
                    return root_path
        with storage_health_lock:
            now = time.monotonic()
            if not force:
                if (
                    storage_health_state["available"]
                    and (now - storage_health_state["checked_at"]) < _STORAGE_HEALTH_CACHE_SECONDS
                    and root_path.exists()
                    and root_path.is_dir()
                ):
                    return root_path
            try:
                available = config_module._ensure_writable_directory(root_path)
            except OSError as error:  # pragma: no cover - defensive logging
                storage_health_state.update(
                    {"available": False, "checked_at": now, "error": str(error)}
                )
                LOGGER.error(
                    "Storage directory '%s' is not accessible: %s",
                    root_path,
                    error,
                )
                raise HTTPException(status_code=503, detail=storage_unavailable_detail) from error
            if not available:
                storage_health_state.update(
                    {"available": False, "checked_at": now, "error": "unwritable"}
                )
                LOGGER.error("Storage directory '%s' is not writable.", root_path)
                raise HTTPException(status_code=503, detail=storage_unwritable_detail)
            previously_unavailable = storage_health_state.get("error")
            storage_health_state.update({"available": True, "checked_at": now, "error": None})
            if previously_unavailable:
                LOGGER.info("Storage directory '%s' is available again", root_path)
            return root_path

    def _render_index_html(request: Request | None = None) -> str:
        candidates: List[str] = []
        if request is not None:
            scope_root = request.scope.get("root_path")
            if isinstance(scope_root, str):
                candidates.append(scope_root)
        if normalized_root:
            candidates.append(normalized_root)

        resolved = ""
        for candidate in candidates:
            normalized = _normalize_root_path(candidate)
            if normalized:
                resolved = normalized
                break
        static_base = f"{resolved}/static" if resolved else "/static"
        rendered = index_html.replace(
            "__LECTURE_TOOLS_PDFJS_SCRIPT__",
            f"{static_base}/pdfjs/pdf.min.js",
        ).replace(
            "__LECTURE_TOOLS_PDFJS_WORKER__",
            f"{static_base}/pdfjs/pdf.worker.min.js",
        ).replace(
            "__LECTURE_TOOLS_PDFJS_MODULE__",
            f"{static_base}/pdfjs/pdf.min.mjs",
        ).replace(
            "__LECTURE_TOOLS_PDFJS_WORKER_MODULE__",
            f"{static_base}/pdfjs/pdf.worker.min.mjs",
        )

        if not resolved:
            return rendered

        safe_value = json.dumps(resolved)[1:-1]
        return rendered.replace("__LECTURE_TOOLS_ROOT_PATH__", safe_value)

    def _summarize_lecture(lecture_id: int) -> Optional[Dict[str, Any]]:
        lecture_record = repository.get_lecture(lecture_id)
        if lecture_record is None:
            return None
        module_record = repository.get_module(lecture_record.module_id)
        class_record = (
            repository.get_class(module_record.class_id) if module_record else None
        )
        return {
            "id": lecture_record.id,
            "name": lecture_record.name,
            "module": module_record.name if module_record else None,
            "module_id": module_record.id if module_record else None,
            "class": class_record.name if class_record else None,
            "class_id": class_record.id if class_record else None,
        }

    def _progress_entry(
        kind: Literal["transcription", "processing"],
        state: Dict[str, Any],
    ) -> Dict[str, Any]:
        lecture_id = state.get("lecture_id")
        lecture = _summarize_lecture(lecture_id) if isinstance(lecture_id, int) else None
        context = state.get("context") if isinstance(state.get("context"), dict) else {}
        operation = context.get("operation") or context.get("type")
        retryable = False
        if kind == "transcription":
            if lecture:
                lecture_record = repository.get_lecture(lecture["id"])
                if lecture_record and (
                    lecture_record.audio_path or lecture_record.processed_audio_path
                ):
                    retryable = True
        elif kind == "processing":
            retryable = operation == "slide_bundle"

        descriptor = {
            "task_id": state.get("task_id"),
            "operation": state.get("operation"),
            "status": state.get("status"),
            "phase": state.get("phase"),
            "step": state.get("step"),
            "message": state.get("message"),
            "started_at": state.get("started_at"),
            "updated_at": state.get("updated_at"),
            "completed_at": state.get("completed_at"),
            "exception": state.get("exception"),
        }

        return {
            "type": kind,
            "lecture_id": lecture_id,
            "message": state.get("message", ""),
            "active": bool(state.get("active")),
            "finished": bool(state.get("finished")),
            "ratio": state.get("ratio"),
            "current": state.get("current"),
            "total": state.get("total"),
            "error": state.get("error"),
            "timestamp": state.get("updated_at") or state.get("started_at"),
            "lecture": lecture,
            "context": context,
            "retryable": retryable,
            "dismissible": True,
            "task": descriptor,
        }

    def _serialize_task_entry(task: QueuedTask) -> Dict[str, Any]:
        lecture = _summarize_lecture(task.lecture_id)
        return {
            "id": task.id,
            "lecture_id": task.lecture_id,
            "operation": task.operation,
            "status": task.status,
            "options": task.options,
            "created_at": task.created_at,
            "started_at": task.started_at,
            "completed_at": task.completed_at,
            "error": task.error,
            "lecture": lecture,
        }

    def _collect_progress_entries() -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        for state in progress_tracker.all().values():
            entries.append(_progress_entry("transcription", state))
        for state in processing_tracker.all().values():
            entries.append(_progress_entry("processing", state))
        entries.sort(key=lambda entry: entry.get("timestamp") or 0, reverse=True)
        return entries

    def _update_debug_state(enabled: bool) -> None:
        target_level = logging.DEBUG if enabled else logging.INFO
        if root_logger.level != target_level:
            root_logger.setLevel(target_level)
        previously_enabled = getattr(app.state, "debug_enabled", False)
        app.state.debug_enabled = bool(enabled)
        if previously_enabled != app.state.debug_enabled:
            state_text = "enabled" if app.state.debug_enabled else "disabled"
            logging.getLogger("lecture_tools.debug").info("Debug mode %s", state_text)

    def _load_ui_settings() -> UISettings:
        try:
            settings = settings_store.load()
        except Exception:  # pragma: no cover - defensive fallback
            settings = UISettings()
        settings.whisper_model = _normalize_whisper_model(settings.whisper_model)
        settings.slide_dpi = _normalize_slide_dpi(settings.slide_dpi)
        settings.slide_force_ocr = bool(getattr(settings, "slide_force_ocr", False))
        settings.language = _normalize_language(getattr(settings, "language", None))
        settings.debug_enabled = bool(getattr(settings, "debug_enabled", False))
        settings.local_boost_enabled = bool(getattr(settings, "local_boost_enabled", False))
        settings.local_boost_url = _normalize_local_boost_url(
            getattr(settings, "local_boost_url", None)
        )
        return settings

    def _serialize_ui_settings(settings: UISettings) -> Dict[str, Any]:
        payload = asdict(settings)
        password = payload.pop("update_sudo_password", None)
        payload["update_sudo_password_set"] = bool(password)
        return payload

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
            return converter_cls(
                dpi=settings.slide_dpi,
                force_ocr=settings.slide_force_ocr,
                retain_debug_assets=settings.debug_enabled,
            )
        except TypeError:  # pragma: no cover - allows monkeypatched callables without kwargs
            try:
                return converter_cls(dpi=settings.slide_dpi)
            except TypeError:  # pragma: no cover - defensive for callables without kwargs
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
        storage_root = _require_storage_root().resolve()
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
        root_path = _require_storage_root()
        try:
            asset_path = _resolve_storage_path(root_path, relative)
        except ValueError:
            return
        start_time = time.perf_counter()
        existed = asset_path.exists()
        is_dir = asset_path.is_dir() if existed else None
        _delete_storage_path(asset_path)
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        _emit_file_event(
            "delete_asset",
            payload={
                "path": relative,
                "existed": existed,
                "is_dir": is_dir,
            },
            duration_ms=duration_ms,
        )

    def _collect_archive_metadata() -> Dict[str, Any]:
        classes: List[Dict[str, Any]] = []
        for class_record in repository.iter_classes():
            class_payload: Dict[str, Any] = {
                "name": class_record.name,
                "description": class_record.description,
                "position": class_record.position,
                "modules": [],
            }
            for module in repository.iter_modules(class_record.id):
                module_payload: Dict[str, Any] = {
                    "name": module.name,
                    "description": module.description,
                    "position": module.position,
                    "lectures": [],
                }
                for lecture in repository.iter_lectures(module.id):
                    module_payload["lectures"].append(
                        {
                            "name": lecture.name,
                            "description": lecture.description,
                            "position": lecture.position,
                            "audio_path": lecture.audio_path,
                            "slide_path": lecture.slide_path,
                            "transcript_path": lecture.transcript_path,
                            "notes_path": lecture.notes_path,
                            "slide_image_dir": lecture.slide_image_dir,
                        }
                    )
                class_payload["modules"].append(module_payload)
            classes.append(class_payload)
        return {"classes": classes}

    def _clear_database() -> None:
        with repository._connect() as connection:
            connection.execute("DELETE FROM lectures")
            connection.execute("DELETE FROM modules")
            connection.execute("DELETE FROM classes")
            connection.commit()

    def _clear_storage() -> None:
        storage_root = _require_storage_root().resolve()
        archive_root = config.archive_root.resolve()
        for child in storage_root.iterdir():
            if child.resolve() == archive_root:
                continue
            _delete_storage_path(child)

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
        root_path = _require_storage_root()
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
        relative_path = path.relative_to(root_path).as_posix()
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
        root_path = _require_storage_root()
        try:
            candidate = _resolve_storage_path(root_path, relative)
        except ValueError:
            return None
        return candidate if candidate.exists() else None

    def _relative_existing_path(
        candidate: Optional[Path], *, root: Optional[Path] = None
    ) -> Optional[str]:
        if candidate is None:
            return None
        try:
            resolved_candidate = candidate.resolve()
        except (OSError, RuntimeError):  # pragma: no cover - resolution failures
            return None
        if not resolved_candidate.exists():
            return None
        base = root
        if base is None:
            base = _require_storage_root()
        try:
            resolved_root = base.resolve()
        except (OSError, RuntimeError):  # pragma: no cover - resolution failures
            resolved_root = base
        try:
            return resolved_candidate.relative_to(resolved_root).as_posix()
        except ValueError:
            return None

    def _load_asset_manifest(manifest_path: Path) -> List[Dict[str, Any]]:
        try:
            raw = manifest_path.read_text("utf-8")
        except FileNotFoundError:
            return []
        except OSError:
            LOGGER.warning("Unable to read asset manifest at %s", manifest_path)
            return []

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            LOGGER.warning("Asset manifest at %s is invalid and will be reset", manifest_path)
            manifest_path.unlink(missing_ok=True)
            return []

        entries: List[Dict[str, Any]] = []
        if not isinstance(data, list):
            return entries

        for entry in data:
            if not isinstance(entry, dict):
                continue
            relative = entry.get("path")
            if not isinstance(relative, str):
                continue
            relative = relative.strip()
            if not relative:
                continue
            name = entry.get("name")
            if isinstance(name, str) and name.strip():
                display_name = name.strip()
            else:
                display_name = Path(relative).name or relative
            uploaded_at = entry.get("uploaded_at")
            cleaned: Dict[str, Any] = {"path": relative, "name": display_name}
            if isinstance(uploaded_at, str) and uploaded_at:
                cleaned["uploaded_at"] = uploaded_at
            entries.append(cleaned)

        return entries

    def _write_asset_manifest(manifest_path: Path, entries: Sequence[Dict[str, Any]]) -> None:
        serializable: List[Dict[str, Any]] = []
        for entry in entries:
            relative = entry.get("path")
            if not isinstance(relative, str):
                continue
            relative = relative.strip()
            if not relative:
                continue
            name = entry.get("name")
            if isinstance(name, str) and name.strip():
                display_name = name.strip()
            else:
                display_name = Path(relative).name or relative
            payload: Dict[str, Any] = {"path": relative, "name": display_name}
            uploaded_at = entry.get("uploaded_at")
            if isinstance(uploaded_at, str) and uploaded_at:
                payload["uploaded_at"] = uploaded_at
            serializable.append(payload)

        if serializable:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps(serializable, indent=2, sort_keys=True),
                encoding="utf-8",
            )
        else:
            manifest_path.unlink(missing_ok=True)

    def _prune_manifest_entries(manifest_path: Path, storage_root: Path) -> List[Dict[str, Any]]:
        entries = _load_asset_manifest(manifest_path)
        if not entries:
            manifest_path.unlink(missing_ok=True)
            return []

        filtered: List[Dict[str, Any]] = []
        changed = False
        for entry in entries:
            relative = entry.get("path")
            if not isinstance(relative, str):
                changed = True
                continue
            try:
                candidate = _resolve_storage_path(storage_root, relative)
            except ValueError:
                changed = True
                continue
            if not candidate.exists():
                changed = True
                continue
            filtered.append(entry)

        if changed:
            _write_asset_manifest(manifest_path, filtered)
        return filtered

    def _upsert_manifest_entry(
        manifest_path: Path, *, path: str, name: Optional[str], uploaded_at: Optional[str]
    ) -> List[Dict[str, Any]]:
        entries = _load_asset_manifest(manifest_path)
        cleaned_path = path.strip()
        if not cleaned_path:
            return entries

        display_name = name.strip() if isinstance(name, str) and name.strip() else Path(cleaned_path).name
        payload: Dict[str, Any] = {"path": cleaned_path, "name": display_name}
        if isinstance(uploaded_at, str) and uploaded_at:
            payload["uploaded_at"] = uploaded_at

        replaced = False
        for index, entry in enumerate(entries):
            if entry.get("path") == cleaned_path:
                entries[index].update(payload)
                replaced = True
                break

        if not replaced:
            entries.append(payload)

        _write_asset_manifest(manifest_path, entries)
        return entries

    def _remove_manifest_paths(
        manifest_path: Path, relative_paths: AbstractSet[str]
    ) -> List[Dict[str, Any]]:
        if not manifest_path.exists():
            return []
        entries = _load_asset_manifest(manifest_path)
        filtered = [entry for entry in entries if entry.get("path") not in relative_paths]
        if filtered:
            _write_asset_manifest(manifest_path, filtered)
        else:
            manifest_path.unlink(missing_ok=True)
        return filtered

    def _describe_manifest_entries(
        entries: Sequence[Dict[str, Any]], storage_root: Path
    ) -> List[Dict[str, Any]]:
        described: List[Dict[str, Any]] = []
        for index, entry in enumerate(entries):
            relative = entry.get("path")
            if not isinstance(relative, str):
                continue
            try:
                candidate = _resolve_storage_path(storage_root, relative)
            except ValueError:
                continue
            if not candidate.exists():
                continue
            try:
                size = candidate.stat().st_size
            except OSError:
                size = None
            described.append(
                {
                    "path": relative,
                    "name": entry.get("name") or Path(relative).name or relative,
                    "uploaded_at": entry.get("uploaded_at"),
                    "size": size,
                    "index": index,
                }
            )
        return described

    def _ensure_slide_source(
        lecture_id: int,
        lecture: LectureRecord,
        lecture_paths: LecturePaths,
        storage_root: Path,
        *,
        class_name: str,
        module_name: str,
    ) -> Optional[Path]:
        existing = _resolve_existing_asset(lecture.slide_path)
        if existing is not None:
            return existing

        manifest_path = lecture_paths.raw_dir / _SLIDE_MANIFEST_FILENAME
        manifest_entries = _prune_manifest_entries(manifest_path, storage_root)
        if not manifest_entries:
            return None

        try:
            import fitz  # type: ignore
        except ImportError as error:  # pragma: no cover - dependency guard
            raise HTTPException(
                status_code=503,
                detail="Combining slide files requires PyMuPDF to be installed.",
            ) from error

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        base_stem = build_asset_stem(class_name, module_name, lecture.name, "slides")
        combined_name = build_timestamped_name(
            f"{base_stem}-combined",
            timestamp=timestamp,
            extension=".pdf",
        )
        combined_path = lecture_paths.raw_dir / combined_name
        combined_path.parent.mkdir(parents=True, exist_ok=True)

        document = fitz.open()
        try:
            for entry in manifest_entries:
                relative = entry.get("path")
                if not isinstance(relative, str):
                    continue
                try:
                    source = _resolve_storage_path(storage_root, relative)
                except ValueError:
                    continue
                if not source.exists():
                    continue
                with fitz.open(source) as part:  # type: ignore[arg-type]
                    document.insert_pdf(part)
            if document.page_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Uploaded slide files could not be combined into a PDF.",
                )
            document.save(str(combined_path))
        finally:
            document.close()

        combined_relative = combined_path.relative_to(storage_root).as_posix()
        repository.update_lecture_assets(lecture_id, slide_path=combined_relative)
        return combined_path

    def _combine_audio_sources(
        lecture_id: int,
        lecture: LectureRecord,
        lecture_paths: LecturePaths,
        storage_root: Path,
        *,
        class_name: str,
        module_name: str,
    ) -> Optional[Path]:
        manifest_path = lecture_paths.raw_dir / _AUDIO_MANIFEST_FILENAME
        manifest_entries = _prune_manifest_entries(manifest_path, storage_root)
        if not manifest_entries:
            return None

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        base_stem = build_asset_stem(class_name, module_name, lecture.name, "audio")
        combined_name = build_timestamped_name(
            f"{base_stem}-combined",
            timestamp=timestamp,
            extension=".wav",
        )
        combined_path = lecture_paths.raw_dir / combined_name
        combined_path.parent.mkdir(parents=True, exist_ok=True)

        wav_paths: List[Path] = []
        with TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            for index, entry in enumerate(manifest_entries):
                relative = entry.get("path")
                if not isinstance(relative, str):
                    continue
                try:
                    source = _resolve_storage_path(storage_root, relative)
                except ValueError:
                    continue
                if not source.exists():
                    continue
                wav_stem = f"{Path(combined_name).stem}-{index:03d}"
                wav_path, _ = ensure_wav(
                    source,
                    output_dir=temp_dir_path,
                    stem=wav_stem,
                    timestamp=timestamp,
                )
                wav_paths.append(wav_path)

            if not wav_paths:
                raise HTTPException(
                    status_code=400,
                    detail="Uploaded audio files could not be prepared for transcription.",
                )

            if len(wav_paths) == 1:
                shutil.copy2(wav_paths[0], combined_path)
            else:
                ffmpeg_path = shutil.which("ffmpeg")
                if ffmpeg_path is None:
                    raise HTTPException(
                        status_code=503,
                        detail="Combining audio files requires FFmpeg to be installed.",
                    )
                list_file = temp_dir_path / "inputs.txt"
                with list_file.open("w", encoding="utf-8") as handle:
                    for wav_path in wav_paths:
                        handle.write(f"file {shlex.quote(str(wav_path))}\n")
                command = [
                    ffmpeg_path,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(list_file),
                    "-c",
                    "copy",
                    str(combined_path),
                ]
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if completed.returncode != 0:
                    stderr = (completed.stderr or "").strip()
                    stdout = (completed.stdout or "").strip()
                    message = stderr or stdout or "FFmpeg exited with a non-zero status."
                    raise HTTPException(status_code=500, detail=message)

        combined_relative = combined_path.relative_to(storage_root).as_posix()
        repository.update_lecture_assets(
            lecture_id,
            audio_path=combined_relative,
            processed_audio_path=None,
        )
        return combined_path

    def _summarize_lecture_storage(
        lecture: LectureRecord,
        class_record: ClassRecord,
        module: ModuleRecord,
        *,
        root: Optional[Path] = None,
    ) -> LectureStorageSummary:
        total_size = 0
        counted_dirs: List[Path] = []
        storage_root = root or _require_storage_root().resolve()
        lecture_storage_path: Optional[str] = None

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
            if lecture_storage_path is None:
                lecture_storage_path = _relative_existing_path(directory, root=storage_root)

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
        _add_path(lecture.processed_audio_path)
        _add_path(lecture.slide_path)
        _add_path(lecture.transcript_path)
        _add_path(lecture.notes_path)
        _add_path(lecture.slide_image_dir)

        return LectureStorageSummary(
            id=lecture.id,
            name=lecture.name,
            size=total_size,
            has_audio=bool(lecture.audio_path),
            has_processed_audio=bool(lecture.processed_audio_path),
            has_transcript=bool(lecture.transcript_path),
            has_notes=bool(lecture.notes_path),
            has_slides=bool(lecture.slide_path or lecture.slide_image_dir),
            eligible_audio=bool(
                (lecture.audio_path or lecture.processed_audio_path)
                and lecture.transcript_path
            ),
            storage_path=lecture_storage_path,
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

    def _reuse_existing_slide_archive(candidates: List[Path]) -> Optional[str]:
        root_path = _require_storage_root()
        prioritized: List[Path] = []
        prioritized.extend([path for path in candidates if path.suffix.lower() == ".zip"])
        prioritized.extend([path for path in candidates if path.suffix.lower() != ".zip"])
        for candidate in prioritized:
            try:
                if not candidate.exists():
                    continue
                return candidate.relative_to(root_path).as_posix()
            except ValueError:
                continue
        return None

    def _get_preview_dir(lecture_paths: LecturePaths) -> Path:
        preview_dir = lecture_paths.raw_dir / _SLIDE_PREVIEW_DIR_NAME
        preview_dir.mkdir(parents=True, exist_ok=True)
        return preview_dir

    def _is_valid_preview_token(token: str) -> bool:
        return bool(_SLIDE_PREVIEW_TOKEN_PATTERN.fullmatch(token))

    def _resolve_preview_file(preview_dir: Path, token: str) -> Optional[Path]:
        if not _is_valid_preview_token(token):
            return None
        if not preview_dir.exists() or not preview_dir.is_dir():
            return None
        prefix = f"{token}-"
        for candidate in preview_dir.iterdir():
            if candidate.is_file() and candidate.name.startswith(prefix):
                return candidate
        return None

    def _delete_preview_file(preview_dir: Path, token: str) -> bool:
        target = _resolve_preview_file(preview_dir, token)
        if target is None:
            return False
        try:
            target.unlink()
        except FileNotFoundError:
            return False
        return True

    def _prune_preview_dir(preview_dir: Path) -> None:
        try:
            if preview_dir.exists() and preview_dir.is_dir():
                if any(preview_dir.iterdir()):
                    return
        except OSError:
            return
        with contextlib.suppress(OSError):
            preview_dir.rmdir()

    # Legacy PaddleOCR helpers removed in favour of bundled slide conversion.

    # Bundled slide extraction replaces legacy archive-only conversion.

    def _generate_slide_bundle(
        pdf_path: Path,
        lecture_paths: LecturePaths,
        converter: PyMuPDFSlideConverter,
        *,
        page_range: Optional[Tuple[int, int]] = None,
        progress_callback: Optional[Callable[[int, Optional[int]], None]] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        root_path = _require_storage_root()
        existing_bundle: Optional[Path] = None
        existing_markdown: Optional[Path] = None

        if lecture_paths.slide_dir.exists():
            bundles = sorted(lecture_paths.slide_dir.glob("*.zip"))
            if bundles:
                existing_bundle = bundles[0]

        if lecture_paths.notes_dir.exists():
            notes = sorted(lecture_paths.notes_dir.glob("*.md"))
            if notes:
                existing_markdown = notes[0]

        try:
            result = converter.convert(
                pdf_path,
                lecture_paths.slide_dir,
                lecture_paths.notes_dir,
                page_range=page_range,
                progress_callback=progress_callback,
            )
        except SlideConversionDependencyError as error:
            LOGGER.warning("Slide conversion unavailable: %s", error)
            bundle_relative = (
                existing_bundle.relative_to(root_path).as_posix()
                if existing_bundle
                else None
            )
            markdown_relative = (
                existing_markdown.relative_to(root_path).as_posix()
                if existing_markdown
                else None
            )
            return bundle_relative, markdown_relative
        except SlideConversionError as error:
            LOGGER.exception("Slide conversion failed: %s", error)
            raise HTTPException(status_code=500, detail=str(error)) from error
        except Exception as error:  # noqa: BLE001 - converter may raise arbitrary errors
            LOGGER.exception("Slide conversion failed unexpectedly: %s", error)
            raise HTTPException(status_code=500, detail=str(error)) from error

        for leftover in lecture_paths.notes_dir.glob("*.md"):
            if leftover.resolve() == result.markdown_path.resolve():
                continue
            try:
                leftover.unlink()
            except OSError:
                continue

        bundle_relative = result.bundle_path.relative_to(root_path).as_posix()
        markdown_relative = result.markdown_path.relative_to(root_path).as_posix()
        return bundle_relative, markdown_relative


    async def _run_audio_mastering_task(task: QueuedTask) -> None:
        lecture_id = task.lecture_id
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise RuntimeError("Lecture not found")
        audio_relative = lecture.audio_path or lecture.processed_audio_path
        if not audio_relative:
            raise RuntimeError("Upload an audio file first")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        try:
            source_audio = _resolve_storage_path(storage_root, audio_relative)
        except Exception as error:  # pragma: no cover - defensive
            raise RuntimeError("Audio file not found") from error
        if not source_audio.exists():
            raise RuntimeError("Audio file not found")

        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        context = {
            "operation": "audio_mastering",
            "task_id": task.id,
        }
        start_message = "====> Preparing audio mastering…"
        progress_label = "====> Analysing uploaded audio…"
        completion_message = "====> Audio mastering completed."
        total_steps = float(AUDIO_MASTERING_TOTAL_STEPS)

        job_id = _new_correlation_id()
        job_token = _JOB_ID_VAR.set(job_id)
        processing_tracker.start(lecture_id, start_message, context=context)
        try:
            if not ffmpeg_available():
                message = (
                    "Audio mastering requires FFmpeg to be installed on the server. "
                    "Install FFmpeg or disable audio mastering."
                )
                processing_tracker.fail(lecture_id, f"====> {message}", context=context)
                raise RuntimeError(message)

            def _perform_audio_mastering(source: Path) -> Tuple[Path, str]:
                timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                base_stem = Path(source.name).stem or build_asset_stem(
                    class_record.name,
                    module.name,
                    lecture.name,
                    "audio",
                )
                processing_tracker.update(
                    lecture_id,
                    0.0,
                    total_steps,
                    format_progress_message(start_message, 0.0, total_steps),
                    context=context,
                )
                wav_path, _ = ensure_wav(
                    source,
                    output_dir=lecture_paths.raw_dir,
                    stem=base_stem,
                    timestamp=timestamp,
                )
                if wav_path.suffix.lower() != ".wav":
                    raise AudioMasteringUnavailableError(
                        "Audio mastering requires converting the audio to WAV, "
                        "but FFmpeg is unavailable on the server."
                    )
                completed_steps = 1.0
                processing_tracker.update(
                    lecture_id,
                    completed_steps,
                    total_steps,
                    format_progress_message(progress_label, completed_steps, total_steps),
                    context=context,
                )
                samples, sample_rate = load_wav_file(wav_path)

                completed_steps += 1.0
                (
                    stage_message,
                    stage_description,
                    stage_index,
                    total_stage_count,
                ) = build_mastering_stage_progress_message(completed_steps, total_steps)
                processing_tracker.update(
                    lecture_id,
                    completed_steps,
                    total_steps,
                    stage_message,
                    context=context,
                )

                stage_base = completed_steps

                def _handle_mastering_substage(
                    step_index: int,
                    step_count: int,
                    detail: str,
                    finished: bool,
                ) -> None:
                    if step_count <= 0:
                        return
                    if finished:
                        fraction = float(step_index) / float(step_count)
                    else:
                        fraction = float(step_index - 1) / float(step_count)
                    fraction = max(0.0, min(fraction, 1.0))
                    progress_value = min(stage_base + fraction, total_steps)
                    message_detail = detail.strip() or stage_description.summary
                    if stage_index is not None and total_stage_count is not None:
                        label = f"====> Stage {stage_index}/{total_stage_count} – {message_detail}"
                    else:
                        label = f"====> {message_detail}"
                    processing_tracker.update(
                        lecture_id,
                        progress_value,
                        total_steps,
                        format_progress_message(label, progress_value, total_steps),
                        context=context,
                    )

                processed_audio = preprocess_audio(
                    samples,
                    sample_rate,
                    progress_callback=_handle_mastering_substage,
                )

                completed_steps += 1.0
                processing_tracker.update(
                    lecture_id,
                    completed_steps,
                    total_steps,
                    format_progress_message(
                        "====> Rendering mastered waveform…",
                        completed_steps,
                        total_steps,
                    ),
                    context=context,
                )

                lecture_paths.processed_audio_dir.mkdir(parents=True, exist_ok=True)
                processed_name = f"{base_stem}-master.wav"
                processed_target = lecture_paths.processed_audio_dir / processed_name
                if processed_target.exists():
                    processed_name = build_timestamped_name(
                        f"{base_stem}-master",
                        timestamp=timestamp,
                        extension=".wav",
                    )
                    processed_target = lecture_paths.processed_audio_dir / processed_name

                save_preprocessed_wav(processed_target, processed_audio, sample_rate)

                completion = format_progress_message(
                    completion_message,
                    total_steps,
                    total_steps,
                )
                processing_tracker.update(
                    lecture_id,
                    total_steps,
                    total_steps,
                    completion,
                    context=context,
                )
                return processed_target, completion

            try:
                mastered_path, completion = await _run_serialized_background_task(
                    lambda: _perform_audio_mastering(source_audio),
                    context_label="audio mastering",
                    queued_callback=lambda: processing_tracker.note(
                        lecture_id,
                        "====> Waiting for other tasks to finish…",
                        context=context,
                    ),
                    job_id=job_id,
                )
            except AudioMasteringUnavailableError as error:
                skip_message = (
                    "====> Audio mastering skipped. "
                    "Install FFmpeg to enable WAV conversion."
                )
                LOGGER.warning("%s", error)
                processing_tracker.note(lecture_id, skip_message, context=context)
                processing_tracker.finish(lecture_id, skip_message, context=context)
                _log_event(
                    "Audio mastering skipped",
                    lecture_id=lecture_id,
                    reason=str(error),
                    task_id=task.id,
                )
                return
        except HTTPException as error:
            detail = getattr(error, "detail", str(error))
            processing_tracker.fail(
                lecture_id,
                f"====> {detail}",
                context=context,
                exception=error,
            )
            raise RuntimeError(detail) from error
        except Exception as error:  # noqa: BLE001 - defensive
            processing_tracker.fail(
                lecture_id,
                f"====> {error}",
                context=context,
                exception=error,
            )
            raise
        else:
            processed_relative = mastered_path.relative_to(storage_root).as_posix()
            repository.update_lecture_assets(
                lecture_id,
                processed_audio_path=processed_relative,
            )
            processing_tracker.finish(lecture_id, completion, context=context)
            _log_event(
                "Audio mastering task completed",
                lecture_id=lecture_id,
                processed_audio_path=processed_relative,
                task_id=task.id,
            )
        finally:
            _JOB_ID_VAR.reset(job_token)


    async def _run_transcription_task(task: QueuedTask) -> None:
        lecture_id = task.lecture_id
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise RuntimeError("Lecture not found")

        options = task.options if isinstance(task.options, dict) else {}
        model_option = None
        if isinstance(options, dict):
            model_option = options.get("model")

        settings = _load_ui_settings()
        default_model = (
            getattr(settings, "whisper_model_requested", None)
            or getattr(settings, "whisper_model", "base")
        )
        model = str(model_option or default_model)
        payload = TranscriptionRequest(model=model)

        try:
            await _execute_transcription_job(
                lecture_id,
                payload,
                tracker=processing_tracker,
                context={
                    "operation": "transcription",
                    "task_id": task.id,
                    "model": model,
                },
            )
        except HTTPException as error:
            raise RuntimeError(error.detail or str(error)) from error
        except Exception as error:  # noqa: BLE001 - background task may raise arbitrary errors
            raise RuntimeError(str(error)) from error


    async def _run_slide_bundle_task(task: QueuedTask) -> None:
        lecture_id = task.lecture_id
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise RuntimeError("Lecture not found")
        if not lecture.slide_path:
            raise RuntimeError("Upload a PDF before processing slides.")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        try:
            slide_source = _resolve_storage_path(storage_root, lecture.slide_path)
        except Exception as error:  # pragma: no cover - defensive
            raise RuntimeError("Slide file not found") from error
        if not slide_source.exists():
            raise RuntimeError("Slide file not found")

        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        options = task.options or {}
        page_range: Optional[Tuple[int, int]] = None
        start_value = options.get("page_start")
        end_value = options.get("page_end")
        try:
            start_number = int(start_value) if start_value is not None else None
            end_number = int(end_value) if end_value is not None else None
        except (TypeError, ValueError):
            start_number = None
            end_number = None
        if start_number is not None or end_number is not None:
            start_page = start_number if start_number and start_number > 0 else 1
            end_page = end_number if end_number and end_number > 0 else start_page
            if end_page < start_page:
                start_page, end_page = end_page, start_page
            page_range = (start_page, end_page)

        context = {
            "operation": "slide_bundle",
            "task_id": task.id,
            "page_range": {
                "start": page_range[0],
                "end": page_range[1],
            }
            if page_range
            else None,
        }
        start_message = "====> Preparing slide bundle…"
        progress_label = "====> Extracting slide images and text…"
        completion_label = "====> Slide bundle completed."

        job_id = _new_correlation_id()
        job_token = _JOB_ID_VAR.set(job_id)
        processing_tracker.start(lecture_id, start_message, context=context)
        progress_total: Optional[float] = None

        def _handle_slide_progress(processed: int, total: Optional[int]) -> None:
            nonlocal progress_total
            if total and total > 0:
                progress_total = float(total)
                current = float(max(0, min(processed, total)))
                message = format_progress_message(progress_label, current, progress_total)
                processing_tracker.update(
                    lecture_id,
                    current,
                    progress_total,
                    message,
                    context=context,
                )
            else:
                processing_tracker.note(lecture_id, progress_label, context=context)

        generator = globals().get("_generate_slide_bundle", _generate_slide_bundle)

        try:
            slide_bundle_relative, notes_relative = await _run_serialized_background_task(
                lambda: generator(
                    slide_source,
                    lecture_paths,
                    _make_slide_converter(),
                    page_range=page_range,
                    progress_callback=_handle_slide_progress,
                ),
                context_label="slide bundle",
                queued_callback=lambda: processing_tracker.note(
                    lecture_id,
                    "====> Waiting for other tasks to finish…",
                    context=context,
                ),
                job_id=job_id,
            )
        except HTTPException as error:
            detail = getattr(error, "detail", str(error))
            processing_tracker.fail(
                lecture_id,
                f"====> {detail}",
                context=context,
                exception=error,
            )
            raise RuntimeError(detail) from error
        except SlideConversionDependencyError as error:
            processing_tracker.fail(
                lecture_id,
                f"====> {error}",
                context=context,
                exception=error,
            )
            raise RuntimeError(str(error)) from error
        except SlideConversionError as error:
            processing_tracker.fail(
                lecture_id,
                f"====> {error}",
                context=context,
                exception=error,
            )
            raise RuntimeError(str(error)) from error
        except Exception as error:  # noqa: BLE001 - defensive
            processing_tracker.fail(
                lecture_id,
                f"====> {error}",
                context=context,
                exception=error,
            )
            raise
        else:
            if progress_total and progress_total > 0:
                completion_message = format_progress_message(
                    completion_label,
                    progress_total,
                    progress_total,
                )
            else:
                completion_message = completion_label
            update_kwargs: Dict[str, Optional[str]] = {"slide_path": lecture.slide_path}
            if slide_bundle_relative is not None:
                update_kwargs["slide_image_dir"] = slide_bundle_relative
            if notes_relative is not None:
                update_kwargs["notes_path"] = notes_relative
            repository.update_lecture_assets(lecture_id, **update_kwargs)
            processing_tracker.finish(lecture_id, completion_message, context=context)
            _log_event(
                "Slide bundle task completed",
                lecture_id=lecture_id,
                slide_path=lecture.slide_path,
                slide_image_dir=slide_bundle_relative,
                notes_path=notes_relative,
                task_id=task.id,
            )
        finally:
            _JOB_ID_VAR.reset(job_token)


    async def _run_slide_merge_task(task: QueuedTask) -> None:
        lecture_id = task.lecture_id
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise RuntimeError("Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        context = {
            "operation": "slide_merge",
            "task_id": task.id,
        }
        start_message = "====> Combining uploaded slide PDFs…"
        completion_message = "====> Slide PDFs combined."

        job_id = _new_correlation_id()
        job_token = _JOB_ID_VAR.set(job_id)
        processing_tracker.start(lecture_id, start_message, context=context)
        try:
            combined_slide = _ensure_slide_source(
                lecture_id,
                lecture,
                lecture_paths,
                storage_root,
                class_name=class_record.name,
                module_name=module.name,
            )
        except HTTPException as error:
            detail = getattr(error, "detail", str(error))
            processing_tracker.fail(
                lecture_id,
                f"====> {detail}",
                context=context,
                exception=error,
            )
            raise RuntimeError(detail) from error
        except Exception as error:  # noqa: BLE001 - defensive
            processing_tracker.fail(
                lecture_id,
                f"====> {error}",
                context=context,
                exception=error,
            )
            raise
        else:
            if combined_slide is None:
                message = "Upload a PDF before merging slides."
                processing_tracker.fail(
                    lecture_id,
                    f"====> {message}",
                    context=context,
                )
                raise RuntimeError(message)
            processing_tracker.finish(lecture_id, completion_message, context=context)
            relative_path = combined_slide.relative_to(storage_root).as_posix()
            _log_event(
                "Slide merge task completed",
                lecture_id=lecture_id,
                slide_path=relative_path,
                task_id=task.id,
            )
        finally:
            _JOB_ID_VAR.reset(job_token)


    async def _execute_task_queue_entry(task: QueuedTask) -> None:
        if task.operation == "audio_mastering":
            await _run_audio_mastering_task(task)
            return
        if task.operation == "transcription":
            await _run_transcription_task(task)
            return
        if task.operation == "slide_merge":
            await _run_slide_merge_task(task)
            return
        if task.operation == "slide_bundle":
            await _run_slide_bundle_task(task)
            return
        raise RuntimeError(f"Unsupported task operation: {task.operation}")


    task_queue = TaskQueue(_execute_task_queue_entry)
    app.state.task_queue = task_queue

    async def _start_task_queue() -> None:
        await task_queue.start()

    async def _stop_task_queue() -> None:
        await task_queue.stop()

    app.add_event_handler("startup", _start_task_queue)
    app.add_event_handler("shutdown", _stop_task_queue)


    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request) -> HTMLResponse:
        return HTMLResponse(_render_index_html(request))

    @app.get("/storage/{path:path}")
    async def serve_storage_file(path: str) -> FileResponse:
        root_path = _require_storage_root()
        try:
            target = _resolve_storage_path(root_path, path)
        except ValueError as error:
            raise HTTPException(status_code=404, detail="File not found") from error
        if not target.exists() or target.is_dir():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(target)

    @app.get("/api/classes")
    async def list_classes() -> Dict[str, Any]:
        _log_event("Listing classes")
        classes = [_serialize_class(repository, record) for record in repository.iter_classes()]
        _annotate_slide_manifest_counts(classes, config.storage_root)
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
            "processed_audio_count": sum(
                klass["asset_counts"].get("processed_audio", 0) for klass in classes
            ),
            "notes_count": sum(klass["asset_counts"]["notes"] for klass in classes),
            "slide_image_count": sum(
                klass["asset_counts"]["slide_images"] for klass in classes
            ),
        }
        _log_event(
            "Summarised classes",
            class_count=len(classes),
            module_count=total_modules,
            lecture_count=total_lectures,
        )
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

        _log_event("Creating class", name=name)
        try:
            class_id = repository.add_class(name, payload.description.strip())
        except Exception as error:  # noqa: BLE001 - propagate integrity issues
            raise HTTPException(status_code=400, detail=str(error)) from error

        record = repository.get_class(class_id)
        if record is None:
            raise HTTPException(status_code=500, detail="Class creation failed")

        _log_event("Created class", class_id=class_id)
        return {"class": _serialize_class(repository, record)}

    @app.put("/api/classes/{class_id}")
    async def update_class(class_id: int, payload: ClassUpdatePayload) -> Dict[str, Any]:
        record = repository.get_class(class_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Class not found")

        updates: Dict[str, Any] = {}
        if payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Class name is required")
            updates["name"] = name
        if payload.description is not None:
            updates["description"] = payload.description.strip()

        if updates:
            _log_event("Updating class", class_id=class_id)
            repository.update_class(class_id, **updates)

        updated = repository.get_class(class_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Class update failed")

        _log_event("Updated class", class_id=class_id)
        return {"class": _serialize_class(repository, updated)}

    @app.delete(
        "/api/classes/{class_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def delete_class(class_id: int) -> Response:
        _log_event("Deleting class", class_id=class_id)
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
        _log_event("Deleted class", class_id=class_id, module_count=len(modules))
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/classes/reorder")
    async def reorder_classes(payload: ClassReorderPayload) -> Dict[str, Any]:
        if not payload.class_ids:
            return {"classes": []}

        identifiers = payload.class_ids
        if len(identifiers) != len(set(identifiers)):
            raise HTTPException(status_code=400, detail="Duplicate class identifier provided")

        records: List[ClassRecord] = []
        for class_id in identifiers:
            record = repository.get_class(class_id)
            if record is None:
                raise HTTPException(status_code=404, detail="Class not found")
            records.append(record)

        _log_event("Reordering classes", class_count=len(identifiers))
        repository.reorder_classes(identifiers)

        updated_classes: List[Dict[str, Any]] = []
        for class_id in identifiers:
            refreshed = repository.get_class(class_id)
            if refreshed is not None:
                updated_classes.append(_serialize_class(repository, refreshed))

        return {"classes": updated_classes}

    @app.post("/api/modules", status_code=status.HTTP_201_CREATED)
    async def create_module(payload: ModuleCreatePayload) -> Dict[str, Any]:
        class_record = repository.get_class(payload.class_id)
        if class_record is None:
            raise HTTPException(status_code=404, detail="Class not found")

        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Module name is required")

        _log_event("Creating module", class_id=payload.class_id, name=name)
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

        _log_event("Created module", module_id=module_id, class_id=payload.class_id)
        return {"module": _serialize_module(repository, record)}

    @app.put("/api/modules/{module_id}")
    async def update_module(module_id: int, payload: ModuleUpdatePayload) -> Dict[str, Any]:
        record = repository.get_module(module_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Module not found")

        updates: Dict[str, Any] = {}
        if payload.class_id is not None:
            class_record = repository.get_class(payload.class_id)
            if class_record is None:
                raise HTTPException(status_code=404, detail="Class not found")
            updates["class_id"] = payload.class_id
        if payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Module name is required")
            updates["name"] = name
        if payload.description is not None:
            updates["description"] = payload.description.strip()

        if updates:
            _log_event("Updating module", module_id=module_id)
            repository.update_module(module_id, **updates)

        updated = repository.get_module(module_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Module update failed")

        _log_event("Updated module", module_id=module_id, class_id=updated.class_id)
        return {"module": _serialize_module(repository, updated)}

    @app.delete(
        "/api/modules/{module_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def delete_module(module_id: int) -> Response:
        _log_event("Deleting module", module_id=module_id)
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
        _log_event("Deleted module", module_id=module_id, class_id=record.class_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/modules/reorder")
    async def reorder_modules(payload: ModuleReorderPayload) -> Dict[str, Any]:
        if not payload.classes:
            return {"classes": []}

        class_orders: Dict[int, List[int]] = {}
        seen_modules: Set[int] = set()

        for entry in payload.classes:
            class_record = repository.get_class(entry.class_id)
            if class_record is None:
                raise HTTPException(status_code=404, detail="Class not found")

            module_ids: List[int] = []
            for module_id in entry.module_ids:
                if module_id in seen_modules:
                    raise HTTPException(status_code=400, detail="Duplicate module identifier provided")
                module = repository.get_module(module_id)
                if module is None:
                    raise HTTPException(status_code=404, detail="Module not found")
                seen_modules.add(module_id)
                module_ids.append(module_id)

            class_orders[entry.class_id] = module_ids

        _log_event(
            "Reordering modules",
            class_count=len(class_orders),
            module_count=sum(len(ids) for ids in class_orders.values()),
        )
        repository.reorder_modules(class_orders)

        updated_classes: List[Dict[str, Any]] = []
        for class_id in class_orders:
            refreshed = repository.get_class(class_id)
            if refreshed is not None:
                updated_classes.append(_serialize_class(repository, refreshed))

        return {"classes": updated_classes}

    @app.post("/api/lectures", status_code=status.HTTP_201_CREATED)
    async def create_lecture(payload: LectureCreatePayload) -> Dict[str, Any]:
        module = repository.get_module(payload.module_id)
        if module is None:
            raise HTTPException(status_code=404, detail="Module not found")

        _log_event("Creating lecture", module_id=payload.module_id)
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

        _log_event("Created lecture", lecture_id=lecture_id, module_id=payload.module_id)
        return {"lecture": _serialize_lecture(lecture)}

    @app.get("/api/lectures/{lecture_id}")
    async def get_lecture(lecture_id: int) -> Dict[str, Any]:
        _log_event("Fetching lecture", lecture_id=lecture_id)
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        module = repository.get_module(lecture.module_id)
        if module is None:
            raise HTTPException(status_code=404, detail="Module not found")

        class_record = repository.get_class(module.class_id)
        if class_record is None:
            raise HTTPException(status_code=404, detail="Class not found")

        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        raw_audio_entries = _prune_manifest_entries(
            lecture_paths.raw_dir / _AUDIO_MANIFEST_FILENAME, storage_root
        )
        raw_slide_entries = _prune_manifest_entries(
            lecture_paths.raw_dir / _SLIDE_MANIFEST_FILENAME, storage_root
        )
        lecture_payload = _serialize_lecture(lecture)
        lecture_payload["raw_audio_files"] = _describe_manifest_entries(
            raw_audio_entries, storage_root
        )
        lecture_payload["raw_slide_files"] = _describe_manifest_entries(
            raw_slide_entries, storage_root
        )
        lecture_payload["raw_slide_file_count"] = len(raw_slide_entries)

        return {
            "lecture": lecture_payload,
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
        _log_event("Updating lecture", lecture_id=lecture_id)
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
        _log_event(
            "Updated lecture",
            lecture_id=lecture_id,
            module_id=updated.module_id,
        )
        return {"lecture": _serialize_lecture(updated)}

    @app.post("/api/lectures/reorder")
    async def reorder_lecture_positions(payload: LectureReorderPayload) -> Dict[str, Any]:
        if not payload.modules:
            return {"modules": []}

        _log_event("Reordering lectures", module_count=len(payload.modules))
        module_orders: Dict[int, List[int]] = {}
        seen_lectures: Set[int] = set()

        for entry in payload.modules:
            module = repository.get_module(entry.module_id)
            if module is None:
                raise HTTPException(status_code=404, detail="Module not found")

            lecture_ids: List[int] = []
            for lecture_id in entry.lecture_ids:
                if lecture_id in seen_lectures:
                    raise HTTPException(status_code=400, detail="Duplicate lecture identifier provided")
                lecture = repository.get_lecture(lecture_id)
                if lecture is None:
                    raise HTTPException(status_code=404, detail="Lecture not found")
                seen_lectures.add(lecture_id)
                lecture_ids.append(lecture_id)

            module_orders[entry.module_id] = lecture_ids

        repository.reorder_lectures(module_orders)

        updated_modules: List[Dict[str, Any]] = []
        for module_id in module_orders:
            module = repository.get_module(module_id)
            if module is not None:
                updated_modules.append(_serialize_module(repository, module))

        _log_event("Reordered lectures", affected_modules=len(updated_modules))
        return {"modules": updated_modules}

    @app.delete(
        "/api/lectures/{lecture_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def delete_lecture(lecture_id: int) -> Response:
        _log_event("Deleting lecture", lecture_id=lecture_id)
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
        _log_event(
            "Deleted lecture",
            lecture_id=lecture_id,
            module_id=module.id,
            class_id=class_record.id,
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/lectures/{lecture_id}/assets/{asset_type}")
    async def upload_asset(
        lecture_id: int,
        asset_type: str,
        file: UploadFile = File(...),
    ) -> Dict[str, Any]:
        _log_event("Uploading asset", lecture_id=lecture_id, asset_type=asset_type)
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
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
            await _persist_upload_file(file, target)
        finally:
            await file.close()

        relative = target.relative_to(storage_root).as_posix()
        update_kwargs: Dict[str, Optional[str]] = {}
        processed_relative: Optional[str] = None
        processing_queued = False
        processing_operations: Set[str] = set()

        raw_audio_payload: List[Dict[str, Any]] = []
        raw_slide_payload: List[Dict[str, Any]] = []

        if asset_key == "audio":
            manifest_path = lecture_paths.raw_dir / _AUDIO_MANIFEST_FILENAME
            uploaded_at = datetime.now(timezone.utc).isoformat()
            _upsert_manifest_entry(
                manifest_path,
                path=relative,
                name=original_name or candidate_name,
                uploaded_at=uploaded_at,
            )
            manifest_entries = _prune_manifest_entries(manifest_path, storage_root)
            raw_audio_payload = _describe_manifest_entries(manifest_entries, storage_root)
            if lecture.audio_path and lecture.audio_path != relative:
                _delete_asset_path(lecture.audio_path)
            if lecture.processed_audio_path:
                _delete_asset_path(lecture.processed_audio_path)
            update_kwargs["audio_path"] = None
            update_kwargs["processed_audio_path"] = None
            processed_relative = None

        elif asset_key == "slides":
            manifest_path = lecture_paths.raw_dir / _SLIDE_MANIFEST_FILENAME
            uploaded_at = datetime.now(timezone.utc).isoformat()
            _upsert_manifest_entry(
                manifest_path,
                path=relative,
                name=original_name or candidate_name,
                uploaded_at=uploaded_at,
            )
            manifest_entries = _prune_manifest_entries(manifest_path, storage_root)
            raw_slide_payload = _describe_manifest_entries(manifest_entries, storage_root)
            if lecture.slide_path:
                _delete_asset_path(lecture.slide_path)
            if lecture.slide_image_dir:
                _delete_asset_path(lecture.slide_image_dir)
            update_kwargs["slide_path"] = None
            update_kwargs["slide_image_dir"] = None

        else:
            update_kwargs[attribute] = relative

        repository.update_lecture_assets(lecture_id, **update_kwargs)
        updated = repository.get_lecture(lecture_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Lecture update failed")
        lecture_payload = _serialize_lecture(updated)
        if asset_key == "audio":
            lecture_payload["raw_audio_files"] = raw_audio_payload
        if asset_key == "slides":
            lecture_payload["raw_slide_files"] = raw_slide_payload
            lecture_payload["raw_slide_file_count"] = len(raw_slide_payload)
        response: Dict[str, Any] = {"lecture": lecture_payload}
        if asset_key not in {"audio", "slides"}:
            response[attribute] = relative
        else:
            response[attribute] = update_kwargs.get(attribute)
        if asset_key == "audio":
            response["processed_audio_path"] = processed_relative
            response["raw_audio_files"] = raw_audio_payload
        if asset_key == "slides":
            response["slide_image_dir"] = update_kwargs.get("slide_image_dir")
            response["raw_slide_files"] = raw_slide_payload
            response["raw_slide_file_count"] = len(raw_slide_payload)
        response["processing"] = bool(processing_queued)
        if processing_operations:
            response["processing_operations"] = sorted(processing_operations)
        _log_event(
            "Uploaded asset",
            lecture_id=lecture_id,
            asset_type=asset_key,
            path=relative,
        )
        return response

    @app.delete("/api/lectures/{lecture_id}/assets/{asset_type}")
    async def delete_asset(lecture_id: int, asset_type: str) -> Dict[str, Any]:
        _log_event("Removing asset", lecture_id=lecture_id, asset_type=asset_type)
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )

        asset_key = asset_type.lower()
        removal_map: Dict[str, Tuple[str, ...]] = {
            "audio": ("audio_path", "processed_audio_path"),
            "processed_audio": ("processed_audio_path",),
            "slides": ("slide_path", "slide_image_dir"),
            "transcript": ("transcript_path",),
            "notes": ("notes_path",),
            "slide_images": ("slide_image_dir",),
            "slide_bundle": ("slide_image_dir",),
        }

        if asset_key not in removal_map:
            raise HTTPException(status_code=400, detail="Unsupported asset type")

        attributes = removal_map[asset_key]
        paths_to_remove: Set[str] = set()
        update_kwargs: Dict[str, Optional[str]] = {}

        for attribute in attributes:
            current = getattr(lecture, attribute, None)
            if current:
                paths_to_remove.add(str(current))
            update_kwargs[attribute] = None

        if asset_key == "audio":
            manifest_path = lecture_paths.raw_dir / _AUDIO_MANIFEST_FILENAME
            manifest_entries = _prune_manifest_entries(manifest_path, storage_root)
            manifest_paths = {entry.get("path") for entry in manifest_entries if entry.get("path")}
            paths_to_remove.update(manifest_paths)
            _remove_manifest_paths(manifest_path, {path for path in manifest_paths if path})
        elif asset_key == "slides":
            manifest_path = lecture_paths.raw_dir / _SLIDE_MANIFEST_FILENAME
            manifest_entries = _prune_manifest_entries(manifest_path, storage_root)
            manifest_paths = {entry.get("path") for entry in manifest_entries if entry.get("path")}
            paths_to_remove.update(manifest_paths)
            _remove_manifest_paths(manifest_path, {path for path in manifest_paths if path})

        for relative_path in paths_to_remove:
            _delete_asset_path(relative_path)

        repository.update_lecture_assets(lecture_id, **update_kwargs)
        updated = repository.get_lecture(lecture_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="Lecture update failed")

        lecture_payload = _serialize_lecture(updated)
        if asset_key == "audio":
            lecture_payload["raw_audio_files"] = []
        if asset_key == "slides":
            lecture_payload["raw_slide_files"] = []
            lecture_payload["raw_slide_file_count"] = 0

        _log_event(
            "Removed asset",
            lecture_id=lecture_id,
            asset_type=asset_key,
            cleared=list(attributes),
        )
        return {"lecture": lecture_payload}

    @app.get("/api/settings/whisper-gpu/status")
    async def get_gpu_status() -> Dict[str, Any]:
        _log_event("Fetching GPU status")
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
        _log_event("GPU status resolved", supported=state.get("supported"), checked=state.get("checked"))
        return {"status": state}

    @app.post("/api/settings/whisper-gpu/test")
    async def test_gpu_status() -> Dict[str, Any]:
        _log_event("Testing GPU support")
        if check_gpu_whisper_availability is None:
            raise HTTPException(
                status_code=503,
                detail="GPU detection is unavailable on this server.",
            )
        probe = check_gpu_whisper_availability(config.assets_root)
        state = _record_gpu_probe(probe)
        _log_event("GPU probe completed", supported=state.get("supported"))
        return {"status": state}

    @app.get("/api/settings")
    async def get_settings() -> Dict[str, Any]:
        settings = _load_ui_settings()
        settings.display_mode = normalize_display_mode(settings.display_mode)
        settings.theme = normalize_theme(settings.theme)
        settings.visual_effects = normalize_visual_effects(settings.visual_effects)
        _log_event(
            "Loaded settings",
            display_mode=settings.display_mode,
            theme=settings.theme,
            visual_effects=settings.visual_effects,
            language=settings.language,
            whisper_model=settings.whisper_model,
            debug_enabled=settings.debug_enabled,
        )
        return {"settings": _serialize_ui_settings(settings)}

    @app.get("/api/debug/logs")
    async def get_debug_logs(after: Optional[int] = None) -> Dict[str, Any]:
        handler = getattr(app.state, "debug_log_handler", None)
        enabled = bool(getattr(app.state, "debug_enabled", False))
        if handler is None:
            return {"logs": [], "next": after or 0, "enabled": enabled}
        try:
            after_id = int(after) if after is not None else None
        except (TypeError, ValueError):
            after_id = None
        entries = handler.collect(after_id)
        if entries:
            LOGGER.debug(
                "Streaming %s debug log entr%s", len(entries), "y" if len(entries) == 1 else "ies"
            )
        next_marker = handler.last_id if entries else (after_id or handler.last_id)
        return {"logs": entries, "next": next_marker, "enabled": enabled}

    @app.get("/api/debug/logs/download")
    async def download_debug_logs() -> Response:
        handler = getattr(app.state, "debug_log_handler", None)
        if handler is None:
            raise HTTPException(status_code=404, detail="Debug logging is not available.")

        content = handler.export_text()
        now = datetime.now(timezone.utc)
        started = getattr(handler, "started_at", None)
        if isinstance(started, datetime):
            start_label = started.astimezone(timezone.utc).strftime("%Y%m%d-%H%M%S")
        else:
            start_label = "session"
        end_label = now.strftime("%Y%m%d-%H%M%S")
        filename = f"{start_label}_to_{end_label}.log" if start_label != "session" else f"{end_label}.log"
        body = content if content.strip() else "# Debug log is currently empty.\n"
        LOGGER.debug(
            "Preparing debug log download (%s bytes, filename=%s)",
            len(body.encode("utf-8")),
            filename,
        )
        return Response(
            content=body,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.put("/api/settings")
    async def update_settings(payload: SettingsPayload) -> Dict[str, Any]:
        settings = _load_ui_settings()
        _log_event("Received settings update request")
        display_mode, theme = resolve_theme_preferences(payload.theme, payload.display_mode)
        settings.display_mode = display_mode
        settings.theme = theme
        settings.visual_effects = normalize_visual_effects(payload.visual_effects)
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
        settings.slide_force_ocr = bool(payload.slide_force_ocr)
        settings.audio_mastering_enabled = bool(payload.audio_mastering_enabled)
        settings.debug_enabled = bool(payload.debug_enabled)
        settings.local_boost_enabled = bool(payload.local_boost_enabled)
        settings.local_boost_url = _normalize_local_boost_url(payload.local_boost_url)
        if payload.update_sudo_password is not None:
            if payload.update_sudo_password == "":
                settings.update_sudo_password = None
            else:
                settings.update_sudo_password = payload.update_sudo_password
        settings_store.save(settings)
        _update_debug_state(settings.debug_enabled)
        _log_event(
            "Persisted settings",
            display_mode=settings.display_mode,
            theme=settings.theme,
            visual_effects=settings.visual_effects,
            language=settings.language,
            whisper_model=settings.whisper_model,
            debug_enabled=settings.debug_enabled,
        )
        return {"settings": _serialize_ui_settings(settings)}

    @app.post("/api/settings/export")
    async def export_archive() -> Dict[str, Any]:
        _log_event("Starting archive export")
        archive_root = config.archive_root
        archive_root.mkdir(parents=True, exist_ok=True)
        metadata = _collect_archive_metadata()
        filename = build_timestamped_name("lecture-tools-export", extension="zip")
        archive_path = archive_root / filename

        storage_root = _require_storage_root().resolve()
        exclude_root = archive_root.resolve()

        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))
            if storage_root.exists():
                for path in storage_root.rglob("*"):
                    if path.is_dir():
                        continue
                    resolved = path.resolve()
                    if resolved == archive_path.resolve():
                        continue
                    if resolved == exclude_root or exclude_root in resolved.parents:
                        continue
                    arcname = Path("storage") / path.relative_to(storage_root)
                    try:
                        bundle.write(path, arcname.as_posix())
                    except OSError:
                        continue

        root_path = _require_storage_root()
        relative = archive_path.relative_to(root_path).as_posix()
        info = archive_path.stat()

        class_count = len(metadata.get("classes", []))
        module_count = sum(len(item.get("modules", [])) for item in metadata.get("classes", []))
        lecture_count = sum(
            len(module.get("lectures", []))
            for item in metadata.get("classes", [])
            for module in item.get("modules", [])
        )

        _log_event(
            "Export archive prepared",
            filename=filename,
            size=info.st_size,
            class_count=class_count,
        )

        return {
            "archive": {
                "filename": filename,
                "path": relative,
                "size": info.st_size,
                "class_count": class_count,
                "module_count": module_count,
                "lecture_count": lecture_count,
            }
        }

    @app.post("/api/settings/import")
    async def import_archive(
        mode: Literal["merge", "replace"] = Form("merge"),
        file: UploadFile = File(...),
    ) -> Dict[str, Any]:
        normalized_mode = mode.lower()
        if normalized_mode not in {"merge", "replace"}:
            raise HTTPException(status_code=400, detail="Unsupported import mode")

        _log_event("Importing archive", mode=normalized_mode)
        payload = await file.read()
        await file.close()
        if not payload:
            raise HTTPException(status_code=400, detail="Archive is empty")

        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "archive.zip"
            temp_path.write_bytes(payload)
            try:
                with zipfile.ZipFile(temp_path, "r") as bundle:
                    bundle.extractall(temp_dir)
            except zipfile.BadZipFile as error:
                raise HTTPException(status_code=400, detail="Invalid archive") from error

            metadata_path = Path(temp_dir) / "metadata.json"
            if not metadata_path.exists():
                raise HTTPException(status_code=400, detail="Archive is missing metadata.json")

            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as error:
                raise HTTPException(status_code=400, detail="Archive metadata is invalid") from error

            files_root = Path(temp_dir) / "storage"

            if normalized_mode == "replace":
                _clear_database()
                _clear_storage()

            root_path = _require_storage_root()

            if files_root.exists():
                for path in files_root.rglob("*"):
                    if path.is_dir():
                        continue
                    destination = root_path / path.relative_to(files_root)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        shutil.copy2(path, destination)
                    except OSError:
                        continue

            classes_data = metadata.get("classes", [])
            classes_data = sorted(
                classes_data,
                key=lambda item: item.get("position") if isinstance(item.get("position"), int) else 0,
            )

            imported_classes = 0
            imported_modules = 0
            imported_lectures = 0

            for class_entry in classes_data:
                name = str(class_entry.get("name") or "").strip()
                if not name:
                    continue
                description = class_entry.get("description") or ""

                modules_data = class_entry.get("modules", [])
                modules_data = sorted(
                    modules_data,
                    key=lambda item: item.get("position") if isinstance(item.get("position"), int) else 0,
                )

                if normalized_mode == "merge":
                    existing_class = repository.find_class_by_name(name)
                    if existing_class is not None:
                        class_id = existing_class.id
                    else:
                        class_id = repository.add_class(name, description)
                        imported_classes += 1
                else:
                    try:
                        class_id = repository.add_class(name, description)
                    except sqlite3.IntegrityError:
                        existing_class = repository.find_class_by_name(name)
                        if existing_class is None:
                            raise
                        class_id = existing_class.id
                    imported_classes += 1

                for module_entry in modules_data:
                    module_name = str(module_entry.get("name") or "").strip()
                    if not module_name:
                        continue
                    module_description = module_entry.get("description") or ""

                    lectures_data = module_entry.get("lectures", [])
                    lectures_data = sorted(
                        lectures_data,
                        key=lambda item: item.get("position") if isinstance(item.get("position"), int) else 0,
                    )

                    if normalized_mode == "merge":
                        existing_module = repository.find_module_by_name(class_id, module_name)
                        if existing_module is not None:
                            module_id = existing_module.id
                        else:
                            module_id = repository.add_module(class_id, module_name, module_description)
                            imported_modules += 1
                    else:
                        try:
                            module_id = repository.add_module(
                                class_id, module_name, module_description
                            )
                        except sqlite3.IntegrityError:
                            existing_module = repository.find_module_by_name(class_id, module_name)
                            if existing_module is None:
                                raise
                            module_id = existing_module.id
                        imported_modules += 1

                    for lecture_entry in lectures_data:
                        lecture_name = str(lecture_entry.get("name") or "").strip()
                        if not lecture_name:
                            continue
                        lecture_description = lecture_entry.get("description") or ""

                        assets = {
                            "audio_path": lecture_entry.get("audio_path"),
                            "slide_path": lecture_entry.get("slide_path"),
                            "transcript_path": lecture_entry.get("transcript_path"),
                            "notes_path": lecture_entry.get("notes_path"),
                            "slide_image_dir": lecture_entry.get("slide_image_dir"),
                        }

                        if normalized_mode == "merge":
                            existing_lecture = repository.find_lecture_by_name(module_id, lecture_name)
                            if existing_lecture is not None:
                                repository.update_lecture(
                                    existing_lecture.id,
                                    description=lecture_description if lecture_description else None,
                                )
                                asset_updates = {
                                    key: value
                                    for key, value in assets.items()
                                    if value
                                }
                                if asset_updates:
                                    repository.update_lecture_assets(existing_lecture.id, **asset_updates)
                                continue

                        try:
                            lecture_id = repository.add_lecture(
                                module_id,
                                lecture_name,
                                lecture_description,
                                audio_path=assets["audio_path"],
                                slide_path=assets["slide_path"],
                                transcript_path=assets["transcript_path"],
                                notes_path=assets["notes_path"],
                                slide_image_dir=assets["slide_image_dir"],
                            )
                        except sqlite3.IntegrityError:
                            existing = repository.find_lecture_by_name(module_id, lecture_name)
                            if existing is None:
                                raise
                            repository.update_lecture(
                                existing.id,
                                description=lecture_description if lecture_description else None,
                            )
                            asset_updates = {key: value for key, value in assets.items() if value}
                            if asset_updates:
                                repository.update_lecture_assets(existing.id, **asset_updates)
                            lecture_id = existing.id
                        imported_lectures += 1

        _log_event(
            "Imported archive",
            mode=normalized_mode,
            classes=imported_classes,
            modules=imported_modules,
            lectures=imported_lectures,
        )
        return {
            "import": {
                "mode": normalized_mode,
                "classes": imported_classes,
                "modules": imported_modules,
                "lectures": imported_lectures,
            }
        }

    @app.get("/api/lectures/{lecture_id}/preview")
    async def get_lecture_preview(lecture_id: int) -> Dict[str, Any]:
        _log_event("Generating lecture preview", lecture_id=lecture_id)
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        transcript_preview = _safe_preview_for_path(
            config.storage_root, lecture.transcript_path
        )
        notes_preview = _safe_preview_for_path(config.storage_root, lecture.notes_path)
        _log_event(
            "Preview prepared",
            lecture_id=lecture_id,
            has_transcript=bool(transcript_preview),
            has_notes=bool(notes_preview),
        )
        return {
            "transcript": transcript_preview,
            "notes": notes_preview,
        }

    @app.get("/api/lectures/{lecture_id}/transcription-progress")
    async def get_transcription_progress(lecture_id: int) -> Dict[str, Any]:
        _log_event("Polling transcription progress", lecture_id=lecture_id)
        progress = progress_tracker.get(lecture_id)
        return {"progress": progress}

    @app.get("/api/lectures/{lecture_id}/processing-progress")
    async def get_processing_progress(lecture_id: int) -> Dict[str, Any]:
        _log_event("Polling processing progress", lecture_id=lecture_id)
        progress = processing_tracker.get(lecture_id)
        return {"progress": progress}

    @app.get("/api/local-boost/ping")
    async def local_boost_ping() -> Dict[str, Any]:
        return {
            "ok": True,
            "name": "Lecture Tools Local Boost",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @app.get("/api/tasks")
    async def list_tasks() -> Dict[str, Any]:
        queue_entries = await task_queue.list()
        queue_payload = [_serialize_task_entry(entry) for entry in queue_entries]
        active_entries = _collect_progress_entries()
        return {"queue": queue_payload, "active": active_entries}

    @app.post("/api/tasks/cancel")
    async def cancel_tasks(payload: TaskCancelRequest) -> Dict[str, Any]:
        reason = (payload.reason or "").strip() or "Cancelled by client"
        cancelled = await task_queue.cancel_all(reason)
        _log_event("Cancelled queued tasks", count=cancelled, reason=reason)
        return {"cancelled": cancelled}

    @app.delete("/api/tasks/completed")
    async def clear_completed_tasks() -> Dict[str, Any]:
        cleared = await task_queue.clear_completed()
        _log_event("Cleared completed tasks", count=cleared)
        return {"cleared": cleared}

    @app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
    async def create_tasks(payload: TaskBatchRequest) -> Dict[str, Any]:
        definitions = payload.tasks or []
        if not definitions:
            raise HTTPException(status_code=400, detail="No tasks provided")

        enqueued: List[QueuedTask] = []
        for definition in definitions:
            lecture_id = definition.lecture_id
            lecture = repository.get_lecture(lecture_id)
            if lecture is None:
                raise HTTPException(status_code=404, detail="Lecture not found")
            operation = definition.operation
            options = dict(definition.options or {})
            if operation == "audio_mastering":
                if not (lecture.audio_path or lecture.processed_audio_path):
                    class_record, module = _require_hierarchy(lecture)
                    storage_root = _require_storage_root()
                    lecture_paths = LecturePaths.build(
                        storage_root,
                        class_record.name,
                        module.name,
                        lecture.name,
                    )
                    manifest_entries = _prune_manifest_entries(
                        lecture_paths.raw_dir / _AUDIO_MANIFEST_FILENAME,
                        storage_root,
                    )
                    if not manifest_entries:
                        raise HTTPException(status_code=400, detail="Upload an audio file first")
            elif operation == "transcription":
                if not (lecture.audio_path or lecture.processed_audio_path):
                    class_record, module = _require_hierarchy(lecture)
                    storage_root = _require_storage_root()
                    lecture_paths = LecturePaths.build(
                        storage_root,
                        class_record.name,
                        module.name,
                        lecture.name,
                    )
                    manifest_entries = _prune_manifest_entries(
                        lecture_paths.raw_dir / _AUDIO_MANIFEST_FILENAME,
                        storage_root,
                    )
                    if not manifest_entries:
                        raise HTTPException(status_code=400, detail="Upload an audio file first")
                if FasterWhisperTranscription is None:
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            "Transcription backend is unavailable. Install faster-whisper."
                        ),
                    )
                if "model" not in options:
                    settings = _load_ui_settings()
                    default_model = (
                        getattr(settings, "whisper_model_requested", None)
                        or getattr(settings, "whisper_model", "base")
                    )
                    options["model"] = default_model
            elif operation == "slide_merge":
                class_record, module = _require_hierarchy(lecture)
                storage_root = _require_storage_root()
                lecture_paths = LecturePaths.build(
                    storage_root,
                    class_record.name,
                    module.name,
                    lecture.name,
                )
                manifest_entries = _prune_manifest_entries(
                    lecture_paths.raw_dir / _SLIDE_MANIFEST_FILENAME,
                    storage_root,
                )
                if not manifest_entries and not lecture.slide_path:
                    raise HTTPException(
                        status_code=400,
                        detail="Upload a PDF before merging slides.",
                    )
            elif operation == "slide_bundle":
                if not lecture.slide_path:
                    class_record, module = _require_hierarchy(lecture)
                    storage_root = _require_storage_root()
                    lecture_paths = LecturePaths.build(
                        storage_root,
                        class_record.name,
                        module.name,
                        lecture.name,
                    )
                    manifest_entries = _prune_manifest_entries(
                        lecture_paths.raw_dir / _SLIDE_MANIFEST_FILENAME,
                        storage_root,
                    )
                    if not manifest_entries:
                        raise HTTPException(
                            status_code=400,
                            detail="Upload a PDF before processing slides.",
                        )
            else:
                raise HTTPException(status_code=400, detail="Unsupported task operation")

            entry = await task_queue.enqueue(lecture_id, operation, options)
            enqueued.append(entry)
            _log_event(
                "Queued background task",
                lecture_id=lecture_id,
                operation=operation,
                task_id=entry.id,
            )

        return {"tasks": [_serialize_task_entry(task) for task in enqueued]}

    @app.get("/api/progress")
    async def list_progress_entries() -> Dict[str, Any]:
        entries = _collect_progress_entries()
        if entries:
            _log_event("Enumerated active tasks", count=len(entries))
        else:
            _log_event("No active background tasks")
        return {"entries": entries}

    @app.delete("/api/progress/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def clear_progress_entry(
        lecture_id: int,
        entry_type: Optional[str] = Query(None, alias="type"),
    ) -> Response:
        cleared = False
        normalized = (entry_type or "").strip().lower()
        _log_event(
            "Clearing progress entry",
            lecture_id=lecture_id,
            entry_type=normalized or "all",
        )
        if not normalized or normalized == "transcription":
            cleared = progress_tracker.clear(lecture_id) or cleared
        if not normalized or normalized == "processing":
            cleared = processing_tracker.clear(lecture_id) or cleared
        if not cleared:
            _log_event(
                "Progress entry not found",
                lecture_id=lecture_id,
                entry_type=normalized or "all",
            )
            raise HTTPException(status_code=404, detail="Progress entry not found")
        _log_event(
            "Cleared progress entry",
            lecture_id=lecture_id,
            entry_type=normalized or "all",
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    async def _execute_transcription_job(
        lecture_id: int,
        payload: TranscriptionRequest,
        *,
        tracker: TranscriptionProgressTracker,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        _log_event("Starting transcription", lecture_id=lecture_id, model=payload.model)
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")
        if FasterWhisperTranscription is None:
            raise HTTPException(
                status_code=503,
                detail="Transcription backend is unavailable. Install faster-whisper.",
            )

        class_record, module = _require_hierarchy(lecture)
        settings = _load_ui_settings()
        default_settings = UISettings()
        audio_mastering_enabled = getattr(settings, "audio_mastering_enabled", True)
        storage_root = _require_storage_root()

        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        manifest_entries = _prune_manifest_entries(
            lecture_paths.raw_dir / _AUDIO_MANIFEST_FILENAME, storage_root
        )
        has_raw_audio = bool(manifest_entries)

        if (
            not lecture.audio_path
            and not lecture.processed_audio_path
            and not has_raw_audio
        ):
            raise HTTPException(status_code=400, detail="Upload an audio file first")

        processed_relative = lecture.processed_audio_path
        audio_file: Optional[Path] = None
        audio_mastering_required = False

        if processed_relative:
            processed_candidate = _resolve_storage_path(storage_root, processed_relative)
            if processed_candidate.exists():
                audio_file = processed_candidate
            else:
                processed_relative = None
                audio_mastering_required = audio_mastering_enabled
                try:
                    repository.update_lecture_assets(
                        lecture_id,
                        processed_audio_path=None,
                    )
                except Exception:  # noqa: BLE001 - repository update may fail
                    LOGGER.exception(
                        "Failed to clear missing processed audio path for lecture %s", lecture_id
                    )
        else:
            audio_mastering_required = audio_mastering_enabled

        if audio_file is None and lecture.audio_path:
            candidate = _resolve_storage_path(storage_root, lecture.audio_path)
            if candidate.exists():
                audio_file = candidate
            else:
                audio_file = None

        if audio_file is None and has_raw_audio:
            combined = _combine_audio_sources(
                lecture_id,
                lecture,
                lecture_paths,
                storage_root,
                class_name=class_record.name,
                module_name=module.name,
            )
            if combined is None:
                raise HTTPException(status_code=400, detail="Upload an audio file first")
            lecture = repository.get_lecture(lecture_id) or lecture
            audio_file = combined
            processed_relative = None
            audio_mastering_required = audio_mastering_enabled

        if audio_file is None:
            raise HTTPException(status_code=400, detail="Upload an audio file first")

        compute_type = settings.whisper_compute_type or default_settings.whisper_compute_type
        beam_size = settings.whisper_beam_size or default_settings.whisper_beam_size

        job_id = _new_correlation_id()
        job_token = _JOB_ID_VAR.set(job_id)
        tracker_context: Dict[str, Any] = dict(context or {})
        tracker_context.setdefault("operation", "transcription")
        tracker_context.setdefault("model", payload.model)
        try:
            tracker.start(lecture_id, context=tracker_context)
    
            def _perform_audio_mastering(source: Path) -> Tuple[Path, str]:
                timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                base_stem = Path(source.name).stem or build_asset_stem(
                    class_record.name,
                    module.name,
                    lecture.name,
                    "audio",
                )
                total_steps = float(AUDIO_MASTERING_TOTAL_STEPS)
                tracker.update(
                    lecture_id,
                    0.0,
                    total_steps,
                    format_progress_message(
                        "====> Preparing audio mastering…",
                        0.0,
                        total_steps,
                    ),
                    context=tracker_context,
                )
    
                wav_path, _ = ensure_wav(
                    source,
                    output_dir=lecture_paths.raw_dir,
                    stem=base_stem,
                    timestamp=timestamp,
                )
                if wav_path.suffix.lower() != ".wav":
                    raise AudioMasteringUnavailableError(
                        "Audio mastering requires converting the audio to WAV, "
                        "but FFmpeg is unavailable on the server."
                    )
    
                completed_steps = 1.0
                tracker.update(
                    lecture_id,
                    completed_steps,
                    total_steps,
                    format_progress_message(
                        "====> Analysing uploaded audio…",
                        completed_steps,
                        total_steps,
                    ),
                    context=tracker_context,
                )
    
                samples, sample_rate = load_wav_file(wav_path)
                if LOGGER.isEnabledFor(logging.DEBUG):
                    LOGGER.debug(
                        "Audio mastering diagnostics before preprocessing for lecture %s: %s",
                        lecture_id,
                        describe_audio_debug_stats(samples, sample_rate),
                    )
    
                completed_steps += 1.0
                (
                    stage_message,
                    stage_description,
                    stage_index,
                    total_stage_count,
                ) = build_mastering_stage_progress_message(completed_steps, total_steps)
                tracker.update(
                    lecture_id,
                    completed_steps,
                    total_steps,
                    stage_message,
                    context=tracker_context,
                )
                if LOGGER.isEnabledFor(logging.INFO):
                    LOGGER.info(
                        "Mastering stage %s/%s operations: %s",
                        stage_index,
                        total_stage_count,
                        "; ".join(stage_description.detail_lines),
                    )
                    LOGGER.info(
                        "Mastering stage %s/%s parameters: %s",
                        stage_index,
                        total_stage_count,
                        ", ".join(
                            f"{name}={value}" for name, value in stage_description.parameters.items()
                        ),
                    )
    
                stage_base = completed_steps
    
                def _handle_mastering_substage(
                    step_index: int,
                    step_count: int,
                    detail: str,
                    completed: bool,
                ) -> None:
                    if step_count <= 0:
                        return
                    if completed:
                        fraction = float(step_index) / float(step_count)
                    else:
                        fraction = float(step_index - 1) / float(step_count)
                    fraction = max(0.0, min(fraction, 1.0))
                    progress_value = min(stage_base + fraction, total_steps)
                    message_detail = detail.strip() or stage_description.summary
                    if stage_index is not None and total_stage_count is not None:
                        progress_label = f"====> Stage {stage_index}/{total_stage_count} – {message_detail}"
                    else:
                        progress_label = f"====> {message_detail}"
                    progress_message = format_progress_message(
                        progress_label,
                        progress_value,
                        total_steps,
                    )
                    tracker.update(
                        lecture_id,
                        progress_value,
                        total_steps,
                        progress_message,
                        context=tracker_context,
                    )
    
                processed = preprocess_audio(
                    samples,
                    sample_rate,
                    progress_callback=_handle_mastering_substage,
                )
    
                if LOGGER.isEnabledFor(logging.DEBUG):
                    LOGGER.debug(
                        "Audio mastering diagnostics after preprocessing for lecture %s: %s",
                        lecture_id,
                        describe_audio_debug_stats(processed, sample_rate),
                    )
    
                completed_steps += 1.0
                tracker.update(
                    lecture_id,
                    completed_steps,
                    total_steps,
                    format_progress_message(
                        "====> Rendering mastered waveform…",
                        completed_steps,
                        total_steps,
                    ),
                    context=tracker_context,
                )
    
                lecture_paths.processed_audio_dir.mkdir(parents=True, exist_ok=True)
                processed_name = f"{base_stem}-master.wav"
                processed_target = lecture_paths.processed_audio_dir / processed_name
                if processed_target.exists():
                    processed_name = build_timestamped_name(
                        f"{base_stem}-master",
                        timestamp=timestamp,
                        extension=".wav",
                    )
                    processed_target = lecture_paths.processed_audio_dir / processed_name
    
                save_preprocessed_wav(processed_target, processed, sample_rate)
    
                completion_message = format_progress_message(
                    "====> Audio mastering completed.",
                    total_steps,
                    total_steps,
                )
                tracker.update(
                    lecture_id,
                    total_steps,
                    total_steps,
                    completion_message,
                    context=tracker_context,
                )
    
                return processed_target, completion_message
    
            if audio_mastering_required:
                if not ffmpeg_available():
                    message = (
                        "Audio mastering requires FFmpeg to be installed on the server. "
                        "Install FFmpeg or disable audio mastering."
                    )
                    tracker.fail(lecture_id, f"====> {message}", context=tracker_context)
                    raise HTTPException(status_code=503, detail=message)
                try:
                    mastered_path, _completion = await _run_serialized_background_task(
                        lambda: _perform_audio_mastering(audio_file),
                        context_label="audio mastering",
                        queued_callback=lambda: tracker.note(
                            lecture_id,
                            "====> Waiting for other tasks to finish…",
                            context=tracker_context,
                        ),
                        job_id=job_id,
                    )
                except AudioMasteringUnavailableError as error:
                    skip_message = (
                        "====> Audio mastering skipped. "
                        "Install FFmpeg to enable WAV conversion."
                    )
                    LOGGER.warning("%s", error)
                    tracker.note(lecture_id, skip_message, context=tracker_context)
                except ValueError as error:
                    tracker.fail(
                        lecture_id,
                        f"====> {error}",
                        context=tracker_context,
                        exception=error,
                    )
                    raise HTTPException(status_code=400, detail=str(error)) from error
                except Exception as error:  # noqa: BLE001 - mastering may raise arbitrary errors
                    LOGGER.exception(
                        "Audio mastering failed during transcription for lecture %s", lecture_id
                    )
                    tracker.fail(
                        lecture_id,
                        f"====> {error}",
                        context=tracker_context,
                        exception=error,
                    )
                    raise HTTPException(status_code=500, detail=str(error)) from error
                else:
                    processed_relative = mastered_path.relative_to(storage_root).as_posix()
                    try:
                        repository.update_lecture_assets(
                            lecture_id,
                            processed_audio_path=processed_relative,
                        )
                    except Exception:  # noqa: BLE001 - repository update may fail
                        LOGGER.exception(
                            "Failed to record processed audio path for lecture %s", lecture_id
                        )
                    else:
                        _log_event(
                            "Audio mastering completed",
                            lecture_id=lecture_id,
                            path=processed_relative,
                        )
                    audio_file = mastered_path
            def handle_progress(current: float, total: Optional[float], message: str) -> None:
                tracker.update(lecture_id, current, total, message, context=tracker_context)
    
            def _perform_transcription() -> Tuple[
                TranscriptResult,
                Optional[str],
                Optional[str],
                Optional[Dict[str, Any]],
            ]:
                fallback_model: Optional[str] = None
                fallback_reason: Optional[str] = None
                gpu_probe: Optional[Dict[str, Any]] = None
    
                def _build_engine(model_name: str) -> FasterWhisperTranscription:
                    return FasterWhisperTranscription(
                        model_name,
                        download_root=config.assets_root,
                        compute_type=compute_type,
                        beam_size=beam_size,
                    )
    
                try:
                    engine = _build_engine(payload.model)
                except GPUWhisperUnsupportedError as error:
                    fallback_model = _DEFAULT_UI_SETTINGS.whisper_model
                    fallback_reason = str(error)
                    gpu_probe = {"supported": False, "message": str(error), "output": ""}
                    tracker.note(
                        lecture_id,
                        f"====> {error} Falling back to {fallback_model} model.",
                        context=tracker_context,
                    )
                    engine = _build_engine(fallback_model)
                except GPUWhisperModelMissingError as error:
                    http_error = HTTPException(status_code=400, detail=str(error))
                    setattr(
                        http_error,
                        "gpu_probe",
                        {"supported": False, "message": str(error), "output": ""},
                    )
                    raise http_error from error
    
                result = engine.transcribe(
                    audio_file,
                    lecture_paths.transcript_dir,
                    progress_callback=handle_progress,
                )
    
                return result, fallback_model, fallback_reason, gpu_probe
    
            try:
                result, fallback_model, fallback_reason, gpu_probe = await _run_serialized_background_task(
                    _perform_transcription,
                    context_label="transcription",
                    queued_callback=lambda: tracker.note(
                        lecture_id,
                        "====> Waiting for other tasks to finish…",
                        context=tracker_context,
                    ),
                    job_id=job_id,
                )
            except HTTPException as error:
                detail = getattr(error, "detail", str(error))
                tracker.fail(
                    lecture_id,
                    f"====> {detail}",
                    context=tracker_context,
                    exception=error,
                )
                probe = getattr(error, "gpu_probe", None)
                if probe:
                    _record_gpu_probe(probe)
                raise
            except Exception as error:  # noqa: BLE001 - backend may raise arbitrary errors
                tracker.fail(
                    lecture_id,
                    f"====> {error}",
                    context=tracker_context,
                    exception=error,
                )
                raise HTTPException(status_code=500, detail=str(error)) from error
            else:
                if gpu_probe:
                    _record_gpu_probe(gpu_probe)
                elif payload.model == "gpu" and fallback_model is None:
                    _record_gpu_probe(
                        {"supported": True, "message": "GPU Whisper CLI active.", "output": ""}
                    )
                tracker.finish(
                    lecture_id,
                    "====> Transcription completed.",
                    context=tracker_context,
                )
    
            transcript_relative = result.text_path.relative_to(storage_root).as_posix()
            repository.update_lecture_assets(lecture_id, transcript_path=transcript_relative)
            updated = repository.get_lecture(lecture_id)
            if updated is None:
                raise HTTPException(status_code=500, detail="Lecture update failed")
            response = {"lecture": _serialize_lecture(updated), "transcript_path": transcript_relative}
            if result.segments_path:
                response["segments_path"] = result.segments_path.relative_to(storage_root).as_posix()
            if fallback_model:
                response["fallback_model"] = fallback_model
                if fallback_reason:
                    response["fallback_reason"] = fallback_reason
            _log_event(
                "Transcription finished",
                lecture_id=lecture_id,
                transcript_path=transcript_relative,
                fallback=fallback_model,
            )
        finally:
            _JOB_ID_VAR.reset(job_token)
        return response

    @app.post("/api/lectures/{lecture_id}/transcribe")
    async def transcribe_audio(lecture_id: int, payload: TranscriptionRequest) -> Dict[str, Any]:
        return await _execute_transcription_job(
            lecture_id,
            payload,
            tracker=progress_tracker,
        )

    @app.post(
        "/api/lectures/{lecture_id}/slides/previews",
        status_code=status.HTTP_201_CREATED,
    )
    async def create_slide_preview(
        lecture_id: int,
        file: Optional[UploadFile] = File(None),
        source: Optional[str] = Form("upload"),
    ) -> Dict[str, Any]:
        _log_event("Creating slide preview", lecture_id=lecture_id)
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()
        preview_dir = _get_preview_dir(lecture_paths)

        preview_token = uuid.uuid4().hex
        source_mode = (source or "upload").strip().lower()
        if source_mode not in {"upload", "existing"}:
            raise HTTPException(status_code=400, detail="Invalid preview source")

        existing_slide: Optional[Path] = None
        if source_mode == "existing":
            existing_slide = _resolve_existing_asset(lecture.slide_path)
            if existing_slide is None:
                existing_slide = _ensure_slide_source(
                    lecture_id,
                    lecture,
                    lecture_paths,
                    storage_root,
                    class_name=class_record.name,
                    module_name=module.name,
                )
                if existing_slide is None:
                    raise HTTPException(status_code=404, detail="No slides available for preview")
                lecture = repository.get_lecture(lecture_id) or lecture
            original_name = existing_slide.name or "slides.pdf"
        else:
            if file is None:
                raise HTTPException(status_code=400, detail="Slide file is required")
            original_name = Path(file.filename or "slides.pdf").name

        suffix = Path(original_name).suffix.lower() or ".pdf"
        if suffix != ".pdf":
            suffix = ".pdf"
        stem = slugify(Path(original_name).stem or "slides") or "slides"
        preview_name = f"{preview_token}-{stem}{suffix}"
        preview_path = preview_dir / preview_name

        if source_mode == "existing":
            with existing_slide.open("rb") as origin, preview_path.open("wb") as buffer:
                shutil.copyfileobj(origin, buffer)
        else:
            assert file is not None  # for type checkers
            try:
                with preview_path.open("wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
            finally:
                await file.close()

        page_count: Optional[int] = None
        try:
            page_count = await asyncio.wait_for(
                asyncio.to_thread(get_pdf_page_count, preview_path),
                timeout=_PDF_PAGE_COUNT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            LOGGER.warning(
                "Timed out while inspecting slide preview for lecture %s",
                lecture_id,
            )
        except SlideConversionDependencyError as error:
            LOGGER.warning(
                "Unable to inspect slide preview due to dependency issue: %s",
                error,
            )
        except SlideConversionError as error:
            LOGGER.warning("Stored slide preview could not be inspected: %s", error)
        except Exception:  # pragma: no cover - defensive fallback
            LOGGER.exception("Unexpected failure while inspecting slide preview")

        relative_preview = preview_path.relative_to(storage_root).as_posix()
        _log_event(
            "Slide preview stored",
            lecture_id=lecture_id,
            preview_id=preview_token,
            preview_path=relative_preview,
        )

        preview_url = f"/api/lectures/{lecture_id}/slides/previews/{preview_token}"
        return {
            "preview_id": preview_token,
            "preview_url": preview_url,
            "filename": original_name,
            "page_count": page_count,
        }

    @app.get("/api/lectures/{lecture_id}/slides/previews/{preview_id}")
    async def fetch_slide_preview(lecture_id: int, preview_id: str) -> FileResponse:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        preview_dir = lecture_paths.raw_dir / _SLIDE_PREVIEW_DIR_NAME
        preview_path = _resolve_preview_file(preview_dir, preview_id)
        if preview_path is None or not preview_path.exists():
            raise HTTPException(status_code=404, detail="Preview not found")

        return FileResponse(
            preview_path,
            media_type="application/pdf",
            filename=preview_path.name,
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/lectures/{lecture_id}/slides/previews/{preview_id}/metadata")
    async def fetch_slide_preview_metadata(lecture_id: int, preview_id: str) -> Dict[str, Any]:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        preview_dir = lecture_paths.raw_dir / _SLIDE_PREVIEW_DIR_NAME
        preview_path = _resolve_preview_file(preview_dir, preview_id)
        if preview_path is None or not preview_path.exists():
            raise HTTPException(status_code=404, detail="Preview not found")

        try:
            page_count = await asyncio.wait_for(
                asyncio.to_thread(get_pdf_page_count, preview_path),
                timeout=_PDF_PAGE_COUNT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as error:
            LOGGER.warning(
                "Timed out while inspecting slide preview metadata for lecture %s", lecture_id
            )
            raise HTTPException(
                status_code=503,
                detail="Slide preview inspection timed out",
            ) from error
        except SlideConversionDependencyError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except SlideConversionError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:  # pragma: no cover - defensive fallback
            LOGGER.exception("Failed to inspect slide preview")
            raise HTTPException(status_code=500, detail="Unable to inspect slide preview") from error

        return {"page_count": page_count}

    @app.get("/api/lectures/{lecture_id}/slides/previews/{preview_id}/pages/{page_number}")
    async def fetch_slide_preview_page(
        lecture_id: int,
        preview_id: str,
        page_number: int,
    ) -> Response:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        preview_dir = lecture_paths.raw_dir / _SLIDE_PREVIEW_DIR_NAME
        preview_path = _resolve_preview_file(preview_dir, preview_id)
        if preview_path is None or not preview_path.exists():
            raise HTTPException(status_code=404, detail="Preview not found")

        if page_number < 1:
            raise HTTPException(status_code=400, detail="Invalid page number")

        try:
            payload = await asyncio.to_thread(
                render_pdf_page,
                preview_path,
                page_number,
                dpi=200,
            )
        except SlideConversionDependencyError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except SlideConversionError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:  # pragma: no cover - defensive fallback
            LOGGER.exception("Failed to render slide preview page")
            raise HTTPException(status_code=500, detail="Unable to render preview page") from error

        headers = {"Cache-Control": "no-store"}
        return Response(content=payload, media_type="image/png", headers=headers)

    @app.delete(
        "/api/lectures/{lecture_id}/slides/previews/{preview_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def delete_slide_preview(lecture_id: int, preview_id: str) -> Response:
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        preview_dir = lecture_paths.raw_dir / _SLIDE_PREVIEW_DIR_NAME
        removed = _delete_preview_file(preview_dir, preview_id)
        if removed:
            _prune_preview_dir(preview_dir)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post("/api/lectures/{lecture_id}/process-slides")
    async def process_slides(
        lecture_id: int,
        file: Optional[UploadFile] = File(None),
        page_start: Optional[int] = Form(None),
        page_end: Optional[int] = Form(None),
        preview_token: Optional[str] = Form(None),
        use_existing: Optional[str] = Form(None),
    ) -> Dict[str, Any]:
        _log_event(
            "Processing slides",
            lecture_id=lecture_id,
            page_start=page_start,
            page_end=page_end,
            preview_token=preview_token,
        )
        lecture = repository.get_lecture(lecture_id)
        if lecture is None:
            raise HTTPException(status_code=404, detail="Lecture not found")

        class_record, module = _require_hierarchy(lecture)
        storage_root = _require_storage_root()
        lecture_paths = LecturePaths.build(
            storage_root,
            class_record.name,
            module.name,
            lecture.name,
        )
        lecture_paths.ensure()

        preview_dir = lecture_paths.raw_dir / _SLIDE_PREVIEW_DIR_NAME
        existing_slide = _resolve_existing_asset(lecture.slide_path)
        use_existing_flag = False
        if use_existing is not None:
            use_existing_flag = str(use_existing).strip().lower() in {"1", "true", "yes", "on"}

        slide_destination: Optional[Path] = None
        slide_relative: Optional[str] = None

        if preview_token:
            preview_path = _resolve_preview_file(preview_dir, preview_token)
            if preview_path is None or not preview_path.exists():
                raise HTTPException(status_code=404, detail="Slide preview not found")
            if file is not None:
                await file.close()
                file = None
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            slide_stem = build_asset_stem(
                class_record.name,
                module.name,
                lecture.name,
                "slides",
            )
            slide_filename = build_timestamped_name(
                slide_stem, timestamp=timestamp, extension=".pdf"
            )
            slide_destination = lecture_paths.raw_dir / slide_filename
            slide_destination.parent.mkdir(parents=True, exist_ok=True)
            try:
                preview_path.replace(slide_destination)
            except OSError as error:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to store slide preview: {error}",
                ) from error
            _prune_preview_dir(preview_dir)
            slide_relative = slide_destination.relative_to(storage_root).as_posix()
        elif file is not None:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            slide_stem = build_asset_stem(
                class_record.name,
                module.name,
                lecture.name,
                "slides",
            )
            slide_filename = build_timestamped_name(
                slide_stem, timestamp=timestamp, extension=".pdf"
            )
            slide_destination = lecture_paths.raw_dir / slide_filename
            slide_destination.parent.mkdir(parents=True, exist_ok=True)
            try:
                with slide_destination.open("wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
            finally:
                await file.close()
            slide_relative = slide_destination.relative_to(storage_root).as_posix()
        elif (use_existing_flag or not preview_token) and existing_slide is not None:
            slide_destination = existing_slide
            slide_relative = lecture.slide_path
        else:
            combined_slide = _ensure_slide_source(
                lecture_id,
                lecture,
                lecture_paths,
                storage_root,
                class_name=class_record.name,
                module_name=module.name,
            )
            if combined_slide is None:
                raise HTTPException(status_code=400, detail="Slide file is required")
            slide_destination = combined_slide
            slide_relative = combined_slide.relative_to(storage_root).as_posix()

        selected_range: Optional[Tuple[int, int]] = None
        if page_start is not None or page_end is not None:
            start = page_start if page_start and page_start > 0 else 1
            end = page_end if page_end and page_end > 0 else start
            if end < start:
                start, end = end, start
            selected_range = (start, end)

        assert slide_destination is not None and slide_relative is not None
        operation_label = "slide_bundle"
        start_message = "====> Preparing slide bundle…"
        progress_label = "====> Extracting slide images and text…"
        completion_label = "====> Slide bundle completed."
        context_label = "slide bundle"

        job_id = _new_correlation_id()
        job_token = _JOB_ID_VAR.set(job_id)
        try:
            processing_tracker.start(
                lecture_id,
                start_message,
                context={
                    "operation": operation_label,
                    "preview_token": preview_token,
                    "page_range": {
                        "start": selected_range[0],
                        "end": selected_range[1],
                    }
                    if selected_range
                    else None,
                },
            )
    
            progress_total: Optional[float] = None
    
            def _handle_slide_progress(processed: int, total: Optional[int]) -> None:
                nonlocal progress_total
                if total and total > 0:
                    progress_total = float(total)
                    current = float(max(0, min(processed, total)))
                    message = format_progress_message(
                        progress_label,
                        current,
                        progress_total,
                    )
                    processing_tracker.update(
                        lecture_id,
                        current,
                        progress_total,
                        message,
                    )
                else:
                    processing_tracker.note(lecture_id, progress_label)
    
            slide_bundle_relative: Optional[str] = None
            notes_relative: Optional[str] = None

            generator = globals().get("_generate_slide_bundle", _generate_slide_bundle)

            try:
                slide_bundle_relative, notes_relative = await _run_serialized_background_task(
                    lambda: generator(
                        slide_destination,
                        lecture_paths,
                        _make_slide_converter(),
                        page_range=selected_range,
                        progress_callback=_handle_slide_progress,
                    ),
                    context_label=context_label,
                    queued_callback=lambda: processing_tracker.note(
                        lecture_id, "====> Waiting for other tasks to finish…"
                    ),
                    job_id=job_id,
                )
            except HTTPException as error:
                detail = getattr(error, "detail", str(error))
                processing_tracker.fail(
                    lecture_id,
                    f"====> {detail}",
                    exception=error,
                )
                raise
            except SlideConversionDependencyError as error:
                LOGGER.warning("Slide conversion unavailable: %s", error)
                processing_tracker.fail(
                    lecture_id,
                    f"====> {error}",
                    exception=error,
                )
                raise HTTPException(status_code=503, detail=str(error)) from error
            except SlideConversionError as error:
                processing_tracker.fail(
                    lecture_id,
                    f"====> {error}",
                    exception=error,
                )
                raise HTTPException(status_code=500, detail=str(error)) from error
            except Exception as error:  # noqa: BLE001 - conversion may raise arbitrary errors
                processing_tracker.fail(
                    lecture_id,
                    f"====> {error}",
                    exception=error,
                )
                raise HTTPException(status_code=500, detail=str(error)) from error
            else:
                if progress_total and progress_total > 0:
                    completion_message = format_progress_message(
                        completion_label,
                        progress_total,
                        progress_total,
                    )
                else:
                    completion_message = completion_label
                processing_tracker.finish(lecture_id, completion_message)
    
            update_kwargs: Dict[str, Optional[str]] = {"slide_path": slide_relative}
            if slide_bundle_relative is not None:
                update_kwargs["slide_image_dir"] = slide_bundle_relative
            if notes_relative is not None:
                update_kwargs["notes_path"] = notes_relative
    
            repository.update_lecture_assets(
                lecture_id,
                **update_kwargs,
            )
    
            updated = repository.get_lecture(lecture_id)
            if updated is None:
                raise HTTPException(status_code=500, detail="Lecture update failed")
    
            _log_event(
                "Slides processed",
                lecture_id=lecture_id,
                slide_path=slide_relative,
                slide_image_dir=slide_bundle_relative,
                notes_path=notes_relative,
            )
        finally:
            _JOB_ID_VAR.reset(job_token)
        return {
            "lecture": _serialize_lecture(updated),
            "slide_path": slide_relative,
            "slide_image_dir": slide_bundle_relative,
            "notes_path": notes_relative,
        }

    @app.get("/api/storage/usage")
    async def get_storage_usage() -> Dict[str, Any]:
        _log_event("Computing storage usage")
        root_path = _require_storage_root()
        try:
            usage = shutil.disk_usage(root_path)
        except (FileNotFoundError, PermissionError, OSError):
            root_path = _require_storage_root(force=True)
            try:
                usage = shutil.disk_usage(root_path)
            except (FileNotFoundError, PermissionError, OSError) as error:
                LOGGER.error(
                    "Failed to read storage usage for '%s': %s",
                    root_path,
                    error,
                )
                raise HTTPException(status_code=503, detail=storage_unavailable_detail) from error

        directory_size = _calculate_directory_size(root_path)
        largest_entries: List[Dict[str, Any]] = []
        try:
            children = list(root_path.iterdir())
        except (FileNotFoundError, PermissionError, OSError):
            children = []

        for child in children:
            try:
                entry = _build_storage_entry(child)
            except (OSError, ValueError):
                continue
            try:
                largest_entries.append(entry.model_dump())
            except AttributeError:  # pragma: no cover - fallback for older pydantic
                largest_entries.append(entry.dict())

        largest_entries.sort(key=lambda item: item.get("size", 0), reverse=True)
        largest_summary = [
            {
                "name": item.get("name", ""),
                "path": item.get("path", ""),
                "is_dir": bool(item.get("is_dir")),
                "size": int(item.get("size", 0) or 0),
            }
            for item in largest_entries[:10]
        ]

        _log_event(
            "Storage usage calculated",
            total=usage.total,
            used=usage.used,
            directory_size=directory_size,
        )
        return {
            "usage": {
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
            },
            "storage": {
                "path": root_path.as_posix(),
                "size": directory_size,
                "largest": largest_summary,
            },
        }

    @app.get("/api/storage/list")
    async def list_storage(path: str = "") -> StorageListResponse:
        _log_event("Listing storage", path=path or "./")
        root_path = _require_storage_root()
        if path:
            try:
                target = _resolve_storage_path(root_path, path)
            except ValueError as error:
                raise HTTPException(status_code=400, detail="Path is outside storage root") from error
        else:
            target = root_path

        if not target.exists():
            if not path:
                root_path = _require_storage_root(force=True)
                target = root_path
            if not target.exists():
                raise HTTPException(status_code=404, detail="Path not found")

        if target.is_file():
            raise HTTPException(status_code=400, detail="Path is not a directory")

        relative_path = ""
        parent_relative: Optional[str]
        if target == root_path:
            parent_relative = None
        else:
            relative_path = target.relative_to(root_path).as_posix()
            parent_path = target.parent
            if parent_path == root_path:
                parent_relative = ""
            else:
                parent_relative = parent_path.relative_to(root_path).as_posix()

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

        response = StorageListResponse(path=relative_path, parent=parent_relative, entries=entries)
        _log_event("Storage listing prepared", path=response.path, entries=len(entries))
        return response

    @app.post("/api/storage/download")
    async def download_storage_selection(
        payload: StorageBatchDownloadRequest,
    ) -> Dict[str, Any]:
        raw_paths = payload.paths if isinstance(payload.paths, list) else []
        normalized_paths: List[str] = []
        seen: Set[str] = set()
        for item in raw_paths:
            if not isinstance(item, str):
                continue
            candidate = item.strip().strip("/")
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            normalized_paths.append(candidate)

        if not normalized_paths:
            raise HTTPException(status_code=400, detail="No storage paths selected")

        root_path = _require_storage_root().resolve()
        archive_root = config.archive_root
        archive_root.mkdir(parents=True, exist_ok=True)

        filename = build_timestamped_name("storage-selection", extension="zip")
        archive_path = archive_root / filename

        written: Set[Path] = set()
        file_count = 0

        try:
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                for relative in normalized_paths:
                    try:
                        target = _resolve_storage_path(root_path, relative)
                    except ValueError as error:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid storage path: {relative}",
                        ) from error

                    if not target.exists():
                        continue

                    if target.is_dir():
                        for child in target.rglob("*"):
                            if child.is_dir():
                                continue
                            if child.resolve() == archive_path.resolve():
                                continue
                            relative_child = child.relative_to(root_path)
                            if relative_child in written:
                                continue
                            bundle.write(
                                child,
                                (Path("storage") / relative_child).as_posix(),
                            )
                            written.add(relative_child)
                            file_count += 1
                    else:
                        if target.resolve() == archive_path.resolve():
                            continue
                        relative_file = target.relative_to(root_path)
                        if relative_file in written:
                            continue
                        bundle.write(
                            target,
                            (Path("storage") / relative_file).as_posix(),
                        )
                        written.add(relative_file)
                        file_count += 1
        except OSError as error:
            with contextlib.suppress(OSError):
                archive_path.unlink()
            raise HTTPException(status_code=500, detail="Failed to create archive") from error

        if file_count == 0:
            with contextlib.suppress(OSError):
                archive_path.unlink()
            raise HTTPException(
                status_code=400, detail="No files found for selected paths"
            )

        relative_path = archive_path.relative_to(root_path).as_posix()
        info = archive_path.stat()

        _log_event(
            "Prepared storage selection download",
            filename=filename,
            size=info.st_size,
            file_count=file_count,
            selection_count=len(normalized_paths),
        )

        return {
            "archive": {
                "filename": filename,
                "path": relative_path,
                "size": info.st_size,
                "count": file_count,
            }
        }

    @app.post("/api/download/bulk")
    async def download_bulk_assets(payload: BulkDownloadRequest) -> Dict[str, Any]:
        normalized: Dict[int, Set[str]] = {}
        raw_items = payload.items if isinstance(payload.items, list) else []
        for item in raw_items:
            lecture_id = int(getattr(item, "lecture_id", 0))
            if lecture_id <= 0:
                continue
            requested = set()
            for asset in getattr(item, "assets", []) or []:
                key = str(asset).strip().lower()
                if key in BULK_DOWNLOAD_ASSET_FIELDS:
                    requested.add(key)
            if not requested:
                continue
            normalized.setdefault(lecture_id, set()).update(requested)

        if not normalized:
            raise HTTPException(status_code=400, detail="No assets selected for download")

        def _slug_or_default(label: Optional[str], fallback: str) -> str:
            slug = slugify(label or "")
            return slug or fallback

        root_path = _require_storage_root().resolve()
        archive_root = config.archive_root
        archive_root.mkdir(parents=True, exist_ok=True)

        filename = build_timestamped_name("bulk-download", extension="zip")
        archive_path = archive_root / filename
        file_count = 0
        written: Set[str] = set()

        try:
            with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                for lecture_id, asset_keys in normalized.items():
                    lecture = repository.get_lecture(lecture_id)
                    if lecture is None:
                        continue
                    module = repository.get_module(lecture.module_id)
                    class_record = repository.get_class(module.class_id) if module else None
                    class_dir = _slug_or_default(
                        class_record.name if class_record else None,
                        f"class-{module.class_id if module else lecture.module_id}",
                    )
                    module_dir = _slug_or_default(
                        module.name if module else None,
                        f"module-{module.id if module else lecture.module_id}",
                    )
                    lecture_dir = _slug_or_default(lecture.name, f"lecture-{lecture.id}")
                    base_dir = Path("lectures") / class_dir / module_dir / lecture_dir

                    for asset_key in asset_keys:
                        fields = BULK_DOWNLOAD_ASSET_FIELDS.get(asset_key)
                        if not fields:
                            continue
                        relative: Optional[str] = None
                        for field in fields:
                            candidate = getattr(lecture, field, None)
                            if candidate:
                                relative = candidate
                                break
                        if not relative:
                            continue
                        try:
                            source = _resolve_storage_path(root_path, relative)
                        except ValueError:
                            continue
                        if not source.exists() or not source.is_file():
                            continue
                        arcname = (base_dir / source.name).as_posix()
                        if arcname in written:
                            continue
                        bundle.write(source, arcname)
                        written.add(arcname)
                        file_count += 1
        except OSError as error:
            with contextlib.suppress(OSError):
                archive_path.unlink()
            raise HTTPException(status_code=500, detail="Failed to create archive") from error

        if file_count == 0:
            with contextlib.suppress(OSError):
                archive_path.unlink()
            raise HTTPException(status_code=400, detail="No downloadable assets found")

        relative_path = archive_path.relative_to(root_path).as_posix()
        info = archive_path.stat()

        _log_event(
            "Prepared bulk asset download",
            filename=filename,
            size=info.st_size,
            file_count=file_count,
            lecture_count=len(normalized),
        )

        return {
            "archive": {
                "filename": filename,
                "path": relative_path,
                "size": info.st_size,
                "count": file_count,
            }
        }

    @app.get("/api/storage/overview")
    async def get_storage_overview() -> StorageOverviewResponse:
        _log_event("Building storage overview")
        classes: List[ClassStorageSummary] = []
        eligible_total = 0
        root_path = _require_storage_root().resolve()

        for class_record in repository.iter_classes():
            modules: List[ModuleStorageSummary] = []
            class_size = 0
            class_lecture_count = 0
            class_audio = 0
            class_processed = 0
            class_transcripts = 0
            class_notes = 0
            class_slides = 0
            class_eligible = 0
            class_storage_path: Optional[str] = None

            for class_dir in _iter_class_dirs(class_record):
                class_storage_path = _relative_existing_path(class_dir, root=root_path)
                if class_storage_path:
                    break

            module_records = list(repository.iter_modules(class_record.id))
            for module in module_records:
                lectures: List[LectureStorageSummary] = []
                module_size = 0
                module_audio = 0
                module_processed = 0
                module_transcripts = 0
                module_notes = 0
                module_slides = 0
                module_eligible = 0
                module_storage_path: Optional[str] = None

                for module_dir in _iter_module_dirs(class_record, module):
                    module_storage_path = _relative_existing_path(module_dir, root=root_path)
                    if module_storage_path:
                        break

                lecture_records = list(repository.iter_lectures(module.id))
                for lecture in lecture_records:
                    summary = _summarize_lecture_storage(
                        lecture,
                        class_record,
                        module,
                        root=root_path,
                    )
                    lectures.append(summary)
                    module_size += summary.size
                    class_size += summary.size

                    module_audio += int(summary.has_audio)
                    module_processed += int(summary.has_processed_audio)
                    module_transcripts += int(summary.has_transcript)
                    module_notes += int(summary.has_notes)
                    module_slides += int(summary.has_slides)
                    module_eligible += int(summary.eligible_audio)

                module_lecture_count = len(lectures)
                class_lecture_count += module_lecture_count
                class_audio += module_audio
                class_processed += module_processed
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
                        processed_audio_count=module_processed,
                        transcript_count=module_transcripts,
                        notes_count=module_notes,
                        slide_count=module_slides,
                        eligible_audio_count=module_eligible,
                        lectures=lectures,
                        storage_path=module_storage_path,
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
                    processed_audio_count=class_processed,
                    transcript_count=class_transcripts,
                    notes_count=class_notes,
                    slide_count=class_slides,
                    eligible_audio_count=class_eligible,
                    modules=modules,
                    storage_path=class_storage_path,
                )
            )

        _log_event(
            "Storage overview ready",
            classes=len(classes),
            eligible_audio_total=eligible_total,
        )
        return StorageOverviewResponse(classes=classes, eligible_audio_total=eligible_total)

    @app.delete("/api/storage")
    async def delete_storage(payload: StorageDeleteRequest) -> Dict[str, str]:
        _log_event("Deleting storage path", path=payload.path)
        root_path = _require_storage_root()
        try:
            target = _resolve_storage_path(root_path, payload.path)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Path is outside storage root") from error

        if target == root_path:
            raise HTTPException(status_code=400, detail="Cannot delete storage root")

        if not target.exists():
            raise HTTPException(status_code=404, detail="Path not found")

        _delete_storage_path(target)

        _log_event("Deleted storage path", path=payload.path)
        return {"status": "deleted"}

    @app.post("/api/storage/purge-audio")
    async def purge_transcribed_audio() -> Dict[str, int]:
        _log_event("Purging processed audio")
        deleted = 0
        for class_record in repository.iter_classes():
            for module in repository.iter_modules(class_record.id):
                for lecture in repository.iter_lectures(module.id):
                    has_audio = bool(lecture.audio_path)
                    has_processed = bool(lecture.processed_audio_path)
                    if not lecture.transcript_path or not (has_audio or has_processed):
                        continue

                    for relative_path in (lecture.audio_path, lecture.processed_audio_path):
                        asset_path = _resolve_existing_asset(relative_path)
                        if asset_path:
                            _delete_storage_path(asset_path)

                    repository.update_lecture_assets(
                        lecture.id,
                        audio_path=None,
                        processed_audio_path=None,
                    )
                    deleted += 1
        _log_event("Purged processed audio", deleted=deleted)
        return {"deleted": deleted}

    @app.post("/api/storage/repair")
    async def repair_storage() -> Dict[str, Any]:
        _log_event("Repairing storage")
        root_path = _require_storage_root().resolve()
        archive_root = config.archive_root.resolve()

        oversize_factor_value = getattr(config, "storage_repair_oversize_factor", 5.0)
        try:
            oversize_factor = float(oversize_factor_value)
        except (TypeError, ValueError):
            oversize_factor = 5.0
        oversize_factor = max(oversize_factor, 1.0)

        PAGE_IMAGE_THRESHOLD = 20
        IMAGE_EXTENSIONS = {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".tif",
            ".tiff",
            ".bmp",
        }
        ARCHIVE_SUFFIXES = (
            ".zip",
            ".tar",
            ".tar.gz",
            ".tgz",
            ".tbz",
            ".tar.bz2",
            ".7z",
        )
        NUMERIC_IMAGE_PATTERN = re.compile(
            r"^(?P<base>.+?)(?:[-_ ]?(?:page|img|image|slide|frame))?[-_ ]?\d+$",
            re.IGNORECASE,
        )

        protected_entries: Set[Path] = set()
        removals: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []
        freed_bytes = 0
        all_references: Set[Path] = set()
        reference_sizes: Dict[Path, int] = {}

        def _normalize(path: Path) -> Path:
            try:
                return path.resolve(strict=False)
            except OSError:
                return path

        def _relative_label(path: Path) -> str:
            try:
                return _normalize(path).relative_to(root_path).as_posix()
            except ValueError:
                return path.name

        def _protect(path: Path) -> None:
            resolved = _normalize(path)
            while True:
                if resolved in protected_entries:
                    break
                protected_entries.add(resolved)
                if resolved == root_path or resolved.parent == resolved:
                    break
                resolved = resolved.parent

        def _is_within(candidate: Path, ancestor: Path) -> bool:
            try:
                candidate.relative_to(ancestor)
                return True
            except ValueError:
                return False

        def _contains_reference(path: Path) -> bool:
            normalized = _normalize(path)
            if normalized in all_references:
                return True
            for reference in all_references:
                try:
                    reference.relative_to(normalized)
                    return True
                except ValueError:
                    continue
            return False

        def _is_path_protected(path: Path) -> bool:
            resolved = _normalize(path)
            if resolved in protected_entries:
                return True
            for protected in protected_entries:
                if _is_within(protected, resolved):
                    return True
            return False

        def _register_removal(resolved: Path, *, kind: str, description: str, size: int) -> None:
            nonlocal freed_bytes
            try:
                relative = resolved.relative_to(root_path).as_posix()
            except ValueError:
                relative = resolved.name
            removals.append(
                {
                    "path": relative,
                    "kind": kind,
                    "description": description,
                    "size": int(size),
                }
            )
            freed_bytes += int(size)

        def _safe_delete(target: Path, *, kind: str, description: str) -> None:
            resolved = _normalize(target)
            if not resolved.exists():
                return
            if _is_path_protected(resolved) or _contains_reference(resolved):
                skipped.append(
                    {
                        "path": _relative_label(resolved),
                        "kind": kind,
                        "reason": "protected",
                    }
                )
                return
            try:
                size = (
                    _calculate_directory_size(resolved)
                    if resolved.is_dir()
                    else resolved.stat().st_size
                )
            except (OSError, ValueError):
                size = 0
            try:
                _delete_storage_path(resolved)
            except (OSError, ValueError) as error:
                skipped.append(
                    {
                        "path": _relative_label(resolved),
                        "kind": kind,
                        "reason": f"{error.__class__.__name__}: {error}",
                    }
                )
                return
            _register_removal(resolved, kind=kind, description=description, size=int(size))

        def _compact_token(value: str) -> str:
            return re.sub(r"[^a-z0-9]+", "", value.lower())

        def _image_group_key(path: Path) -> Optional[Tuple[Path, str, str]]:
            stem = path.stem
            match = NUMERIC_IMAGE_PATTERN.match(stem)
            if match:
                base = match.group("base")
            else:
                stripped = re.sub(r"\d+$", "", stem)
                if stripped == stem:
                    return None
                base = stripped
            base = re.sub(r"[-_ ()]+$", "", base)
            if not base:
                return None
            parent = _normalize(path.parent)
            return (parent, base.lower(), path.suffix.lower())

        def _is_file_referenced(path: Path, files: Set[Path], directories: Set[Path]) -> bool:
            if path in files:
                return True
            for directory in directories:
                if _is_within(path, directory):
                    return True
            return False

        def _is_referenced_path(path: Path, references: Optional[AbstractSet[Path]]) -> bool:
            if not references:
                return False
            resolved_candidate = _normalize(path)
            for reference in references:
                if resolved_candidate == reference:
                    return True
                if _is_within(resolved_candidate, reference):
                    return True
                if _is_within(reference, resolved_candidate):
                    return True
            return False

        TEMP_DIR_NAMES = {
            "tmp",
            "temp",
            "__macosx",
            ".tmp",
            ".temp",
            "__pycache__",
            ".cache",
            "cache",
            ".previews",
            "_previews",
            "previews",
            ".ipynb_checkpoints",
        }
        TEMP_FILE_NAMES = {".ds_store", "thumbs.db", "desktop.ini"}
        TEMP_SUFFIXES = (
            ".tmp",
            ".temp",
            ".part",
            ".partial",
            ".cache",
            ".download",
            ".crdownload",
            ".swp",
        )

        def _matches_prefix(name: str, prefix: str) -> bool:
            if not name.startswith(prefix):
                return False
            if len(name) == len(prefix):
                return True
            next_char = name[len(prefix)]
            return not next_char.isalpha()

        TEMP_PREFIX_CHECKS = (
            functools.partial(_matches_prefix, prefix="tmp"),
            functools.partial(_matches_prefix, prefix="temp"),
            functools.partial(_matches_prefix, prefix="cache"),
            functools.partial(_matches_prefix, prefix="preview"),
            lambda value: value.startswith("~$"),
            lambda value: value.startswith(".~"),
            lambda value: value.startswith(".tmp"),
            lambda value: value.startswith(".temp"),
            lambda value: value.startswith(".cache"),
            lambda value: value.startswith("_tmp"),
            lambda value: value.startswith("_temp"),
            lambda value: value.startswith("._"),
        )

        NUMERIC_TMP_PATTERN = re.compile(r"^(?:tmp|temp|cache|preview)[-_]?\d+(?:[-_]\d+)*$")
        DATED_TMP_PATTERN = re.compile(r"^(?:tmp|temp)[-_]?\d{4}(?:[-_]\d{2}){2}(?:[-_]\d+)?$")
        PREVIEW_KEYWORDS = (".previews", "_previews", "previews")
        AGGRESSIVE_IMAGE_PREFIXES = ("render-", "preview-", "slide-")
        AGGRESSIVE_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

        def _cleanup_temporary_entries(
            base: Path,
            *,
            aggressive: bool = False,
            references: Optional[AbstractSet[Path]] = None,
        ) -> None:
            resolved_base = _normalize(base)
            if not resolved_base.exists() or not resolved_base.is_dir():
                return
            try:
                children = list(resolved_base.iterdir())
            except (OSError, PermissionError):
                return
            for child in children:
                normalized_child = _normalize(child)
                name_lower = child.name.lower()
                if child.is_dir():
                    if _is_referenced_path(normalized_child, references):
                        _cleanup_temporary_entries(
                            normalized_child,
                            aggressive=aggressive,
                            references=references,
                        )
                        continue
                    has_prefix = any(check(name_lower) for check in TEMP_PREFIX_CHECKS)
                    matches_suffix = any(name_lower.endswith(suffix) for suffix in TEMP_SUFFIXES)
                    matches_numeric = bool(
                        NUMERIC_TMP_PATTERN.match(name_lower)
                        or DATED_TMP_PATTERN.match(name_lower)
                    )
                    looks_preview = any(keyword in name_lower for keyword in PREVIEW_KEYWORDS)
                    should_remove = (
                        name_lower in TEMP_DIR_NAMES
                        or has_prefix
                        or matches_suffix
                        or matches_numeric
                        or looks_preview
                    )
                    if not should_remove and aggressive:
                        should_remove = (
                            "cache" in name_lower
                            or "preview" in name_lower
                            or name_lower.endswith("-previews")
                            or name_lower.endswith("_previews")
                        )
                    if should_remove:
                        description = (
                            f"Preview cache '{child.name}'"
                            if "preview" in name_lower
                            else f"Temporary directory '{child.name}'"
                        )
                        _safe_delete(
                            normalized_child,
                            kind="temporary",
                            description=description,
                        )
                        continue
                    _cleanup_temporary_entries(
                        normalized_child,
                        aggressive=aggressive,
                        references=references,
                    )
                else:
                    if _is_referenced_path(normalized_child, references):
                        continue
                    has_prefix = any(check(name_lower) for check in TEMP_PREFIX_CHECKS)
                    has_suffix = any(name_lower.endswith(suffix) for suffix in TEMP_SUFFIXES)
                    aggressive_preview = False
                    suffix_lower = child.suffix.lower()
                    if aggressive and suffix_lower in AGGRESSIVE_IMAGE_SUFFIXES:
                        aggressive_preview = any(
                            name_lower.startswith(prefix)
                            for prefix in AGGRESSIVE_IMAGE_PREFIXES
                        )
                    if (
                        name_lower in TEMP_FILE_NAMES
                        or has_prefix
                        or has_suffix
                        or aggressive_preview
                    ):
                        description = (
                            f"Preview artifact '{child.name}'"
                            if aggressive_preview
                            else f"Temporary file '{child.name}'"
                        )
                        _safe_delete(
                            normalized_child,
                            kind="oversized_preview" if aggressive_preview else "temporary",
                            description=description,
                        )

        def _remove_known_temp_files(
            base: Path, *, references: Optional[AbstractSet[Path]] = None
        ) -> None:
            try:
                candidates = list(base.rglob("*"))
            except (OSError, PermissionError):
                return
            for candidate in candidates:
                normalized_candidate = _normalize(candidate)
                if not normalized_candidate.is_file():
                    continue
                if _is_referenced_path(normalized_candidate, references):
                    continue
                name_lower = normalized_candidate.name.lower()
                suffix_lower = normalized_candidate.suffix.lower()
                if (
                    name_lower in TEMP_FILE_NAMES
                    or any(name_lower.endswith(suffix) for suffix in TEMP_SUFFIXES)
                ):
                    description = f"Temporary file '{normalized_candidate.name}'"
                    kind = "temporary"
                    if suffix_lower in AGGRESSIVE_IMAGE_SUFFIXES and any(
                        name_lower.startswith(prefix)
                        for prefix in AGGRESSIVE_IMAGE_PREFIXES
                    ):
                        kind = "oversized_preview"
                        description = f"Preview artifact '{normalized_candidate.name}'"
                    _safe_delete(
                        normalized_candidate,
                        kind=kind,
                        description=description,
                    )
        def _add_reference_ancestors(path: Path) -> None:
            ancestor = path if path.is_dir() else path.parent
            while ancestor and ancestor != ancestor.parent:
                try:
                    ancestor.relative_to(root_path)
                except ValueError:
                    break
                normalized = _normalize(ancestor)
                all_references.add(normalized)
                if normalized == root_path:
                    break
                ancestor = ancestor.parent

        _protect(root_path)
        all_references.add(_normalize(root_path))

        for special in (archive_root, config.assets_root, config.database_file):
            try:
                resolved_special = special.resolve()
            except OSError:
                continue
            candidate = resolved_special
            if candidate.exists() and candidate.is_file():
                candidate = candidate.parent
            if _is_within(candidate, root_path):
                _protect(candidate)
                all_references.add(_normalize(candidate))
                _add_reference_ancestors(candidate)

        @dataclass
        class LectureContextInfo:
            class_record: ClassRecord
            module_record: ModuleRecord
            lecture: LectureRecord
            references: Set[Path]
            reference_files: Set[Path]
            reference_dirs: Set[Path]
            lecture_roots: List[Path]
            pdf_tokens: Set[str]
            pdf_tokens_compact: Set[str]
            lecture_tokens: Set[str]
            lecture_tokens_compact: Set[str]

        lecture_contexts: List[LectureContextInfo] = []

        for class_record in repository.iter_classes():
            for module in repository.iter_modules(class_record.id):
                for lecture in repository.iter_lectures(module.id):
                    references: Set[Path] = set()
                    reference_files: Set[Path] = set()
                    reference_dirs: Set[Path] = set()
                    pdf_tokens: Set[str] = set()
                    pdf_tokens_compact: Set[str] = set()
                    for relative in (
                        lecture.audio_path,
                        lecture.processed_audio_path,
                        lecture.slide_path,
                        lecture.transcript_path,
                        lecture.notes_path,
                        lecture.slide_image_dir,
                    ):
                        asset = _resolve_existing_asset(relative)
                        if asset is None:
                            continue
                        resolved = _normalize(asset)
                        if resolved in references:
                            continue
                        references.add(resolved)
                        all_references.add(resolved)
                        _protect(resolved)
                        _add_reference_ancestors(resolved)
                        try:
                            if resolved.is_dir():
                                size = reference_sizes.get(resolved)
                                if size is None:
                                    size = _calculate_directory_size(resolved)
                                    reference_sizes[resolved] = size
                                reference_dirs.add(resolved)
                            else:
                                size = reference_sizes.get(resolved)
                                if size is None:
                                    size = resolved.stat().st_size
                                    reference_sizes[resolved] = size
                                reference_files.add(resolved)
                        except (OSError, ValueError):
                            reference_sizes.setdefault(resolved, 0)
                            if resolved.is_dir():
                                reference_dirs.add(resolved)
                            else:
                                reference_files.add(resolved)
                        if resolved.suffix.lower() == ".pdf":
                            pdf_tokens.add(resolved.name.lower())
                            pdf_tokens.add(resolved.stem.lower())
                            pdf_tokens_compact.add(_compact_token(resolved.name))
                            pdf_tokens_compact.add(_compact_token(resolved.stem))

                    candidate_dirs: List[Path] = []
                    for reference in references:
                        base_dir = reference if reference.is_dir() else reference.parent
                        if base_dir is None:
                            continue
                        try:
                            base_dir.relative_to(root_path)
                        except ValueError:
                            continue
                        normalized_dir = _normalize(base_dir)
                        if normalized_dir not in candidate_dirs:
                            candidate_dirs.append(normalized_dir)

                    try:
                        candidate_dirs.sort(key=lambda value: len(value.relative_to(root_path).parts))
                    except ValueError:
                        candidate_dirs.sort()

                    lecture_roots: List[Path] = []
                    for candidate in candidate_dirs:
                        if any(_is_within(candidate, existing) for existing in lecture_roots):
                            continue
                        lecture_roots.append(candidate)

                    lecture_tokens = {lecture.name.lower()}
                    slug = slugify(lecture.name).strip()
                    if slug:
                        lecture_tokens.add(slug.lower())
                    lecture_tokens = {token for token in lecture_tokens if token}
                    lecture_tokens_compact = {_compact_token(token) for token in lecture_tokens}

                    lecture_contexts.append(
                        LectureContextInfo(
                            class_record=class_record,
                            module_record=module,
                            lecture=lecture,
                            references=references,
                            reference_files=reference_files,
                            reference_dirs=reference_dirs,
                            lecture_roots=lecture_roots,
                            pdf_tokens=pdf_tokens,
                            pdf_tokens_compact=pdf_tokens_compact,
                            lecture_tokens=lecture_tokens,
                            lecture_tokens_compact=lecture_tokens_compact,
                        )
                    )

        for context in lecture_contexts:
            if not context.lecture_roots:
                continue
            for lecture_root in context.lecture_roots:
                normalized_root = _normalize(lecture_root)
                if not normalized_root.exists() or not normalized_root.is_dir():
                    continue
                all_references.add(normalized_root)

                dir_stats: Dict[Path, Dict[str, Any]] = {}
                image_groups: defaultdict[Tuple[Path, str, str], List[Tuple[Path, int]]] = defaultdict(list)
                archives_by_parent: defaultdict[Path, List[Path]] = defaultdict(list)

                def _get_dir_stats(path: Path) -> Dict[str, Any]:
                    stats = dir_stats.get(path)
                    if stats is None:
                        stats = {"files": 0, "size": 0, "ext": Counter(), "referenced": 0}
                        dir_stats[path] = stats
                    return stats

                total_size = 0
                try:
                    walker = os.walk(normalized_root)
                except (OSError, PermissionError):
                    continue
                for dirpath, dirnames, filenames in walker:
                    current = _normalize(Path(dirpath))
                    _get_dir_stats(current)
                    for dirname in dirnames:
                        _get_dir_stats(_normalize(Path(dirpath) / dirname))
                    for filename in filenames:
                        raw_file = Path(dirpath) / filename
                        normalized_file = _normalize(raw_file)
                        if normalized_file.is_symlink():
                            continue
                        try:
                            stat = normalized_file.stat()
                        except (OSError, FileNotFoundError, PermissionError):
                            continue
                        size = stat.st_size
                        total_size += size
                        suffix_lower = normalized_file.suffix.lower()
                        referenced = _is_file_referenced(
                            normalized_file, context.reference_files, context.reference_dirs
                        )
                        ancestor = normalized_file.parent
                        while ancestor and ancestor != ancestor.parent:
                            if not _is_within(ancestor, normalized_root):
                                break
                            stats = _get_dir_stats(ancestor)
                            stats["files"] += 1
                            stats["size"] += size
                            stats["ext"][suffix_lower] = stats["ext"].get(suffix_lower, 0) + 1
                            if referenced:
                                stats["referenced"] += 1
                            if ancestor == normalized_root:
                                break
                            ancestor = ancestor.parent
                        if not referenced and suffix_lower in IMAGE_EXTENSIONS:
                            key = _image_group_key(normalized_file)
                            if key is not None:
                                image_groups[key].append((normalized_file, size))
                        if not referenced and suffix_lower in ARCHIVE_SUFFIXES:
                            parent_dir = _normalize(normalized_file.parent)
                            if _is_within(parent_dir, normalized_root):
                                archives_by_parent[parent_dir].append(normalized_file)

                referenced_size_in_root = 0
                for path in context.reference_files:
                    if _is_within(path, normalized_root):
                        try:
                            referenced_size_in_root += path.stat().st_size
                        except (OSError, FileNotFoundError, PermissionError):
                            continue
                for path in context.reference_dirs:
                    if _is_within(path, normalized_root):
                        referenced_size_in_root += reference_sizes.get(path, 0)

                actual_size = total_size
                excess_bytes = max(0, actual_size - referenced_size_in_root)
                bloated = False
                if referenced_size_in_root > 0:
                    bloated = actual_size > referenced_size_in_root * oversize_factor
                elif actual_size > 0:
                    bloated = True

                cleaned = False
                handled_archives: Set[Path] = set()
                handled_files: Set[Path] = set()

                possible_archive_tokens = set(context.pdf_tokens) | set(context.lecture_tokens)
                possible_archive_tokens_compact = (
                    set(context.pdf_tokens_compact) | set(context.lecture_tokens_compact)
                )

                for (parent, base, _ext), group_files in list(image_groups.items()):
                    if not _is_within(parent, normalized_root):
                        continue
                    if len(group_files) < PAGE_IMAGE_THRESHOLD:
                        continue
                    description = (
                        f"Derived slide images for lecture '{context.lecture.name}'"
                    )
                    for file_path, _size in group_files:
                        if file_path in handled_files:
                            continue
                        _safe_delete(file_path, kind="derived_images", description=description)
                        handled_files.add(file_path)
                        cleaned = True
                    archive_tokens = set(possible_archive_tokens)
                    archive_tokens.add(base)
                    archive_tokens_compact = set(possible_archive_tokens_compact)
                    archive_tokens_compact.add(_compact_token(base))
                    for archive_path in list(archives_by_parent.get(parent, [])):
                        if archive_path in handled_archives:
                            continue
                        archive_stem = archive_path.stem.lower()
                        archive_compact = _compact_token(archive_stem)
                        matches_token = any(
                            token and token in archive_stem for token in archive_tokens
                        ) or any(
                            token and token in archive_compact for token in archive_tokens_compact
                        )
                        if matches_token:
                            _safe_delete(
                                archive_path,
                                kind="unreferenced_archive",
                                description=f"Archive for derived images '{archive_path.name}'",
                            )
                            handled_archives.add(archive_path)
                            cleaned = True

                child_directories = [
                    path
                    for path in dir_stats
                    if path != normalized_root and path.parent == normalized_root
                ]

                for directory in child_directories:
                    if directory in context.reference_dirs:
                        continue
                    if not directory.exists():
                        continue
                    if _is_path_protected(directory) or _contains_reference(directory):
                        continue
                    stats = dir_stats.get(directory)
                    if not stats:
                        continue
                    total_files = stats.get("files", 0)
                    if total_files <= 0:
                        continue
                    image_count = sum(
                        count for ext, count in stats.get("ext", {}).items() if ext in IMAGE_EXTENSIONS
                    )
                    image_ratio = image_count / total_files if total_files else 0.0
                    has_referenced_files = stats.get("referenced", 0) > 0
                    dir_name_lower = directory.name.lower()
                    dir_name_compact = _compact_token(dir_name_lower)
                    is_conversion_candidate = False
                    if image_count >= PAGE_IMAGE_THRESHOLD and image_ratio >= 0.9:
                        is_conversion_candidate = any(
                            token and token in dir_name_lower for token in context.pdf_tokens
                        ) or any(
                            token and token in dir_name_compact
                            for token in context.pdf_tokens_compact
                        )
                    if is_conversion_candidate:
                        _safe_delete(
                            directory,
                            kind="unreferenced_conversion",
                            description=f"Derived slide images in '{directory.name}'",
                        )
                        cleaned = True
                        continue
                    if (
                        bloated
                        and not has_referenced_files
                        and image_count >= PAGE_IMAGE_THRESHOLD
                        and image_ratio >= 0.95
                    ):
                        _safe_delete(
                            directory,
                            kind="bloated_lecture_cleanup",
                            description=f"Derived image directory '{directory.name}'",
                        )
                        cleaned = True

                for archives in archives_by_parent.values():
                    for archive_path in archives:
                        if archive_path in handled_archives:
                            continue
                        if not archive_path.exists():
                            continue
                        _safe_delete(
                            archive_path,
                            kind="unreferenced_archive",
                            description=f"Unreferenced archive '{archive_path.name}'",
                        )
                        cleaned = True

                references_for_cleanup = context.references | context.reference_dirs
                freed_before = freed_bytes
                _cleanup_temporary_entries(
                    normalized_root,
                    aggressive=bloated,
                    references=references_for_cleanup,
                )
                if freed_bytes > freed_before:
                    cleaned = True

                _remove_known_temp_files(
                    normalized_root, references=references_for_cleanup
                )

                if bloated and not cleaned and excess_bytes > 0:
                    skipped.append(
                        {
                            "path": _relative_label(normalized_root),
                            "kind": "could_not_clean",
                            "reason": "no_patterns_detected",
                            "excess_bytes": int(excess_bytes),
                        }
                    )

        if _is_within(archive_root, root_path) and archive_root.exists() and archive_root.is_dir():
            for child in list(archive_root.iterdir()):
                _safe_delete(child, kind="archive", description="Temporary export archive")

        freed_before = freed_bytes
        _cleanup_temporary_entries(root_path, aggressive=True, references=all_references)
        if freed_bytes > freed_before:
            pass

        _remove_known_temp_files(root_path, references=all_references)

        keep_directories: Set[Path] = set()

        def _track_keep_directory(path: Path) -> None:
            candidate = _normalize(path)
            if candidate.exists() and candidate.is_file():
                candidate = candidate.parent
            try:
                candidate.relative_to(root_path)
            except ValueError:
                if candidate != root_path:
                    return
            while True:
                keep_directories.add(candidate)
                if candidate == root_path:
                    break
                parent = candidate.parent
                if parent == candidate:
                    break
                candidate = _normalize(parent)
                try:
                    candidate.relative_to(root_path)
                except ValueError:
                    break

        _track_keep_directory(root_path)
        if _is_within(archive_root, root_path):
            _track_keep_directory(archive_root)
        if _is_within(config.assets_root, root_path):
            _track_keep_directory(config.assets_root)
        if _is_within(config.database_file, root_path):
            _track_keep_directory(config.database_file)
        for context in lecture_contexts:
            for lecture_root in context.lecture_roots:
                _track_keep_directory(lecture_root)

        def _prune_orphan_directories(path: Path) -> None:
            try:
                children = list(path.iterdir())
            except (OSError, PermissionError):
                return
            for child in children:
                normalized_child = _normalize(child)
                if child.is_dir():
                    _prune_orphan_directories(normalized_child)
                    if (
                        normalized_child in keep_directories
                        or _is_path_protected(normalized_child)
                        or _contains_reference(normalized_child)
                    ):
                        continue
                    _safe_delete(
                        normalized_child,
                        kind="orphan_directory",
                        description="Unreferenced directory",
                    )
                elif child.is_file():
                    name_lower = child.name.lower()
                    suffix_lower = child.suffix.lower()
                    if (
                        not _is_path_protected(normalized_child)
                        and not _contains_reference(normalized_child)
                        and (
                            name_lower in TEMP_FILE_NAMES
                            or any(name_lower.endswith(suffix) for suffix in TEMP_SUFFIXES)
                        )
                    ):
                        description = f"Temporary file '{child.name}'"
                        kind = "temporary"
                        if suffix_lower in AGGRESSIVE_IMAGE_SUFFIXES and any(
                            name_lower.startswith(prefix)
                            for prefix in AGGRESSIVE_IMAGE_PREFIXES
                        ):
                            kind = "oversized_preview"
                            description = f"Preview artifact '{child.name}'"
                        _safe_delete(
                            normalized_child,
                            kind=kind,
                            description=description,
                        )
                        continue
                    if suffix_lower in ARCHIVE_SUFFIXES and not _is_path_protected(normalized_child):
                        _safe_delete(
                            normalized_child,
                            kind="unreferenced_archive",
                            description=f"Stray archive '{child.name}'",
                        )

        _prune_orphan_directories(root_path)

        try:
            top_level_children = list(root_path.iterdir())
        except (OSError, PermissionError):
            top_level_children = []
        for child in top_level_children:
            normalized_child = _normalize(child)
            if not child.is_dir():
                continue
            if not normalized_child.exists():
                continue
            if not _contains_reference(normalized_child):
                continue
            if child.name == child.name.lower():
                continue
            skipped.append(
                {
                    "path": _relative_label(normalized_child),
                    "kind": "protected_directory",
                    "reason": "protected",
                }
            )

        _log_event(
            "Storage repair completed",
            removed=len(removals),
            freed=freed_bytes,
            skipped=len(skipped),
        )
        return {
            "status": "ok",
            "removed": removals,
            "skipped": skipped,
            "freed_bytes": int(freed_bytes),
        }
    @app.post(
        "/api/assets/reveal",
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
    )
    async def reveal_asset(payload: RevealRequest) -> Response:
        _log_event("Revealing asset", path=payload.path, select=payload.select)
        root_path = _require_storage_root()
        try:
            target = _resolve_storage_path(root_path, payload.path)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Path is outside storage root") from error

        try:
            _open_in_file_manager(target, select=payload.select)
        except RuntimeError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        _log_event("Asset revealed", path=payload.path)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/system/update")
    async def get_update_status() -> Dict[str, Any]:
        manager: UpdateManager | None = getattr(app.state, "update_manager", None)
        if manager is None:
            raise HTTPException(status_code=503, detail="Update service is unavailable")
        return {"update": manager.get_status()}

    @app.post("/api/system/update")
    async def trigger_update() -> Dict[str, Any]:
        manager: UpdateManager | None = getattr(app.state, "update_manager", None)
        if manager is None:
            raise HTTPException(status_code=503, detail="Update service is unavailable")
        try:
            status_payload = manager.start()
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return {"update": status_payload}

    @app.post("/api/system/shutdown", status_code=status.HTTP_202_ACCEPTED)
    async def shutdown_application() -> Dict[str, str]:
        _log_event("Shutdown requested")
        server = getattr(app.state, "server", None)
        if server is None:
            raise HTTPException(status_code=503, detail="Shutdown is unavailable.")

        server.should_exit = True
        if hasattr(server, "force_exit"):
            server.force_exit = True

        _log_event("Shutdown initiated")
        return {"status": "shutting_down"}

    @app.get("/{requested_path:path}", response_class=HTMLResponse)
    async def spa_fallback(request: Request, requested_path: str) -> HTMLResponse:
        """Serve the UI for non-API paths when the app lives under a prefix."""

        _log_event("Serving SPA fallback", path=requested_path)
        if not requested_path or requested_path == "index.html":
            return HTMLResponse(_render_index_html(request))

        normalized = requested_path.lstrip("/")
        if normalized in {"api", "storage"}:
            raise HTTPException(status_code=404, detail="Not Found")

        if normalized.startswith("api/") or normalized.startswith("storage/"):
            raise HTTPException(status_code=404, detail="Not Found")

        _log_event("SPA fallback resolved", path=requested_path)
        return HTMLResponse(_render_index_html(request))

    globals()["_generate_slide_bundle"] = _generate_slide_bundle

    initial_settings = _load_ui_settings()
    _update_debug_state(initial_settings.debug_enabled)

    return app


__all__ = ["create_app"]
