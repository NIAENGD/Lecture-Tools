"""Temporary console user interface until a graphical frontend is implemented."""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Iterable

from ..services.storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord


@dataclass
class ConsoleSection:
    title: str
    entries: Iterable[str]


class ConsoleUI:
    """Minimal console UI that surfaces stored metadata."""

    def __init__(self, repository: LectureRepository) -> None:
        self._repository = repository

    def run(self) -> None:
        """Render the current class/module/lecture hierarchy to stdout."""

        print("Lecture Tools – Console Overview")
        print("=" * 40)
        for section in self._build_sections():
            print(section.title)
            print("-" * len(section.title))
            has_entries = False
            for entry in section.entries:
                has_entries = True
                print(entry)
            if not has_entries:
                print("(empty)")
            print()

    def _build_sections(self) -> Iterable[ConsoleSection]:
        for class_record in self._repository.iter_classes():
            yield ConsoleSection(
                title=f"Class: {class_record.name}",
                entries=self._format_modules(class_record),
            )

    def _format_modules(self, class_record: ClassRecord) -> Iterable[str]:
        modules = list(self._repository.iter_modules(class_record.id))
        if not modules:
            yield "  No modules registered"
            return

        for module_record in modules:
            yield from self._format_module_details(module_record)

    def _format_module_details(self, module_record: ModuleRecord) -> Iterable[str]:
        lectures = list(self._repository.iter_lectures(module_record.id))
        header = f"  Module: {module_record.name}"
        if not lectures:
            yield f"{header} (no lectures)"
            return

        yield header
        for lecture in lectures:
            yield f"    Lecture: {lecture.name}" + self._format_lecture_meta(lecture)

    @staticmethod
    def _format_lecture_meta(lecture: LectureRecord) -> str:
        parts = []
        if lecture.audio_path:
            parts.append("audio")
        if lecture.slide_path:
            parts.append("slides")
        if lecture.transcript_path:
            parts.append("transcript")
        if lecture.slide_image_dir:
            parts.append("slide images")

        if not parts:
            return ""
        return " (" + ", ".join(parts) + ")"


__all__ = ["ConsoleUI"]
