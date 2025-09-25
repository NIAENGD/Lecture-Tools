"""Persistence helpers backed by SQLite."""

from __future__ import annotations

import logging
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


LOGGER = logging.getLogger(__name__)


class LectureRepository:
    """Simple repository exposing CRUD helpers."""

    def __init__(self, config: AppConfig) -> None:
        self._db_path = config.database_file

    def _connect(self) -> sqlite3.Connection:
        LOGGER.debug("Opening SQLite connection to %s", self._db_path)
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        # SQLite requires enabling foreign key enforcement for each
        # connection individually. Without this pragma, cascading deletes
        # defined in the schema are ignored, which prevents removing
        # classes, modules or lectures that still have dependent records.
        # See https://sqlite.org/foreignkeys.html#fk_enable for details.
        connection.execute("PRAGMA foreign_keys = ON")
        LOGGER.debug("SQLite connection ready with foreign_keys pragma enabled")
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
        LOGGER.debug(
            "Computed next position for %s (filter=%s) -> %s",
            table,
            filter_value if filter_field is not None else "<none>",
            next_value,
        )
        return int(next_value or 0)

    # ---------------------------------------------------------------------
    # Creation helpers
    # ---------------------------------------------------------------------
    def add_class(self, name: str, description: str = "") -> int:
        LOGGER.debug(
            "Adding class '%s' (description length=%s)",
            name,
            len(description or ""),
        )
        with self._connect() as connection:
            position = self._next_position(connection, "classes")
            cursor = connection.execute(
                "INSERT INTO classes(name, description, position) VALUES (?, ?, ?)",
                (name, description, position),
            )
            LOGGER.debug(
                "Class '%s' inserted with id=%s at position=%s",
                name,
                cursor.lastrowid,
                position,
            )
            return int(cursor.lastrowid)

    def find_class_by_name(self, name: str) -> Optional[ClassRecord]:
        LOGGER.debug("Looking up class by name '%s'", name)
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, name, description, position FROM classes WHERE name = ?",
                (name,),
            )
            row = cursor.fetchone()
            if row:
                LOGGER.debug("Class '%s' resolved to id=%s", name, row["id"])
            else:
                LOGGER.debug("Class '%s' not found", name)
            return ClassRecord(**row) if row else None

    def add_module(self, class_id: int, name: str, description: str = "") -> int:
        LOGGER.debug(
            "Adding module '%s' for class_id=%s (description length=%s)",
            name,
            class_id,
            len(description or ""),
        )
        with self._connect() as connection:
            position = self._next_position(
                connection, "modules", filter_field="class_id", filter_value=class_id
            )
            cursor = connection.execute(
                "INSERT INTO modules(class_id, name, description, position) VALUES (?, ?, ?, ?)",
                (class_id, name, description, position),
            )
            LOGGER.debug(
                "Module '%s' inserted with id=%s at position=%s for class_id=%s",
                name,
                cursor.lastrowid,
                position,
                class_id,
            )
            return int(cursor.lastrowid)

    def find_module_by_name(self, class_id: int, name: str) -> Optional[ModuleRecord]:
        LOGGER.debug("Looking up module '%s' for class_id=%s", name, class_id)
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, class_id, name, description, position FROM modules WHERE class_id = ? AND name = ?",
                (class_id, name),
            )
            row = cursor.fetchone()
            if row:
                LOGGER.debug(
                    "Module '%s' resolved to id=%s for class_id=%s",
                    name,
                    row["id"],
                    class_id,
                )
            else:
                LOGGER.debug("Module '%s' not found for class_id=%s", name, class_id)
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
        LOGGER.debug(
            "Adding lecture '%s' to module_id=%s (description length=%s)",
            name,
            module_id,
            len(description or ""),
        )
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
            LOGGER.debug(
                "Lecture '%s' inserted with id=%s at position=%s for module_id=%s",
                name,
                cursor.lastrowid,
                position,
                module_id,
            )
            return int(cursor.lastrowid)

    def find_lecture_by_name(self, module_id: int, name: str) -> Optional[LectureRecord]:
        LOGGER.debug("Looking up lecture '%s' for module_id=%s", name, module_id)
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
            if row:
                LOGGER.debug(
                    "Lecture '%s' resolved to id=%s for module_id=%s",
                    name,
                    row["id"],
                    module_id,
                )
            else:
                LOGGER.debug("Lecture '%s' not found for module_id=%s", name, module_id)
            return LectureRecord(**row) if row else None

    # ------------------------------------------------------------------
    # Iteration helpers
    # ------------------------------------------------------------------
    def iter_classes(self) -> Iterable[ClassRecord]:
        LOGGER.debug("Iterating over all classes")
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, name, description, position FROM classes ORDER BY position, id"
            )
            for row in cursor.fetchall():
                record = ClassRecord(**row)
                LOGGER.debug(
                    "Yielding class id=%s name='%s' position=%s",
                    record.id,
                    record.name,
                    record.position,
                )
                yield record

    def iter_modules(self, class_id: int) -> Iterable[ModuleRecord]:
        LOGGER.debug("Iterating modules for class_id=%s", class_id)
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
                record = ModuleRecord(**row)
                LOGGER.debug(
                    "Yielding module id=%s name='%s' class_id=%s position=%s",
                    record.id,
                    record.name,
                    record.class_id,
                    record.position,
                )
                yield record

    def iter_lectures(self, module_id: int) -> Iterable[LectureRecord]:
        LOGGER.debug("Iterating lectures for module_id=%s", module_id)
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
                record = LectureRecord(**row)
                LOGGER.debug(
                    "Yielding lecture id=%s name='%s' module_id=%s position=%s",
                    record.id,
                    record.name,
                    record.module_id,
                    record.position,
                )
                yield record

    def get_class(self, class_id: int) -> Optional[ClassRecord]:
        LOGGER.debug("Fetching class id=%s", class_id)
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, name, description, position FROM classes WHERE id = ?",
                (class_id,),
            )
            row = cursor.fetchone()
            if row:
                LOGGER.debug("Class id=%s resolved to name='%s'", class_id, row["name"])
            else:
                LOGGER.debug("Class id=%s not found", class_id)
            return ClassRecord(**row) if row else None

    def get_module(self, module_id: int) -> Optional[ModuleRecord]:
        LOGGER.debug("Fetching module id=%s", module_id)
        with self._connect() as connection:
            cursor = connection.execute(
                "SELECT id, class_id, name, description, position FROM modules WHERE id = ?",
                (module_id,),
            )
            row = cursor.fetchone()
            if row:
                LOGGER.debug(
                    "Module id=%s resolved to name='%s' (class_id=%s)",
                    module_id,
                    row["name"],
                    row["class_id"],
                )
            else:
                LOGGER.debug("Module id=%s not found", module_id)
            return ModuleRecord(**row) if row else None

    def get_lecture(self, lecture_id: int) -> Optional[LectureRecord]:
        LOGGER.debug("Fetching lecture id=%s", lecture_id)
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
            if row:
                LOGGER.debug(
                    "Lecture id=%s resolved to name='%s' (module_id=%s)",
                    lecture_id,
                    row["name"],
                    row["module_id"],
                )
            else:
                LOGGER.debug("Lecture id=%s not found", lecture_id)
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
            LOGGER.debug("Skipping update for missing lecture id=%s", lecture_id)
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
                LOGGER.debug(
                    "Lecture id=%s moving to module_id=%s at position=%s",
                    lecture_id,
                    module_id,
                    new_position,
                )
            elif module_id is not None:
                assignments.append("module_id = ?")
                params.append(module_id)

            if not assignments:
                LOGGER.debug("No changes requested for lecture id=%s", lecture_id)
                return

            params.append(lecture_id)
            query = "UPDATE lectures SET " + ", ".join(assignments) + " WHERE id = ?"
            connection.execute(query, params)
            LOGGER.debug("Lecture id=%s updated with assignments=%s", lecture_id, assignments)

    def update_lecture_description(self, lecture_id: int, description: str) -> None:
        LOGGER.debug("Updating lecture id=%s description (length=%s)", lecture_id, len(description))
        with self._connect() as connection:
            connection.execute(
                "UPDATE lectures SET description = ? WHERE id = ?",
                (description, lecture_id),
            )
            LOGGER.debug("Lecture id=%s description updated", lecture_id)

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
            LOGGER.debug("No asset updates provided for lecture id=%s", lecture_id)
            return

        params.append(lecture_id)
        query = "UPDATE lectures SET " + ", ".join(assignments) + " WHERE id = ?"
        with self._connect() as connection:
            connection.execute(query, params)
            LOGGER.debug(
                "Lecture id=%s asset paths updated (%s)",
                lecture_id,
                ", ".join(assignments),
            )

    def remove_class(self, class_id: int) -> None:
        LOGGER.debug("Removing class id=%s", class_id)
        with self._connect() as connection:
            connection.execute("DELETE FROM classes WHERE id = ?", (class_id,))
            LOGGER.debug("Class id=%s removed", class_id)

    def remove_module(self, module_id: int) -> None:
        LOGGER.debug("Removing module id=%s", module_id)
        with self._connect() as connection:
            connection.execute("DELETE FROM modules WHERE id = ?", (module_id,))
            LOGGER.debug("Module id=%s removed", module_id)

    def remove_lecture(self, lecture_id: int) -> None:
        LOGGER.debug("Removing lecture id=%s", lecture_id)
        with self._connect() as connection:
            connection.execute("DELETE FROM lectures WHERE id = ?", (lecture_id,))
            LOGGER.debug("Lecture id=%s removed", lecture_id)

    def reorder_lectures(self, module_orders: Dict[int, List[int]]) -> None:
        if not module_orders:
            LOGGER.debug("No lecture reordering requested")
            return
        with self._connect() as connection:
            cursor = connection.cursor()
            for module_id, lecture_ids in module_orders.items():
                LOGGER.debug(
                    "Reordering %d lectures for module_id=%s", len(lecture_ids), module_id
                )
                for index, lecture_id in enumerate(lecture_ids):
                    cursor.execute(
                        "UPDATE lectures SET module_id = ?, position = ? WHERE id = ?",
                        (module_id, index, lecture_id),
                    )
                    LOGGER.debug(
                        "Lecture id=%s assigned to module_id=%s position=%s",
                        lecture_id,
                        module_id,
                        index,
                    )


__all__ = [
    "ClassRecord",
    "ModuleRecord",
    "LectureRecord",
    "LectureRepository",
]
