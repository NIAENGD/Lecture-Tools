"""Persistence helpers backed by SQLite."""

from __future__ import annotations

import contextlib
import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

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

    def __init__(
        self,
        config: AppConfig,
        *,
        event_emitter: Optional[Callable[..., None]] = None,
    ) -> None:
        self._db_path = config.database_file
        self._event_emitter: Optional[Callable[..., None]] = event_emitter

    def configure_event_emitter(self, emitter: Optional[Callable[..., None]]) -> None:
        """Register the callable responsible for emitting debug events."""

        self._event_emitter = emitter

    @contextlib.contextmanager
    def _track_db_event(self, action: str, **payload: Any):
        """Emit a structured debug event capturing execution time for a DB action."""

        if self._event_emitter is None:
            yield payload
            return

        start = time.perf_counter()
        event_payload: Dict[str, Any] = dict(payload)
        try:
            yield event_payload
        finally:
            duration_ms = (time.perf_counter() - start) * 1000.0
            filtered = {key: value for key, value in event_payload.items() if value is not None}
            try:
                self._event_emitter(
                    "DB_QUERY",
                    action,
                    payload=filtered,
                    duration_ms=duration_ms,
                )
            except TypeError:
                # Backwards compatibility for emitters that only accept positional arguments.
                self._event_emitter("DB_QUERY", action)  # type: ignore[misc]

    def _connect(self) -> sqlite3.Connection:
        LOGGER.debug("Opening SQLite connection to %s", self._db_path)
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
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
        description_length = len(description or "")
        LOGGER.debug(
            "Adding class '%s' (description length=%s)",
            name,
            description_length,
        )
        with self._track_db_event(
            "add_class",
            table="classes",
            name=name,
            description_length=description_length,
        ) as event:
            with self._connect() as connection:
                position = self._next_position(connection, "classes")
                cursor = connection.execute(
                    "INSERT INTO classes(name, description, position) VALUES (?, ?, ?)",
                    (name, description, position),
                )
                event.update({
                    "class_id": int(cursor.lastrowid),
                    "position": position,
                })
                LOGGER.debug(
                    "Class '%s' inserted with id=%s at position=%s",
                    name,
                    cursor.lastrowid,
                    position,
                )
                return int(cursor.lastrowid)

    def find_class_by_name(self, name: str) -> Optional[ClassRecord]:
        LOGGER.debug("Looking up class by name '%s'", name)
        with self._track_db_event("find_class_by_name", table="classes", name=name) as event:
            with self._connect() as connection:
                cursor = connection.execute(
                    "SELECT id, name, description, position FROM classes WHERE name = ?",
                    (name,),
                )
                row = cursor.fetchone()
                found = bool(row)
                event.update({"found": found, "class_id": int(row["id"]) if found else None})
                if row:
                    LOGGER.debug("Class '%s' resolved to id=%s", name, row["id"])
                else:
                    LOGGER.debug("Class '%s' not found", name)
                return ClassRecord(**row) if row else None

    def add_module(self, class_id: int, name: str, description: str = "") -> int:
        description_length = len(description or "")
        LOGGER.debug(
            "Adding module '%s' for class_id=%s (description length=%s)",
            name,
            class_id,
            description_length,
        )
        with self._track_db_event(
            "add_module",
            table="modules",
            class_id=class_id,
            name=name,
            description_length=description_length,
        ) as event:
            with self._connect() as connection:
                position = self._next_position(
                    connection, "modules", filter_field="class_id", filter_value=class_id
                )
                cursor = connection.execute(
                    "INSERT INTO modules(class_id, name, description, position) VALUES (?, ?, ?, ?)",
                    (class_id, name, description, position),
                )
                event.update({
                    "module_id": int(cursor.lastrowid),
                    "position": position,
                })
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
        with self._track_db_event(
            "find_module_by_name",
            table="modules",
            class_id=class_id,
            name=name,
        ) as event:
            with self._connect() as connection:
                cursor = connection.execute(
                    "SELECT id, class_id, name, description, position FROM modules WHERE class_id = ? AND name = ?",
                    (class_id, name),
                )
                row = cursor.fetchone()
                found = bool(row)
                event.update({"found": found, "module_id": int(row["id"]) if found else None})
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
        description_length = len(description or "")
        LOGGER.debug(
            "Adding lecture '%s' to module_id=%s (description length=%s)",
            name,
            module_id,
            description_length,
        )
        with self._track_db_event(
            "add_lecture",
            table="lectures",
            module_id=module_id,
            name=name,
            description_length=description_length,
            has_audio=bool(audio_path),
            has_processed_audio=bool(processed_audio_path),
            has_slide=bool(slide_path),
            has_transcript=bool(transcript_path),
            has_notes=bool(notes_path),
            has_slide_images=bool(slide_image_dir),
        ) as event:
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
                event.update({
                    "lecture_id": int(cursor.lastrowid),
                    "position": position,
                })
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
        with self._track_db_event(
            "find_lecture_by_name",
            table="lectures",
            module_id=module_id,
            name=name,
        ) as event:
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
                found = bool(row)
                event.update({"found": found, "lecture_id": int(row["id"]) if found else None})
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
        with self._track_db_event("iter_classes", table="classes") as event:
            with self._connect() as connection:
                cursor = connection.execute(
                    "SELECT id, name, description, position FROM classes ORDER BY position, id"
                )
                count = 0
                for row in cursor.fetchall():
                    record = ClassRecord(**row)
                    count += 1
                    LOGGER.debug(
                        "Yielding class id=%s name='%s' position=%s",
                        record.id,
                        record.name,
                        record.position,
                    )
                    yield record
                event["rowcount"] = count

    def iter_modules(self, class_id: int) -> Iterable[ModuleRecord]:
        LOGGER.debug("Iterating modules for class_id=%s", class_id)
        with self._track_db_event("iter_modules", table="modules", class_id=class_id) as event:
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
                count = 0
                for row in cursor.fetchall():
                    record = ModuleRecord(**row)
                    count += 1
                    LOGGER.debug(
                        "Yielding module id=%s name='%s' class_id=%s position=%s",
                        record.id,
                        record.name,
                        record.class_id,
                        record.position,
                    )
                    yield record
                event["rowcount"] = count

    def iter_lectures(self, module_id: int) -> Iterable[LectureRecord]:
        LOGGER.debug("Iterating lectures for module_id=%s", module_id)
        with self._track_db_event(
            "iter_lectures", table="lectures", module_id=module_id
        ) as event:
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
                count = 0
                for row in cursor.fetchall():
                    record = LectureRecord(**row)
                    count += 1
                    LOGGER.debug(
                        "Yielding lecture id=%s name='%s' module_id=%s position=%s",
                        record.id,
                        record.name,
                        record.module_id,
                        record.position,
                    )
                    yield record
                event["rowcount"] = count

    def get_class(self, class_id: int) -> Optional[ClassRecord]:
        LOGGER.debug("Fetching class id=%s", class_id)
        with self._track_db_event("get_class", table="classes", class_id=class_id) as event:
            with self._connect() as connection:
                cursor = connection.execute(
                    "SELECT id, name, description, position FROM classes WHERE id = ?",
                    (class_id,),
                )
                row = cursor.fetchone()
                found = bool(row)
                event.update({"found": found})
                if row:
                    LOGGER.debug("Class id=%s resolved to name='%s'", class_id, row["name"])
                else:
                    LOGGER.debug("Class id=%s not found", class_id)
                return ClassRecord(**row) if row else None

    def get_module(self, module_id: int) -> Optional[ModuleRecord]:
        LOGGER.debug("Fetching module id=%s", module_id)
        with self._track_db_event("get_module", table="modules", module_id=module_id) as event:
            with self._connect() as connection:
                cursor = connection.execute(
                    "SELECT id, class_id, name, description, position FROM modules WHERE id = ?",
                    (module_id,),
                )
                row = cursor.fetchone()
                found = bool(row)
                event.update({"found": found, "class_id": row["class_id"] if row else None})
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
        with self._track_db_event("get_lecture", table="lectures", lecture_id=lecture_id) as event:
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
                found = bool(row)
                event.update({"found": found, "module_id": row["module_id"] if row else None})
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
        with self._track_db_event("update_lecture", lecture_id=lecture_id) as event:
            current = self.get_lecture(lecture_id)
            if current is None:
                LOGGER.debug("Skipping update for missing lecture id=%s", lecture_id)
                event["result"] = "missing"
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
                    event["new_position"] = new_position
                elif module_id is not None:
                    assignments.append("module_id = ?")
                    params.append(module_id)

                if not assignments:
                    LOGGER.debug("No changes requested for lecture id=%s", lecture_id)
                    event["result"] = "no_changes"
                    return

                params.append(lecture_id)
                query = "UPDATE lectures SET " + ", ".join(assignments) + " WHERE id = ?"
                connection.execute(query, params)
                LOGGER.debug(
                    "Lecture id=%s updated with assignments=%s", lecture_id, assignments
                )
                event.update({
                    "result": "updated",
                    "fields_changed": len(assignments),
                })

    def update_lecture_description(self, lecture_id: int, description: str) -> None:
        description_length = len(description)
        LOGGER.debug(
            "Updating lecture id=%s description (length=%s)", lecture_id, description_length
        )
        with self._track_db_event(
            "update_lecture_description",
            lecture_id=lecture_id,
            description_length=description_length,
        ) as event:
            with self._connect() as connection:
                connection.execute(
                    "UPDATE lectures SET description = ? WHERE id = ?",
                    (description, lecture_id),
                )
                LOGGER.debug("Lecture id=%s description updated", lecture_id)
                event["result"] = "updated"

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
        asset_flags: Dict[str, bool] = {}
        if audio_path is not _MISSING:
            assignments.append("audio_path = ?")
            params.append(audio_path)
            asset_flags["audio_path"] = bool(audio_path)
        if processed_audio_path is not _MISSING:
            assignments.append("processed_audio_path = ?")
            params.append(processed_audio_path)
            asset_flags["processed_audio_path"] = bool(processed_audio_path)
        if slide_path is not _MISSING:
            assignments.append("slide_path = ?")
            params.append(slide_path)
            asset_flags["slide_path"] = bool(slide_path)
        if transcript_path is not _MISSING:
            assignments.append("transcript_path = ?")
            params.append(transcript_path)
            asset_flags["transcript_path"] = bool(transcript_path)
        if notes_path is not _MISSING:
            assignments.append("notes_path = ?")
            params.append(notes_path)
            asset_flags["notes_path"] = bool(notes_path)
        if slide_image_dir is not _MISSING:
            assignments.append("slide_image_dir = ?")
            params.append(slide_image_dir)
            asset_flags["slide_image_dir"] = bool(slide_image_dir)

        if not assignments:
            LOGGER.debug("No asset updates provided for lecture id=%s", lecture_id)
            with self._track_db_event(
                "update_lecture_assets", lecture_id=lecture_id, changes=0
            ) as event:
                event["result"] = "no_changes"
            return

        params.append(lecture_id)
        query = "UPDATE lectures SET " + ", ".join(assignments) + " WHERE id = ?"
        with self._track_db_event(
            "update_lecture_assets", lecture_id=lecture_id, changes=len(assignments), **asset_flags
        ) as event:
            with self._connect() as connection:
                connection.execute(query, params)
                LOGGER.debug(
                    "Lecture id=%s asset paths updated (%s)",
                    lecture_id,
                    ", ".join(assignments),
                )
                event["result"] = "updated"

    def remove_class(self, class_id: int) -> None:
        LOGGER.debug("Removing class id=%s", class_id)
        with self._track_db_event("remove_class", table="classes", class_id=class_id) as event:
            with self._connect() as connection:
                connection.execute("DELETE FROM classes WHERE id = ?", (class_id,))
                LOGGER.debug("Class id=%s removed", class_id)
                event["result"] = "deleted"

    def remove_module(self, module_id: int) -> None:
        LOGGER.debug("Removing module id=%s", module_id)
        with self._track_db_event("remove_module", table="modules", module_id=module_id) as event:
            with self._connect() as connection:
                connection.execute("DELETE FROM modules WHERE id = ?", (module_id,))
                LOGGER.debug("Module id=%s removed", module_id)
                event["result"] = "deleted"

    def remove_lecture(self, lecture_id: int) -> None:
        LOGGER.debug("Removing lecture id=%s", lecture_id)
        with self._track_db_event("remove_lecture", table="lectures", lecture_id=lecture_id) as event:
            with self._connect() as connection:
                connection.execute("DELETE FROM lectures WHERE id = ?", (lecture_id,))
                LOGGER.debug("Lecture id=%s removed", lecture_id)
                event["result"] = "deleted"

    def reorder_lectures(self, module_orders: Dict[int, List[int]]) -> None:
        if not module_orders:
            LOGGER.debug("No lecture reordering requested")
            with self._track_db_event("reorder_lectures", changes=0) as event:
                event["result"] = "no_changes"
            return
        total_updates = sum(len(ids) for ids in module_orders.values())
        with self._track_db_event(
            "reorder_lectures", modules=len(module_orders), changes=total_updates
        ) as event:
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
            event["result"] = "reordered"


__all__ = [
    "ClassRecord",
    "ModuleRecord",
    "LectureRecord",
    "LectureRepository",
]
