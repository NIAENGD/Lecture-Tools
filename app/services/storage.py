"""Persistence helpers backed by SQLite."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from ..config import AppConfig


@dataclass
class ClassRecord:
    id: int
    name: str
    description: str
    position: int


@dataclass
class ModuleRecord:
    id: int
    class_id: int
    name: str
    description: str
    position: int


@dataclass
class LectureRecord:
    id: int
    module_id: int
    name: str
    description: str
    position: int
    audio_path: Optional[str]
    processed_audio_path: Optional[str]
    slide_path: Optional[str]
    transcript_path: Optional[str]
    notes_path: Optional[str]
    slide_image_dir: Optional[str]


_MISSING = object()


class LectureRepository:
    """Simple repository exposing CRUD helpers."""

    def __init__(self, config: AppConfig) -> None:
        self._db_path = config.database_file

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        # SQLite requires enabling foreign key enforcement for each
        # connection individually. Without this pragma, cascading deletes
        # defined in the schema are ignored, which prevents removing
        # classes, modules or lectures that still have dependent records.
        # See https://sqlite.org/foreignkeys.html#fk_enable for details.
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _next_position(
        self,
        connection: sqlite3.Connection,
        table: str,
        *,
        filter_field: Optional[str] = None,
        filter_value: Optional[int] = None,
    ) -> int:
        query = f"SELECT COALESCE(MAX(position), -1) + 1 FROM {table}"
        params: List[object] = []
        if filter_field is not None:
            query += f" WHERE {filter_field} = ?"
            params.append(filter_value)
        cursor = connection.execute(query, params)
        row = cursor.fetchone()
        if row is None:
            return 0
        next_value = row[0]
        return int(next_value or 0)

    # ---------------------------------------------------------------------
    # Creation helpers
    # ---------------------------------------------------------------------
    def add_class(self, name: str, description: str = "") -> int:
        with self._connect() as connection:
            position = self._next_position(connection, "classes")
            cursor = connection.execute(
                "INSERT INTO classes(name, description, position) VALUES (?, ?, ?)",
                (name, description, position),
            )
            return int(cursor.lastrowid)

    def find_class_by_name(self, name: str) -> Optional[ClassRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, name, description, position FROM classes WHERE name = ?",
                (name,),
            )
            row = cursor.fetchone()
            return ClassRecord(**row) if row else None

    def add_module(self, class_id: int, name: str, description: str = "") -> int:
        with self._connect() as connection:
            position = self._next_position(
                connection, "modules", filter_field="class_id", filter_value=class_id
            )
            cursor = connection.execute(
                "INSERT INTO modules(class_id, name, description, position) VALUES (?, ?, ?, ?)",
                (class_id, name, description, position),
            )
            return int(cursor.lastrowid)

    def find_module_by_name(self, class_id: int, name: str) -> Optional[ModuleRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, class_id, name, description, position FROM modules WHERE class_id = ? AND name = ?",
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
        processed_audio_path: Optional[str] = None,
        slide_path: Optional[str] = None,
        transcript_path: Optional[str] = None,
        notes_path: Optional[str] = None,
        slide_image_dir: Optional[str] = None,
    ) -> int:
        with self._connect() as connection:
            position = self._next_position(
                connection, "lectures", filter_field="module_id", filter_value=module_id
            )
            cursor = connection.execute(
                """
                INSERT INTO lectures(
                    module_id,
                    name,
                    description,
                    position,
                    audio_path,
                    processed_audio_path,
                    slide_path,
                    transcript_path,
                    notes_path,
                    slide_image_dir
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    module_id,
                    name,
                    description,
                    position,
                    audio_path,
                    processed_audio_path,
                    slide_path,
                    transcript_path,
                    notes_path,
                    slide_image_dir,
                ),
            )
            return int(cursor.lastrowid)

    def find_lecture_by_name(self, module_id: int, name: str) -> Optional[LectureRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                SELECT
                    id,
                    module_id,
                    name,
                    description,
                    position,
                    audio_path,
                    processed_audio_path,
                    slide_path,
                    transcript_path,
                    notes_path,
                    slide_image_dir
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
            cursor = connection.execute(
                "SELECT id, name, description, position FROM classes ORDER BY position, id"
            )
            for row in cursor.fetchall():
                yield ClassRecord(**row)

    def iter_modules(self, class_id: int) -> Iterable[ModuleRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                SELECT id, class_id, name, description, position
                FROM modules
                WHERE class_id = ?
                ORDER BY position, id
                """,
                (class_id,),
            )
            for row in cursor.fetchall():
                yield ModuleRecord(**row)

    def iter_lectures(self, module_id: int) -> Iterable[LectureRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                SELECT
                    id,
                    module_id,
                    name,
                    description,
                    position,
                    audio_path,
                    processed_audio_path,
                    slide_path,
                    transcript_path,
                    notes_path,
                    slide_image_dir
                FROM lectures
                WHERE module_id = ?
                ORDER BY position, id
                """,
                (module_id,),
            )
            for row in cursor.fetchall():
                yield LectureRecord(**row)

    def get_class(self, class_id: int) -> Optional[ClassRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, name, description, position FROM classes WHERE id = ?",
                (class_id,),
            )
            row = cursor.fetchone()
            return ClassRecord(**row) if row else None

    def get_module(self, module_id: int) -> Optional[ModuleRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, class_id, name, description, position FROM modules WHERE id = ?",
                (module_id,),
            )
            row = cursor.fetchone()
            return ModuleRecord(**row) if row else None

    def get_lecture(self, lecture_id: int) -> Optional[LectureRecord]:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                SELECT
                    id,
                    module_id,
                    name,
                    description,
                    position,
                    audio_path,
                    processed_audio_path,
                    slide_path,
                    transcript_path,
                    notes_path,
                    slide_image_dir
                FROM lectures WHERE id = ?
                """,
                (lecture_id,),
            )
            row = cursor.fetchone()
            return LectureRecord(**row) if row else None

    def update_lecture(
        self,
        lecture_id: int,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        module_id: Optional[int] = None,
    ) -> None:
        current = self.get_lecture(lecture_id)
        if current is None:
            return

        assignments: List[str] = []
        params: List[object] = []

        if name is not None:
            assignments.append("name = ?")
            params.append(name)
        if description is not None:
            assignments.append("description = ?")
            params.append(description)

        with self._connect() as connection:
            if module_id is not None and module_id != current.module_id:
                assignments.append("module_id = ?")
                params.append(module_id)
                new_position = self._next_position(
                    connection, "lectures", filter_field="module_id", filter_value=module_id
                )
                assignments.append("position = ?")
                params.append(new_position)
            elif module_id is not None:
                assignments.append("module_id = ?")
                params.append(module_id)

            if not assignments:
                return

            params.append(lecture_id)
            query = "UPDATE lectures SET " + ", ".join(assignments) + " WHERE id = ?"
            connection.execute(query, params)

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
        audio_path: Optional[str] | object = _MISSING,
        processed_audio_path: Optional[str] | object = _MISSING,
        slide_path: Optional[str] | object = _MISSING,
        transcript_path: Optional[str] | object = _MISSING,
        notes_path: Optional[str] | object = _MISSING,
        slide_image_dir: Optional[str] | object = _MISSING,
    ) -> None:
        """Update asset paths for a lecture.

        Only provided values are updated; omitted ones are left untouched.
        """

        assignments: List[str] = []
        params: List[Optional[str]] = []
        if audio_path is not _MISSING:
            assignments.append("audio_path = ?")
            params.append(audio_path)
        if processed_audio_path is not _MISSING:
            assignments.append("processed_audio_path = ?")
            params.append(processed_audio_path)
        if slide_path is not _MISSING:
            assignments.append("slide_path = ?")
            params.append(slide_path)
        if transcript_path is not _MISSING:
            assignments.append("transcript_path = ?")
            params.append(transcript_path)
        if notes_path is not _MISSING:
            assignments.append("notes_path = ?")
            params.append(notes_path)
        if slide_image_dir is not _MISSING:
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

    def reorder_lectures(self, module_orders: Dict[int, List[int]]) -> None:
        if not module_orders:
            return
        with self._connect() as connection:
            cursor = connection.cursor()
            for module_id, lecture_ids in module_orders.items():
                for index, lecture_id in enumerate(lecture_ids):
                    cursor.execute(
                        "UPDATE lectures SET module_id = ?, position = ? WHERE id = ?",
                        (module_id, index, lecture_id),
                    )


__all__ = [
    "ClassRecord",
    "ModuleRecord",
    "LectureRecord",
    "LectureRepository",
]
