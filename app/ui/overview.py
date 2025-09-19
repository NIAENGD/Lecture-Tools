"""Shared helpers for building overview snapshots of stored lectures."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from ..services.storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord


ASSET_LABELS: Dict[str, str] = {
    "audio": "🎧 Audio",
    "slides": "📑 Slides",
    "transcript": "📝 Transcript",
    "notes": "📄 Notes",
    "slide_images": "🖼️ Slide Images",
}


@dataclass
class LectureOverview:
    record: LectureRecord
    assets: List[str]


@dataclass
class ModuleOverview:
    record: ModuleRecord
    lectures: List[LectureOverview]


@dataclass
class ClassOverview:
    record: ClassRecord
    modules: List[ModuleOverview]


@dataclass
class OverviewSnapshot:
    classes: List[ClassOverview]
    class_count: int
    module_count: int
    lecture_count: int
    asset_totals: Dict[str, int]


def collect_overview(repository: LectureRepository) -> OverviewSnapshot:
    """Aggregate repository data into a convenient snapshot for UIs."""

    classes: List[ClassOverview] = []
    module_count = 0
    lecture_count = 0
    asset_totals = {key: 0 for key in ASSET_LABELS.keys()}

    for class_record in repository.iter_classes():
        modules: List[ModuleOverview] = []
        for module_record in repository.iter_modules(class_record.id):
            module_count += 1
            lectures: List[LectureOverview] = []
            for lecture_record in repository.iter_lectures(module_record.id):
                lecture_count += 1
                assets = _extract_assets(lecture_record, asset_totals)
                lectures.append(LectureOverview(record=lecture_record, assets=assets))

            modules.append(ModuleOverview(record=module_record, lectures=lectures))

        classes.append(ClassOverview(record=class_record, modules=modules))

    return OverviewSnapshot(
        classes=classes,
        class_count=len(classes),
        module_count=module_count,
        lecture_count=lecture_count,
        asset_totals=asset_totals,
    )


def _extract_assets(
    lecture_record: LectureRecord, asset_totals: Dict[str, int]
) -> List[str]:
    assets: List[str] = []

    if lecture_record.audio_path:
        assets.append(ASSET_LABELS["audio"])
        asset_totals["audio"] += 1
    if lecture_record.slide_path:
        assets.append(ASSET_LABELS["slides"])
        asset_totals["slides"] += 1
    if lecture_record.transcript_path:
        assets.append(ASSET_LABELS["transcript"])
        asset_totals["transcript"] += 1
    if lecture_record.notes_path:
        assets.append(ASSET_LABELS["notes"])
        asset_totals["notes"] += 1
    if lecture_record.slide_image_dir:
        assets.append(ASSET_LABELS["slide_images"])
        asset_totals["slide_images"] += 1

    return assets


__all__ = [
    "ASSET_LABELS",
    "LectureOverview",
    "ModuleOverview",
    "ClassOverview",
    "OverviewSnapshot",
    "collect_overview",
]
