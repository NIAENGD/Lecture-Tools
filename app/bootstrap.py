"""Bootstrap logic that prepares runtime directories and the SQLite database."""

from __future__ import annotations

import logging
import shutil
import sqlite3
from pathlib import Path

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

        archive_root = self._config.archive_root
        archive_root.mkdir(parents=True, exist_ok=True)
        for child in archive_root.iterdir():
            try:
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
            except OSError as error:  # pragma: no cover - best effort cleanup
                LOGGER.warning("Could not remove archive %s: %s", child, error)
        LOGGER.debug("Cleared archive directory: %s", archive_root)

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
                    description TEXT DEFAULT '',
                    position INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS modules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    class_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    position INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(class_id, name),
                    FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS lectures (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    module_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    position INTEGER NOT NULL DEFAULT 0,
                    audio_path TEXT,
                    processed_audio_path TEXT,
                    slide_path TEXT,
                    transcript_path TEXT,
                    notes_path TEXT,
                    slide_image_dir TEXT,
                    UNIQUE(module_id, name),
                    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE
                );
                """
            )
            connection.commit()

            for column in ("notes_path", "processed_audio_path"):
                try:
                    cursor.execute(f"ALTER TABLE lectures ADD COLUMN {column} TEXT")
                except sqlite3.OperationalError as error:
                    message = str(error).lower()
                    if "duplicate column name" not in message:
                        raise

            def _column_exists(table: str, column: str) -> bool:
                cursor.execute(f"PRAGMA table_info({table})")
                return any(row[1] == column for row in cursor.fetchall())

            def _ensure_positions() -> None:
                if not _column_exists("classes", "position"):
                    cursor.execute(
                        "ALTER TABLE classes ADD COLUMN position INTEGER NOT NULL DEFAULT 0"
                    )
                    connection.commit()
                    cursor.execute("SELECT id FROM classes ORDER BY name, id")
                    for index, (class_id,) in enumerate(cursor.fetchall()):
                        cursor.execute(
                            "UPDATE classes SET position = ? WHERE id = ?",
                            (index, class_id),
                        )
                    connection.commit()

                if not _column_exists("modules", "position"):
                    cursor.execute(
                        "ALTER TABLE modules ADD COLUMN position INTEGER NOT NULL DEFAULT 0"
                    )
                    connection.commit()
                    cursor.execute(
                        "SELECT id, class_id FROM modules ORDER BY class_id, name, id"
                    )
                    assignments: dict[int, int] = {}
                    for module_id, class_id in cursor.fetchall():
                        offset = assignments.get(class_id, 0)
                        cursor.execute(
                            "UPDATE modules SET position = ? WHERE id = ?",
                            (offset, module_id),
                        )
                        assignments[class_id] = offset + 1
                    connection.commit()

                if not _column_exists("lectures", "position"):
                    cursor.execute(
                        "ALTER TABLE lectures ADD COLUMN position INTEGER NOT NULL DEFAULT 0"
                    )
                    connection.commit()
                    cursor.execute(
                        "SELECT id, module_id FROM lectures ORDER BY module_id, name, id"
                    )
                    assignments: dict[int, int] = {}
                    for lecture_id, module_id in cursor.fetchall():
                        offset = assignments.get(module_id, 0)
                        cursor.execute(
                            "UPDATE lectures SET position = ? WHERE id = ?",
                            (offset, lecture_id),
                        )
                        assignments[module_id] = offset + 1
                    connection.commit()

            _ensure_positions()
        finally:
            connection.close()


def initialize_app(config_path: Path | None = None) -> AppConfig:
    """Convenience helper that loads configuration and runs initialization."""

    config = load_config(config_path=config_path)
    bootstrapper = Bootstrapper(config)
    bootstrapper.initialize()
    return config


__all__ = ["BootstrapError", "Bootstrapper", "initialize_app"]
