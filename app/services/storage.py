"""Persistence helpers backed by SQLite."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

from ..config import AppConfig


@dataclass
class ClassRecord:
    id: int
    name: str
    description: str


@dataclass
class ModuleRecord:
    id: int
    class_id: int
    name: str
    description: str


@dataclass
class LectureRecord:
    id: int
    module_id: int
    name: str
    description: str
    audio_path: Optional[str]
    slide_path: Optional[str]
    transcript_path: Optional[str]
    slide_image_dir: Optional[str]


class LectureRepository:
    """Simple repository exposing CRUD helpers."""

    def __init__(self, config: AppConfig) -> None:
        self._db_path = config.database_file

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        return connection

    # ---------------------------------------------------------------------
    # Creation helpers
    # ---------------------------------------------------------------------
    def add_class(self, name: str, description: str = "") -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO classes(name, description) VALUES (?, ?)", (name, description)
            )
            return int(cursor.lastrowid)

    def find_class_by_name(self, name: str) -> Optional[ClassRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, name, description FROM classes WHERE name = ?", (name,)
            )
            row = cursor.fetchone()
            return ClassRecord(**row) if row else None

    def add_module(self, class_id: int, name: str, description: str = "") -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO modules(class_id, name, description) VALUES (?, ?, ?)",
                (class_id, name, description),
            )
            return int(cursor.lastrowid)

    def find_module_by_name(self, class_id: int, name: str) -> Optional[ModuleRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, class_id, name, description FROM modules WHERE class_id = ? AND name = ?",
                (class_id, name),
            )
            row = cursor.fetchone()
            return ModuleRecord(**row) if row else None

    def add_lecture(
        self,
        module_id: int,
        name: str,
        description: str = "",
        *,
        audio_path: Optional[str] = None,
        slide_path: Optional[str] = None,
        transcript_path: Optional[str] = None,
        slide_image_dir: Optional[str] = None,
    ) -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO lectures(
                    module_id, name, description, audio_path, slide_path, transcript_path, slide_image_dir
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    module_id,
                    name,
                    description,
                    audio_path,
                    slide_path,
                    transcript_path,
                    slide_image_dir,
                ),
            )
            return int(cursor.lastrowid)

    def find_lecture_by_name(self, module_id: int, name: str) -> Optional[LectureRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                SELECT id, module_id, name, description, audio_path, slide_path, transcript_path, slide_image_dir
                FROM lectures
                WHERE module_id = ? AND name = ?
                """,
                (module_id, name),
            )
            row = cursor.fetchone()
            return LectureRecord(**row) if row else None

    # ------------------------------------------------------------------
    # Iteration helpers
    # ------------------------------------------------------------------
    def iter_classes(self) -> Iterable[ClassRecord]:
        with self._connect() as connection:
            cursor = connection.execute("SELECT id, name, description FROM classes ORDER BY name")
            for row in cursor.fetchall():
                yield ClassRecord(**row)

    def iter_modules(self, class_id: int) -> Iterable[ModuleRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, class_id, name, description FROM modules WHERE class_id = ? ORDER BY name",
                (class_id,),
            )
            for row in cursor.fetchall():
                yield ModuleRecord(**row)

    def iter_lectures(self, module_id: int) -> Iterable[LectureRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                SELECT id, module_id, name, description, audio_path, slide_path, transcript_path, slide_image_dir
                FROM lectures
                WHERE module_id = ?
                ORDER BY name
                """,
                (module_id,),
            )
            for row in cursor.fetchall():
                yield LectureRecord(**row)

    def get_class(self, class_id: int) -> Optional[ClassRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, name, description FROM classes WHERE id = ?",
                (class_id,),
            )
            row = cursor.fetchone()
            return ClassRecord(**row) if row else None

    def get_module(self, module_id: int) -> Optional[ModuleRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, class_id, name, description FROM modules WHERE id = ?",
                (module_id,),
            )
            row = cursor.fetchone()
            return ModuleRecord(**row) if row else None

    def get_lecture(self, lecture_id: int) -> Optional[LectureRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                SELECT id, module_id, name, description, audio_path, slide_path, transcript_path, slide_image_dir
                FROM lectures WHERE id = ?
                """,
                (lecture_id,),
            )
            row = cursor.fetchone()
            return LectureRecord(**row) if row else None

    def update_lecture_description(self, lecture_id: int, description: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE lectures SET description = ? WHERE id = ?",
                (description, lecture_id),
            )

    def update_lecture_assets(
        self,
        lecture_id: int,
        *,
        audio_path: Optional[str] = None,
        slide_path: Optional[str] = None,
        transcript_path: Optional[str] = None,
        slide_image_dir: Optional[str] = None,
    ) -> None:
        """Update asset paths for a lecture.

        Only provided values are updated; omitted ones are left untouched.
        """

        assignments: List[str] = []
        params: List[Optional[str]] = []
        if audio_path is not None:
            assignments.append("audio_path = ?")
            params.append(audio_path)
        if slide_path is not None:
            assignments.append("slide_path = ?")
            params.append(slide_path)
        if transcript_path is not None:
            assignments.append("transcript_path = ?")
            params.append(transcript_path)
        if slide_image_dir is not None:
            assignments.append("slide_image_dir = ?")
            params.append(slide_image_dir)

        if not assignments:
            return

        params.append(lecture_id)
        query = "UPDATE lectures SET " + ", ".join(assignments) + " WHERE id = ?"
        with self._connect() as connection:
            connection.execute(query, params)

    def remove_class(self, class_id: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM classes WHERE id = ?", (class_id,))

    def remove_module(self, module_id: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM modules WHERE id = ?", (module_id,))

    def remove_lecture(self, lecture_id: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM lectures WHERE id = ?", (lecture_id,))


__all__ = [
    "ClassRecord",
    "ModuleRecord",
    "LectureRecord",
    "LectureRepository",
]
