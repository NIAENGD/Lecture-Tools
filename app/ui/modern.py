"""A Rich-powered console front-end for navigating stored lectures."""

from __future__ import annotations

from typing import Iterable, Optional

from rich import box
from rich.columns import Columns
from rich.console import Console, Group
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text
from rich.tree import Tree

from ..services.storage import ClassRecord, LectureRepository, ModuleRecord
from .overview import (
    ASSET_LABELS,
    ClassOverview,
    LectureOverview,
    ModuleOverview,
    OverviewSnapshot,
    collect_overview,
)


class ModernUI:
    """Render a modernised overview using Rich widgets."""

    def __init__(self, repository: LectureRepository, *, console: Optional[Console] = None) -> None:
        self._repository = repository
        self._console = console or Console()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def run(self) -> None:
        snapshot = collect_overview(self._repository)
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

__all__ = ["ModernUI"]
