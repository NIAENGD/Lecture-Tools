"""Centralized logging configuration for the Lecture Tools application."""

from __future__ import annotations

import logging
from logging import Logger
from pathlib import Path
from typing import Iterable


DEFAULT_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"


def configure_logging(level: int = logging.INFO, *, handlers: Iterable[logging.Handler] | None = None) -> Logger:
    """Configure the root logger with sensible defaults."""

    logger = logging.getLogger()
    logger.setLevel(level)

    if handlers is None:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(logging.Formatter(DEFAULT_LOG_FORMAT))
        logger.addHandler(stream_handler)
    else:
        for handler in handlers:
            logger.addHandler(handler)

    return logger


def get_log_file_path(storage_root: Path) -> Path:
    """Return the default path for the application log file."""

    return storage_root / "lecture_tools.log"


__all__ = ["configure_logging", "get_log_file_path", "DEFAULT_LOG_FORMAT"]
