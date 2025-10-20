"""Structured event helpers shared across the application."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


DEFAULT_EVENT_LOGGER = logging.getLogger("lecture_tools.ui.events")


def sanitize_context_value(value: Any) -> Any:
    """Return a JSON-serialisable representation for *value*."""

    if value is None:
        return None
    if isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        sanitized: Dict[str, Any] = {}
        for key, item in value.items():
            if key is None:
                continue
            cleaned = sanitize_context_value(item)
            if cleaned is None or cleaned == "":
                continue
            sanitized[str(key)] = cleaned
        return sanitized
    if isinstance(value, (list, tuple, set)):
        joined = ", ".join(str(item) for item in value)
    else:
        joined = str(value)
    trimmed = joined.strip()
    if not trimmed:
        return None
    return trimmed[:200] + ("…" if len(trimmed) > 200 else "")


def normalize_context(values: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Normalise structured metadata for event emission."""

    if not values:
        return {}
    normalised: Dict[str, Any] = {}
    for key, raw_value in values.items():
        if not key:
            continue
        value = sanitize_context_value(raw_value)
        if value is None or value == "":
            continue
        normalised[str(key)] = value
    return normalised


def emit_structured_event(
    event_type: str,
    message: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    correlation: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    level: int = logging.INFO,
    logger: logging.Logger | logging.LoggerAdapter = DEFAULT_EVENT_LOGGER,
) -> None:
    """Emit a structured event with consistent logging metadata."""

    base_message = str(message).strip()
    normalised_context = normalize_context(context)
    normalised_payload = normalize_context(payload)
    normalised_correlation = normalize_context(correlation)
    combined_details = {
        **normalised_correlation,
        **normalised_context,
        **normalised_payload,
    }
    details_text = ", ".join(f"{key}={value}" for key, value in combined_details.items())
    display_message = f"[{event_type}] {base_message}" if event_type else base_message
    log_message = f"{display_message} ({details_text})" if details_text else display_message
    extra: Dict[str, Any] = {
        "debug_event": base_message,
        "debug_event_type": event_type or "",
    }
    if normalised_context:
        extra["debug_context"] = normalised_context
    if normalised_payload:
        extra["debug_payload"] = normalised_payload
    if normalised_correlation:
        extra["debug_correlation"] = normalised_correlation
    if duration_ms is not None:
        extra["debug_duration_ms"] = float(duration_ms)
    logger.log(level, log_message, extra=extra)


def emit_db_event(
    action: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    correlation: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    level: int = logging.INFO,
    logger: logging.Logger | logging.LoggerAdapter = DEFAULT_EVENT_LOGGER,
) -> None:
    """Emit a structured database event."""

    emit_structured_event(
        "DB_QUERY",
        action,
        payload=payload,
        context=context,
        correlation=correlation,
        duration_ms=duration_ms,
        level=level,
        logger=logger,
    )


def emit_file_event(
    operation: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    correlation: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    level: int = logging.INFO,
    logger: logging.Logger | logging.LoggerAdapter = DEFAULT_EVENT_LOGGER,
) -> None:
    """Emit a structured file-system event."""

    emit_structured_event(
        "FILE_OP",
        operation,
        payload=payload,
        context=context,
        correlation=correlation,
        duration_ms=duration_ms,
        level=level,
        logger=logger,
    )


def emit_task_event(
    phase: str,
    message: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    correlation: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    level: int = logging.INFO,
    logger: logging.Logger | logging.LoggerAdapter = DEFAULT_EVENT_LOGGER,
) -> None:
    """Emit a structured task lifecycle event."""

    emit_structured_event(
        "TASK_STATE",
        message or phase,
        payload=payload,
        context=context,
        correlation=correlation,
        duration_ms=duration_ms,
        level=level,
        logger=logger,
    )


__all__ = [
    "DEFAULT_EVENT_LOGGER",
    "emit_db_event",
    "emit_file_event",
    "emit_structured_event",
    "emit_task_event",
    "normalize_context",
    "sanitize_context_value",
]
