"""A Rich-powered console front-end for navigating stored lectures."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from rich import box
from rich.columns import Columns
from rich.console import Console, Group
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text
from rich.tree import Tree

from ..services.storage import (
    ClassRecord,
    LectureRecord,
    LectureRepository,
    ModuleRecord,
)


ASSET_LABELS: Dict[str, str] = {
    "audio": "🎧 Audio",
    "slides": "📑 Slides",
    "transcript": "📝 Transcript",
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


class ModernUI:
    """Render a modernised overview using Rich widgets."""

    def __init__(self, repository: LectureRepository, *, console: Optional[Console] = None) -> None:
        self._repository = repository
        self._console = console or Console()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def run(self) -> None:
        snapshot = self._collect_snapshot()
        console = self._console

        console.clear()
        console.rule("[bold magenta]Lecture Tools Overview")

        if snapshot.class_count == 0:
            console.print(
                Panel(
                    "No classes have been ingested yet.\n"
                    "Use [bold]python run.py ingest[/bold] to add your first lecture.",
                    border_style="yellow",
                    box=box.ROUNDED,
                )
            )
            return

        tree_panel = Panel(
            self._build_tree(snapshot.classes),
            title="Curriculum",
            border_style="cyan",
            box=box.ROUNDED,
        )
        stats_panel = self._build_stats_panel(snapshot)

        console.print(Columns([tree_panel, stats_panel], expand=True, equal=True))
        console.print()
        console.print(
            Text(
                "Tip: pass [bold]--style console[/bold] for the legacy layout.",
                style="dim",
            ),
            justify="center",
        )

    # ------------------------------------------------------------------
    # Rendering helpers
    # ------------------------------------------------------------------
    def _build_tree(self, classes: Iterable[ClassOverview]) -> Tree:
        tree = Tree("[bold cyan]Classes", guide_style="cyan")

        for class_overview in classes:
            class_node = tree.add(self._build_class_label(class_overview.record))
            if not class_overview.modules:
                class_node.add("[dim]No modules yet")
                continue

            for module_overview in class_overview.modules:
                module_node = class_node.add(self._build_module_label(module_overview.record))
                if not module_overview.lectures:
                    module_node.add("[dim]No lectures yet")
                    continue

                for lecture_overview in module_overview.lectures:
                    module_node.add(self._build_lecture_label(lecture_overview))

        return tree

    @staticmethod
    def _build_class_label(class_record: ClassRecord) -> Text:
        label = Text(class_record.name, style="bold")
        if class_record.description:
            label.append("\n")
            label.append(class_record.description, style="dim")
        return label

    @staticmethod
    def _build_module_label(module_record: ModuleRecord) -> Text:
        label = Text(module_record.name, style="bright_cyan")
        if module_record.description:
            label.append("\n")
            label.append(module_record.description, style="dim")
        return label

    @staticmethod
    def _build_lecture_label(overview: LectureOverview) -> Text:
        record = overview.record
        label = Text(record.name, style="white")

        if overview.assets:
            label.append("  ")
            label.append(" · ".join(overview.assets), style="green")
        else:
            label.append("  ")
            label.append("No assets yet", style="dim")

        if record.description:
            label.append("\n")
            label.append(record.description, style="dim")

        return label

    def _build_stats_panel(self, snapshot: OverviewSnapshot) -> Panel:
        metrics = Table.grid(expand=True, padding=(0, 1))
        metrics.add_column(style="dim")
        metrics.add_column(justify="right", style="bold")
        metrics.add_row("Classes", str(snapshot.class_count))
        metrics.add_row("Modules", str(snapshot.module_count))
        metrics.add_row("Lectures", str(snapshot.lecture_count))

        asset_table = Table.grid(expand=True, padding=(0, 1))
        asset_table.add_column(style="dim")
        asset_table.add_column(justify="right", style="bold")
        for key, label in ASSET_LABELS.items():
            asset_table.add_row(label, str(snapshot.asset_totals.get(key, 0)))

        body = Group(metrics, Rule(style="magenta"), asset_table)
        return Panel(body, title="At a glance", border_style="magenta", box=box.ROUNDED)

    # ------------------------------------------------------------------
    # Data aggregation
    # ------------------------------------------------------------------
    def _collect_snapshot(self) -> OverviewSnapshot:
        classes: List[ClassOverview] = []
        module_count = 0
        lecture_count = 0
        asset_totals = {key: 0 for key in ASSET_LABELS.keys()}

        for class_record in self._repository.iter_classes():
            modules: List[ModuleOverview] = []
            for module_record in self._repository.iter_modules(class_record.id):
                module_count += 1
                lectures: List[LectureOverview] = []
                for lecture_record in self._repository.iter_lectures(module_record.id):
                    lecture_count += 1
                    assets = self._extract_assets(lecture_record, asset_totals)
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

    @staticmethod
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
        if lecture_record.slide_image_dir:
            assets.append(ASSET_LABELS["slide_images"])
            asset_totals["slide_images"] += 1

        return assets


__all__ = ["ModernUI"]
