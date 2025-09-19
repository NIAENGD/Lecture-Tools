"""Bootstrap logic that prepares runtime directories and the SQLite database."""

from __future__ import annotations

import logging
from pathlib import Path
import sqlite3

from .config import AppConfig, load_config

LOGGER = logging.getLogger(__name__)


class BootstrapError(RuntimeError):
    """Raised when initialization cannot be completed."""


class Bootstrapper:
    """High level object orchestrating initialization steps."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config

    @property
    def config(self) -> AppConfig:
        return self._config

    def initialize(self) -> None:
        """Run all bootstrap tasks."""

        LOGGER.debug("Starting bootstrap sequence")
        self._ensure_directories()
        self._ensure_database()
        LOGGER.info("Bootstrap completed successfully")

    def _ensure_directories(self) -> None:
        for path in (self._config.storage_root, self._config.assets_root):
            path.mkdir(parents=True, exist_ok=True)
            LOGGER.debug("Ensured directory exists: %s", path)

    def _ensure_database(self) -> None:
        LOGGER.debug("Ensuring database schema at %s", self._config.database_file)
        connection = sqlite3.connect(self._config.database_file)
        try:
            cursor = connection.cursor()
            cursor.executescript(
                """
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS classes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS modules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    class_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    UNIQUE(class_id, name),
                    FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS lectures (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    module_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    audio_path TEXT,
                    slide_path TEXT,
                    transcript_path TEXT,
                    slide_image_dir TEXT,
                    UNIQUE(module_id, name),
                    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE
                );
                """
            )
            connection.commit()
        finally:
            connection.close()


def initialize_app(config_path: Path | None = None) -> AppConfig:
    """Convenience helper that loads configuration and runs initialization."""

    config = load_config(config_path=config_path)
    bootstrapper = Bootstrapper(config)
    bootstrapper.initialize()
    return config


__all__ = ["BootstrapError", "Bootstrapper", "initialize_app"]
