"""Tkinter-powered desktop interface for browsing stored lectures."""

from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk
from typing import Dict, Tuple

from ..services.storage import LectureRepository
from .overview import (
    ASSET_LABELS,
    ClassOverview,
    LectureOverview,
    ModuleOverview,
    OverviewSnapshot,
    collect_overview,
)


class DesktopUI:
    """Create a modern-looking desktop window for the lecture overview."""

    def __init__(self, repository: LectureRepository) -> None:
        self._repository = repository
        self._tree: ttk.Treeview | None = None
        self._root: tk.Tk | None = None
        self._tree_items: Dict[str, Tuple[str, object]] = {}
        self._asset_container: ttk.Frame | None = None

        self._title_var = tk.StringVar(value="Browse your classes")
        self._subtitle_var = tk.StringVar(value="Select a class, module, or lecture to see details.")
        self._description_var = tk.StringVar(value="")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def run(self) -> None:
        snapshot = collect_overview(self._repository)

        if snapshot.class_count == 0:
            root = tk.Tk()
            root.withdraw()
            messagebox.showinfo(
                "Lecture Tools",
                (
                    "No classes have been ingested yet.\n\n"
                    "Use 'python run.py ingest' to add your first lecture."
                ),
            )
            root.destroy()
            return

        self._root = root = tk.Tk()
        root.title("Lecture Tools Overview")
        root.geometry("1100x700")
        root.minsize(900, 600)

        style = ttk.Style(root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        self._configure_styles(style)

        container = ttk.Frame(root, padding=24, style="Main.TFrame")
        container.pack(fill=tk.BOTH, expand=True)

        self._build_stats(container, snapshot)
        self._build_content(container, snapshot)
        self._build_status(container)

        root.mainloop()

    # ------------------------------------------------------------------
    # Layout helpers
    # ------------------------------------------------------------------
    def _configure_styles(self, style: ttk.Style) -> None:
        background = "#0f172a"
        surface = "#1f2937"
        accent = "#38bdf8"
        subtle = "#94a3b8"
        text = "#f8fafc"

        style.configure("Main.TFrame", background=background)
        style.configure("Stats.TFrame", background=background)
        style.configure("Card.TFrame", background=surface, relief="flat")
        style.configure("CardTitle.TLabel", background=surface, foreground=subtle, font=("Segoe UI", 11))
        style.configure(
            "CardValue.TLabel",
            background=surface,
            foreground=text,
            font=("Segoe UI", 20, "bold"),
        )
        style.configure("Content.TFrame", background=background)
        style.configure("Panel.TFrame", background=surface)
        style.configure("PanelHeading.TLabel", background=surface, foreground=text, font=("Segoe UI", 14, "bold"))
        style.configure("PanelBody.TFrame", background=surface)
        style.configure("DetailTitle.TLabel", background=surface, foreground=text, font=("Segoe UI", 18, "bold"))
        style.configure("DetailSubtitle.TLabel", background=surface, foreground=subtle, font=("Segoe UI", 12))
        style.configure("DetailText.TLabel", background=surface, foreground=text, font=("Segoe UI", 11), wraplength=420)

        style.configure(
            "Treeview",
            background=surface,
            fieldbackground=surface,
            foreground=text,
            rowheight=28,
            font=("Segoe UI", 11),
        )
        style.configure(
            "Treeview.Heading", background=surface, foreground=subtle, font=("Segoe UI", 11, "bold")
        )
        style.map("Treeview", background=[("selected", accent)], foreground=[("selected", background)])
        style.map("Treeview.Heading", relief=[("active", "flat"), ("pressed", "flat")])

    def _build_stats(self, container: ttk.Frame, snapshot: OverviewSnapshot) -> None:
        stats_frame = ttk.Frame(container, style="Stats.TFrame")
        stats_frame.pack(fill=tk.X, pady=(0, 24))
        stats_frame.columnconfigure((0, 1, 2, 3), weight=1)

        metrics = [
            ("Classes", snapshot.class_count),
            ("Modules", snapshot.module_count),
            ("Lectures", snapshot.lecture_count),
        ]

        for index, (label, value) in enumerate(metrics):
            card = ttk.Frame(stats_frame, padding=18, style="Card.TFrame")
            card.grid(row=0, column=index, sticky="nsew", padx=(0, 18 if index < len(metrics) - 1 else 0))
            ttk.Label(card, text=label, style="CardTitle.TLabel").pack(anchor="w")
            ttk.Label(card, text=str(value), style="CardValue.TLabel").pack(anchor="w", pady=(8, 0))

        asset_card = ttk.Frame(stats_frame, padding=18, style="Card.TFrame")
        asset_card.grid(row=0, column=len(metrics), sticky="nsew")
        ttk.Label(asset_card, text="Assets", style="CardTitle.TLabel").pack(anchor="w")
        asset_texts = [
            f"{ASSET_LABELS[key]}: {snapshot.asset_totals.get(key, 0)}"
            for key in ("audio", "slides", "transcript", "slide_images")
        ]
        ttk.Label(
            asset_card,
            text="\n".join(asset_texts),
            style="DetailText.TLabel",
        ).pack(anchor="w", pady=(8, 0))

    def _build_content(self, container: ttk.Frame, snapshot: OverviewSnapshot) -> None:
        paned = ttk.Panedwindow(container, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)

        tree_panel = ttk.Frame(paned, style="Panel.TFrame", padding=18)
        detail_panel = ttk.Frame(paned, style="Panel.TFrame", padding=24)

        paned.add(tree_panel, weight=2)
        paned.add(detail_panel, weight=3)

        ttk.Label(tree_panel, text="Curriculum", style="PanelHeading.TLabel").pack(anchor="w", pady=(0, 12))
        self._tree = tree = ttk.Treeview(tree_panel, show="tree", selectmode="browse")
        tree.pack(fill=tk.BOTH, expand=True)
        tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        self._populate_tree(tree, snapshot)

        ttk.Label(detail_panel, textvariable=self._title_var, style="DetailTitle.TLabel").pack(anchor="w")
        ttk.Label(detail_panel, textvariable=self._subtitle_var, style="DetailSubtitle.TLabel").pack(
            anchor="w", pady=(6, 16)
        )
        ttk.Label(detail_panel, textvariable=self._description_var, style="DetailText.TLabel", justify="left").pack(
            anchor="w",
            fill=tk.X,
        )

        self._asset_container = ttk.Frame(detail_panel, style="PanelBody.TFrame")
        self._asset_container.pack(anchor="w", fill=tk.X, pady=(16, 0))

    def _build_status(self, container: ttk.Frame) -> None:
        status = ttk.Label(
            container,
            text="Tip: use the tree to explore classes, modules, and lectures.",
            style="DetailSubtitle.TLabel",
            anchor="w",
        )
        status.pack(fill=tk.X, pady=(24, 0))

    # ------------------------------------------------------------------
    # Tree population and selection
    # ------------------------------------------------------------------
    def _populate_tree(self, tree: ttk.Treeview, snapshot: OverviewSnapshot) -> None:
        tree.delete(*tree.get_children())
        self._tree_items.clear()

        for class_overview in snapshot.classes:
            class_id = tree.insert("", "end", text=class_overview.record.name, open=True)
            self._tree_items[class_id] = ("class", class_overview)

            if not class_overview.modules:
                empty_id = tree.insert(class_id, "end", text="No modules yet")
                self._tree_items[empty_id] = ("empty", None)
                tree.item(empty_id, open=False)
                continue

            for module_overview in class_overview.modules:
                module_id = tree.insert(class_id, "end", text=module_overview.record.name, open=False)
                self._tree_items[module_id] = ("module", module_overview)

                if not module_overview.lectures:
                    empty_id = tree.insert(module_id, "end", text="No lectures yet")
                    self._tree_items[empty_id] = ("empty", None)
                    continue

                for lecture_overview in module_overview.lectures:
                    lecture_id = tree.insert(module_id, "end", text=lecture_overview.record.name, open=False)
                    self._tree_items[lecture_id] = ("lecture", lecture_overview)

        first_item = tree.get_children()
        if first_item:
            tree.selection_set(first_item[0])
            tree.focus(first_item[0])
            self._on_tree_select()

    def _on_tree_select(self, event: tk.Event | None = None) -> None:
        if not self._tree:
            return

        selection = self._tree.selection()
        if not selection:
            return

        item_id = selection[0]
        kind, payload = self._tree_items.get(item_id, ("empty", None))

        if kind == "class":
            self._show_class_details(payload)
        elif kind == "module":
            self._show_module_details(payload)
        elif kind == "lecture":
            self._show_lecture_details(payload)
        else:
            self._title_var.set("Nothing to show")
            self._subtitle_var.set("")
            self._description_var.set("This section is waiting for new content.")
            self._render_assets([])

    # ------------------------------------------------------------------
    # Detail rendering
    # ------------------------------------------------------------------
    def _show_class_details(self, overview: ClassOverview) -> None:
        modules = len(overview.modules)
        lectures = sum(len(module.lectures) for module in overview.modules)
        self._title_var.set(overview.record.name)
        self._subtitle_var.set(f"Class · {modules} modules · {lectures} lectures")
        self._description_var.set(overview.record.description or "No description provided yet.")
        self._render_assets([])

    def _show_module_details(self, overview: ModuleOverview) -> None:
        lectures = len(overview.lectures)
        self._title_var.set(overview.record.name)
        self._subtitle_var.set(f"Module · {lectures} lectures")
        self._description_var.set(overview.record.description or "No description provided yet.")
        self._render_assets([])

    def _show_lecture_details(self, overview: LectureOverview) -> None:
        self._title_var.set(overview.record.name)
        self._subtitle_var.set("Lecture")
        self._description_var.set(overview.record.description or "No description provided yet.")
        self._render_assets(overview.assets)

    def _render_assets(self, assets: list[str]) -> None:
        if not self._asset_container:
            return

        for child in self._asset_container.winfo_children():
            child.destroy()

        if not assets:
            ttk.Label(
                self._asset_container,
                text="No digital assets linked yet.",
                style="DetailSubtitle.TLabel",
            ).pack(anchor="w")
            return

        ttk.Label(self._asset_container, text="Available assets", style="PanelHeading.TLabel").pack(anchor="w")

        for asset in assets:
            bubble = ttk.Label(
                self._asset_container,
                text=asset,
                style="DetailText.TLabel",
            )
            bubble.pack(anchor="w", pady=4)


__all__ = ["DesktopUI"]
