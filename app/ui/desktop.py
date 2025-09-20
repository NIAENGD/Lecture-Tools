"""Tkinter-powered desktop interface for browsing and managing stored lectures."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import tkinter as tk
import zipfile
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk
from typing import Callable, Dict, List, Optional, Tuple

import threading

from PIL import Image, ImageTk

from ..config import AppConfig
from ..processing import (
    AudioRecorder,
    FasterWhisperTranscription,
    PyMuPDFSlideConverter,
    preprocess_audio,
    save_preprocessed_wav,
)
from ..services.ingestion import LecturePaths
from ..services.naming import build_asset_stem, build_timestamped_name, slugify
from ..services.settings import SettingsStore, ThemeName, UISettings
from ..services.storage import ClassRecord, LectureRecord, LectureRepository, ModuleRecord
from .overview import (
    ASSET_LABELS,
    ClassOverview,
    LectureOverview,
    ModuleOverview,
    OverviewSnapshot,
    collect_overview,
)


Palette = Dict[str, str]


class DesktopUI:
    """Create a polished desktop window for navigating lectures and assets."""

    def __init__(self, repository: LectureRepository, *, config: Optional[AppConfig] = None) -> None:
        self._repository = repository
        self._config = config
        self._tree: ttk.Treeview | None = None
        self._root: tk.Tk | None = None
        self._tree_items: Dict[str, Tuple[str, object | None, ModuleOverview | None, ClassOverview | None]] = {}
        self._asset_container: ttk.Frame | None = None
        self._asset_canvas: tk.Canvas | None = None
        self._asset_window_id: int | None = None

        self._title_var: tk.StringVar | None = None
        self._subtitle_var: tk.StringVar | None = None
        self._description_var: tk.StringVar | None = None
        self._asset_text_var: tk.StringVar | None = None
        self._theme_button_text: tk.StringVar | None = None

        self._stat_vars: dict[str, tk.StringVar] = {}

        self._settings_store: SettingsStore | None = None
        self._settings: UISettings = UISettings()
        self._current_theme: ThemeName = "system"

        if self._config is not None:
            self._settings_store = SettingsStore(self._config)
            self._settings = self._settings_store.load()
            self._current_theme = self._settings.theme

        self._selected_lecture_id: Optional[int] = None
        self._active_class: ClassOverview | None = None
        self._active_module: ModuleOverview | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def run(self) -> None:
        snapshot = collect_overview(self._repository)

        self._root = root = tk.Tk()
        root.title("Lecture Tools Overview")
        root.geometry("1200x760")
        root.minsize(960, 640)

        self._title_var = tk.StringVar(master=root, value="Browse your classes")
        self._subtitle_var = tk.StringVar(
            master=root, value="Select a class, module, or lecture to see details."
        )
        self._description_var = tk.StringVar(master=root, value="")
        self._theme_button_text = tk.StringVar(master=root)

        style = ttk.Style(root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        effective_theme = self._resolve_effective_theme(self._current_theme)
        palette = self._get_palette(effective_theme)
        self._configure_styles(style, palette)
        root.configure(background=palette["background"])

        container = ttk.Frame(root, padding=24, style="Main.TFrame")
        container.pack(fill=tk.BOTH, expand=True)

        self._build_header(container)
        self._build_stats(container, snapshot)
        self._build_content(container, snapshot)
        self._build_status(container)

        self._apply_theme()

        root.mainloop()

    # ------------------------------------------------------------------
    # Layout helpers
    # ------------------------------------------------------------------
    def _configure_styles(self, style: ttk.Style, palette: Palette) -> None:
        background = palette["background"]
        surface = palette["surface"]
        accent = palette["accent"]
        subtle = palette["subtle"]
        text = palette["text"]
        muted = palette["muted"]

        style.configure("Main.TFrame", background=background)
        style.configure("Stats.TFrame", background=background)
        style.configure(
            "Card.TFrame",
            background=surface,
            relief="flat",
            borderwidth=0,
            padding=18,
        )
        style.configure(
            "CardTitle.TLabel",
            background=surface,
            foreground=subtle,
            font=("Segoe UI", 11),
        )
        style.configure(
            "CardValue.TLabel",
            background=surface,
            foreground=text,
            font=("Segoe UI", 22, "bold"),
        )
        style.configure("Content.TFrame", background=background)
        style.configure("Panel.TFrame", background=surface, relief="flat")
        style.configure(
            "PanelHeading.TLabel",
            background=surface,
            foreground=text,
            font=("Segoe UI", 14, "bold"),
        )
        style.configure("PanelBody.TFrame", background=surface)
        style.configure(
            "DetailTitle.TLabel",
            background=surface,
            foreground=text,
            font=("Segoe UI", 20, "bold"),
        )
        style.configure(
            "DetailSubtitle.TLabel",
            background=surface,
            foreground=subtle,
            font=("Segoe UI", 12),
        )
        style.configure(
            "DetailText.TLabel",
            background=surface,
            foreground=text,
            font=("Segoe UI", 11),
            wraplength=440,
            justify="left",
        )
        style.configure(
            "Primary.TButton",
            background=accent,
            foreground=background,
            font=("Segoe UI", 11, "bold"),
            padding=10,
            borderwidth=0,
        )
        style.map(
            "Primary.TButton",
            background=[("active", palette["accent_active"]), ("pressed", palette["accent_pressed"])],
            foreground=[("disabled", muted)],
        )
        style.configure(
            "Ghost.TButton",
            background=surface,
            foreground=accent,
            borderwidth=0,
            font=("Segoe UI", 10, "bold"),
        )
        style.map("Ghost.TButton", background=[("active", surface)], foreground=[("active", accent)])
        style.configure(
            "Pill.TButton",
            background=accent,
            foreground=background,
            font=("Segoe UI", 10, "bold"),
            padding=(12, 6),
            borderwidth=0,
        )
        style.map(
            "Pill.TButton",
            background=[("active", palette["accent_active"]), ("pressed", palette["accent_pressed"])],
            foreground=[("disabled", muted)],
        )
        style.configure(
            "Neutral.TButton",
            background=surface,
            foreground=accent,
            font=("Segoe UI", 10, "bold"),
            padding=(12, 6),
            borderwidth=0,
        )
        style.map("Neutral.TButton", background=[("active", surface)], foreground=[("active", accent)])
        style.configure(
            "Danger.TButton",
            background=palette["danger"],
            foreground=background,
            font=("Segoe UI", 10, "bold"),
            padding=(12, 6),
            borderwidth=0,
        )
        style.map(
            "Danger.TButton",
            background=[("active", palette["danger_active"]), ("pressed", palette["danger_pressed"])],
            foreground=[("disabled", muted)],
        )

        style.configure(
            "Treeview",
            background=surface,
            fieldbackground=surface,
            foreground=text,
            rowheight=30,
            font=("Segoe UI", 11),
            borderwidth=0,
        )
        style.configure(
            "Treeview.Heading",
            background=surface,
            foreground=subtle,
            font=("Segoe UI", 11, "bold"),
        )
        style.map("Treeview", background=[("selected", accent)], foreground=[("selected", background)])
        style.map("Treeview.Heading", relief=[("active", "flat"), ("pressed", "flat")])

        style.configure(
            "Asset.TFrame",
            background=surface,
            relief="flat",
            padding=16,
        )
        style.configure(
            "AssetTitle.TLabel",
            background=surface,
            foreground=text,
            font=("Segoe UI", 12, "bold"),
        )
        style.configure(
            "AssetStatus.TLabel",
            background=surface,
            foreground=subtle,
            font=("Segoe UI", 10),
        )

    def _build_header(self, container: ttk.Frame) -> None:
        header = ttk.Frame(container, style="Stats.TFrame")
        header.pack(fill=tk.X, pady=(0, 16))

        ttk.Label(
            header,
            text="Lecture Tools",
            style="CardValue.TLabel",
        ).pack(side=tk.LEFT)

        button_bar = ttk.Frame(header, style="Stats.TFrame")
        button_bar.pack(side=tk.RIGHT)

        ttk.Button(
            button_bar,
            text="Add lecture",
            command=self._open_add_dialog,
            style="Primary.TButton",
        ).pack(side=tk.RIGHT, padx=(12, 0))

        ttk.Button(
            button_bar,
            text="Settings",
            command=self._open_settings_dialog,
            style="Ghost.TButton",
        ).pack(side=tk.RIGHT, padx=(12, 0))

        ttk.Button(
            button_bar,
            textvariable=self._theme_button_text,
            command=self._toggle_theme,
            style="Ghost.TButton",
        ).pack(side=tk.RIGHT)

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
            card = ttk.Frame(stats_frame, style="Card.TFrame")
            card.grid(row=0, column=index, sticky="nsew", padx=(0, 18 if index < len(metrics) - 1 else 0))
            ttk.Label(card, text=label, style="CardTitle.TLabel").pack(anchor="w")
            value_var = tk.StringVar(value=str(value))
            self._stat_vars[label] = value_var
            ttk.Label(card, textvariable=value_var, style="CardValue.TLabel").pack(anchor="w", pady=(8, 0))

        asset_card = ttk.Frame(stats_frame, style="Card.TFrame")
        asset_card.grid(row=0, column=len(metrics), sticky="nsew")
        ttk.Label(asset_card, text="Assets", style="CardTitle.TLabel").pack(anchor="w")
        asset_texts = [
            f"{ASSET_LABELS[key]}: {snapshot.asset_totals.get(key, 0)}"
            for key in ("audio", "slides", "transcript", "notes", "slide_images")
        ]
        self._asset_text_var = tk.StringVar(value="\n".join(asset_texts))
        ttk.Label(
            asset_card,
            textvariable=self._asset_text_var,
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

        title_var, subtitle_var, description_var = self._require_detail_vars()

        ttk.Label(detail_panel, textvariable=title_var, style="DetailTitle.TLabel").pack(anchor="w")
        ttk.Label(detail_panel, textvariable=subtitle_var, style="DetailSubtitle.TLabel").pack(
            anchor="w", pady=(6, 16)
        )
        ttk.Label(detail_panel, textvariable=description_var, style="DetailText.TLabel", justify="left").pack(
            anchor="w",
            fill=tk.X,
        )

        asset_shell = ttk.Frame(detail_panel, style="PanelBody.TFrame")
        asset_shell.pack(anchor="w", fill=tk.BOTH, expand=True, pady=(16, 0))
        asset_shell.columnconfigure(0, weight=1)
        asset_shell.rowconfigure(0, weight=1)

        palette = self._get_palette(self._current_theme)
        canvas = tk.Canvas(
            asset_shell,
            borderwidth=0,
            highlightthickness=0,
            background=palette["surface"],
        )
        scrollbar = ttk.Scrollbar(asset_shell, orient=tk.VERTICAL, command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")

        self._asset_container = ttk.Frame(canvas, style="PanelBody.TFrame")
        window_id = canvas.create_window((0, 0), window=self._asset_container, anchor="nw")
        self._asset_canvas = canvas
        self._asset_window_id = window_id

        def _sync_scrollregion(_: tk.Event) -> None:
            canvas.configure(scrollregion=canvas.bbox("all"))

        def _expand_container(event: tk.Event) -> None:
            canvas.itemconfigure(window_id, width=event.width)

        self._asset_container.bind("<Configure>", _sync_scrollregion)
        canvas.bind("<Configure>", _expand_container)

        if snapshot.class_count == 0:
            self._show_empty_state()

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
    def _populate_tree(
        self,
        tree: ttk.Treeview,
        snapshot: OverviewSnapshot,
        *,
        preferred_selection: Optional[str] = None,
    ) -> None:
        tree.delete(*tree.get_children())
        self._tree_items.clear()

        for class_overview in snapshot.classes:
            class_id = f"class:{class_overview.record.id}"
            tree.insert("", "end", iid=class_id, text=class_overview.record.name, open=True)
            self._tree_items[class_id] = ("class", class_overview, None, class_overview)

            if not class_overview.modules:
                empty_id = f"empty:class:{class_overview.record.id}"
                tree.insert(class_id, "end", iid=empty_id, text="No modules yet")
                self._tree_items[empty_id] = ("empty", None, None, None)
                continue

            for module_overview in class_overview.modules:
                module_id = f"module:{module_overview.record.id}"
                tree.insert(class_id, "end", iid=module_id, text=module_overview.record.name, open=False)
                self._tree_items[module_id] = ("module", module_overview, module_overview, class_overview)

                if not module_overview.lectures:
                    empty_id = f"empty:module:{module_overview.record.id}"
                    tree.insert(module_id, "end", iid=empty_id, text="No lectures yet")
                    self._tree_items[empty_id] = ("empty", None, None, None)
                    continue

                for lecture_overview in module_overview.lectures:
                    lecture_id = f"lecture:{lecture_overview.record.id}"
                    tree.insert(module_id, "end", iid=lecture_id, text=lecture_overview.record.name, open=False)
                    self._tree_items[lecture_id] = (
                        "lecture",
                        lecture_overview,
                        module_overview,
                        class_overview,
                    )

        target = preferred_selection
        if target and target not in self._tree_items:
            target = None

        if target is None:
            children = tree.get_children()
            if children:
                target = children[0]

        if target:
            tree.selection_set(target)
            tree.focus(target)
            self._on_tree_select()
        else:
            self._show_empty_state()

    def _on_tree_select(self, event: tk.Event | None = None) -> None:
        if not self._tree:
            return

        selection = self._tree.selection()
        if not selection:
            return

        item_id = selection[0]
        kind, payload, module_overview, class_overview = self._tree_items.get(
            item_id, ("empty", None, None, None)
        )

        title_var, subtitle_var, description_var = self._require_detail_vars()

        if kind == "class" and isinstance(payload, ClassOverview):
            self._active_class = payload
            self._active_module = None
            self._selected_lecture_id = None
            self._show_class_details(payload)
        elif kind == "module" and isinstance(payload, ModuleOverview):
            self._active_class = class_overview
            self._active_module = payload
            self._selected_lecture_id = None
            self._show_module_details(payload)
        elif kind == "lecture" and isinstance(payload, LectureOverview):
            self._active_class = class_overview
            self._active_module = module_overview
            self._selected_lecture_id = payload.record.id
            self._show_lecture_details(payload, module_overview, class_overview)
        else:
            title_var.set("Nothing to show")
            subtitle_var.set("")
            description_var.set("This section is waiting for new content.")
            self._render_message_panel("No digital assets linked yet.")

    def _show_empty_state(self) -> None:
        title_var, subtitle_var, description_var = self._require_detail_vars()
        title_var.set("No lectures yet")
        subtitle_var.set("Start by adding your first class and lecture.")
        description_var.set(
            "Use the Add lecture button to quickly create a class, module, and lecture entry."
        )
        self._render_message_panel("No digital assets linked yet.")

    # ------------------------------------------------------------------
    # Detail rendering
    # ------------------------------------------------------------------
    def _show_class_details(self, overview: ClassOverview) -> None:
        modules = len(overview.modules)
        lectures = sum(len(module.lectures) for module in overview.modules)
        title_var, subtitle_var, description_var = self._require_detail_vars()
        title_var.set(overview.record.name)
        subtitle_var.set(f"Class · {modules} modules · {lectures} lectures")
        description_var.set(overview.record.description or "No description provided yet.")
        self._render_class_panel(overview)

    def _show_module_details(self, overview: ModuleOverview) -> None:
        lectures = len(overview.lectures)
        title_var, subtitle_var, description_var = self._require_detail_vars()
        title_var.set(overview.record.name)
        subtitle_var.set(f"Module · {lectures} lectures")
        description_var.set(overview.record.description or "No description provided yet.")
        self._render_module_panel(overview, self._active_class)

    def _show_lecture_details(
        self,
        overview: LectureOverview,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        title_var, subtitle_var, description_var = self._require_detail_vars()
        title_var.set(overview.record.name)
        subtitle_var.set("Lecture")
        description_var.set(overview.record.description or "No description provided yet.")

        self._render_asset_panel(overview, module_overview, class_overview)

    def _require_detail_vars(self) -> tuple[tk.StringVar, tk.StringVar, tk.StringVar]:
        if self._title_var is None or self._subtitle_var is None or self._description_var is None:
            raise RuntimeError("Detail variables must be initialized before use.")
        return self._title_var, self._subtitle_var, self._description_var

    def _clear_asset_container(self) -> None:
        if not self._asset_container:
            return
        for child in self._asset_container.winfo_children():
            child.destroy()

    def _render_message_panel(self, message: str) -> None:
        if not self._asset_container:
            return
        self._clear_asset_container()
        ttk.Label(self._asset_container, text=message, style="DetailSubtitle.TLabel").pack(anchor="w")

    def _render_class_panel(self, overview: ClassOverview) -> None:
        if not self._asset_container:
            return

        self._clear_asset_container()
        module_count = len(overview.modules)
        lecture_count = sum(len(module.lectures) for module in overview.modules)

        ttk.Label(self._asset_container, text="Class actions", style="PanelHeading.TLabel").pack(anchor="w")
        ttk.Label(
            self._asset_container,
            text=f"Includes {module_count} modules and {lecture_count} lectures.",
            style="DetailSubtitle.TLabel",
        ).pack(anchor="w", pady=(4, 12))

        action_bar = ttk.Frame(self._asset_container, style="PanelBody.TFrame")
        action_bar.pack(anchor="w")
        ttk.Button(
            action_bar,
            text="Delete class",
            command=lambda: self._delete_class(overview),
            style="Danger.TButton",
        ).pack(side=tk.LEFT)

    def _render_module_panel(self, overview: ModuleOverview, class_overview: ClassOverview | None) -> None:
        if not self._asset_container:
            return

        self._clear_asset_container()
        lecture_count = len(overview.lectures)

        ttk.Label(self._asset_container, text="Module actions", style="PanelHeading.TLabel").pack(anchor="w")
        ttk.Label(
            self._asset_container,
            text=f"Contains {lecture_count} lectures.",
            style="DetailSubtitle.TLabel",
        ).pack(anchor="w", pady=(4, 12))

        action_bar = ttk.Frame(self._asset_container, style="PanelBody.TFrame")
        action_bar.pack(anchor="w")
        ttk.Button(
            action_bar,
            text="Delete module",
            command=lambda: self._delete_module(overview, class_overview),
            style="Danger.TButton",
        ).pack(side=tk.LEFT)

    def _render_asset_panel(
        self,
        overview: LectureOverview,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        if not self._asset_container:
            return

        self._clear_asset_container()

        ttk.Label(self._asset_container, text="Lecture assets", style="PanelHeading.TLabel").pack(anchor="w")

        manage_bar = ttk.Frame(self._asset_container, style="PanelBody.TFrame")
        manage_bar.pack(anchor="w", pady=(8, 4))
        ttk.Button(
            manage_bar,
            text="Delete lecture",
            command=lambda: self._delete_lecture(overview, module_overview, class_overview),
            style="Danger.TButton",
        ).pack(side=tk.LEFT)

        record = overview.record
        audio_status = self._describe_asset(record.audio_path)
        slide_status = self._describe_asset(record.slide_path)
        transcript_status = self._describe_asset(record.transcript_path)
        notes_status = self._describe_asset(record.notes_path)
        image_status = self._describe_image_asset(record.slide_image_dir)

        ttk.Frame(self._asset_container, height=8, style="PanelBody.TFrame").pack(fill=tk.X)

        audio_actions = [
            ("Record audio", lambda: self._record_audio(record, module_overview, class_overview), "Primary.TButton"),
            ("Upload audio", lambda: self._upload_audio(record, module_overview, class_overview), "Pill.TButton"),
            ("Transcribe", lambda: self._transcribe_audio(record, module_overview, class_overview), "Neutral.TButton"),
            ("Open file", lambda: self._open_asset_path(record.audio_path), "Neutral.TButton"),
        ]
        if record.audio_path:
            audio_actions.append(
                (
                    "Delete audio",
                    lambda: self._delete_asset(record, "audio_path", "Audio file"),
                    "Danger.TButton",
                )
            )
        self._create_asset_card("🎧 Audio", audio_status, audio_actions)

        slide_actions = [
            ("Upload PDF", lambda: self._upload_slides(record, module_overview, class_overview), "Pill.TButton"),
            (
                "Render images",
                lambda: self._render_slide_images(record, module_overview, class_overview),
                "Neutral.TButton",
            ),
            ("Open file", lambda: self._open_asset_path(record.slide_path), "Neutral.TButton"),
        ]
        if record.slide_path:
            slide_actions.append(
                (
                    "Delete PDF",
                    lambda: self._delete_asset(record, "slide_path", "Slide deck"),
                    "Danger.TButton",
                )
            )
        self._create_asset_card("📑 Slides", slide_status, slide_actions)

        transcript_actions = [
            (
                "Upload transcript",
                lambda: self._upload_transcript(record, module_overview, class_overview),
                "Pill.TButton",
            ),
            ("Open file", lambda: self._open_asset_path(record.transcript_path), "Neutral.TButton"),
        ]
        if record.transcript_path:
            transcript_actions.append(
                (
                    "Delete transcript",
                    lambda: self._delete_asset(record, "transcript_path", "Transcript"),
                    "Danger.TButton",
                )
            )
        self._create_asset_card("📝 Transcript", transcript_status, transcript_actions)

        notes_actions = [
            (
                "Upload notes",
                lambda: self._upload_notes(record, module_overview, class_overview),
                "Pill.TButton",
            ),
            ("Open file", lambda: self._open_asset_path(record.notes_path), "Neutral.TButton"),
        ]
        if record.notes_path:
            notes_actions.append(
                (
                    "Delete notes",
                    lambda: self._delete_asset(record, "notes_path", "Lecture notes"),
                    "Danger.TButton",
                )
            )
        self._create_asset_card("📄 Lecture notes", notes_status, notes_actions)

        image_actions = [
            (
                "Upload images",
                lambda: self._upload_slide_images(record, module_overview, class_overview),
                "Pill.TButton",
            ),
        ]
        if record.slide_image_dir:
            image_actions.append(
                ("View images", lambda: self._view_slide_images(record), "Neutral.TButton")
            )
        image_actions.append(
            (
                "Open folder",
                lambda: self._open_asset_path(record.slide_image_dir, directory=True),
                "Neutral.TButton",
            )
        )
        if record.slide_image_dir:
            image_actions.append(
                (
                    "Delete images",
                    lambda: self._delete_asset(record, "slide_image_dir", "Slide images", directory=True),
                    "Danger.TButton",
                )
            )
        self._create_asset_card("🖼️ Slide images", image_status, image_actions)

    def _create_asset_card(
        self,
        title: str,
        status: str,
        actions: List[Tuple[str, Callable[[], None], str]],
    ) -> None:
        if not self._asset_container:
            return

        card = ttk.Frame(self._asset_container, style="Asset.TFrame")
        card.pack(fill=tk.X, expand=False, pady=(8, 0))

        ttk.Label(card, text=title, style="AssetTitle.TLabel").pack(anchor="w")
        ttk.Label(card, text=status, style="AssetStatus.TLabel").pack(anchor="w", pady=(2, 10))

        action_bar = ttk.Frame(card, style="PanelBody.TFrame")
        action_bar.pack(anchor="w")

        for index, (label, command, style_name) in enumerate(actions):
            ttk.Button(action_bar, text=label, command=command, style=style_name).pack(
                side=tk.LEFT, padx=(0, 10 if index < len(actions) - 1 else 0)
            )

    def _describe_asset(self, path: Optional[str]) -> str:
        if not path:
            return "No file linked yet."
        return f"Linked: {Path(path).name}"

    def _describe_image_asset(self, directory: Optional[str]) -> str:
        if not directory:
            return "No images generated yet."
        if not self._config:
            return f"Images stored at {directory}"
        absolute = self._config.storage_root / directory
        if absolute.exists():
            if absolute.is_dir():
                count = sum(1 for item in absolute.iterdir() if item.is_file())
                return f"{count} images available in {absolute.name}"
            if absolute.is_file() and absolute.suffix.lower() == ".zip":
                try:
                    with zipfile.ZipFile(absolute, "r") as archive:
                        count = len(
                            [name for name in archive.namelist() if not name.endswith("/")]
                        )
                except Exception:
                    count = 0
                if count:
                    return f"{count} images archived in {absolute.name}"
                return f"Archive stored in {absolute.name}"
        return f"Images stored at {absolute.name}"

    # ------------------------------------------------------------------
    # Creation workflow
    # ------------------------------------------------------------------
    def _open_add_dialog(self) -> None:
        if not self._root:
            return

        dialog = tk.Toplevel(self._root)
        dialog.title("Add lecture")
        dialog.transient(self._root)
        dialog.grab_set()
        dialog.resizable(False, False)

        frame = ttk.Frame(dialog, padding=20, style="Panel.TFrame")
        frame.grid(row=0, column=0, sticky="nsew")

        inputs = [
            ("Class name", tk.StringVar()),
            ("Module name", tk.StringVar()),
            ("Lecture title", tk.StringVar()),
        ]

        for row, (label, var) in enumerate(inputs):
            ttk.Label(frame, text=label, style="CardTitle.TLabel").grid(row=row, column=0, sticky="w", pady=(0, 6))
            entry = ttk.Entry(frame, textvariable=var, width=40)
            entry.grid(row=row, column=1, sticky="w", padx=(12, 0), pady=(0, 6))
            if row == 0:
                entry.focus_set()

        ttk.Label(frame, text="Description", style="CardTitle.TLabel").grid(
            row=len(inputs), column=0, sticky="nw", pady=(6, 0)
        )
        description_entry = tk.Text(frame, width=38, height=4, wrap="word")
        description_entry.grid(row=len(inputs), column=1, sticky="w", padx=(12, 0), pady=(6, 12))

        button_bar = ttk.Frame(frame, style="Stats.TFrame")
        button_bar.grid(row=len(inputs) + 1, column=0, columnspan=2, sticky="e")

        def close_dialog() -> None:
            dialog.grab_release()
            dialog.destroy()

        def submit() -> None:
            class_name = inputs[0][1].get().strip()
            module_name = inputs[1][1].get().strip()
            lecture_title = inputs[2][1].get().strip()
            description = description_entry.get("1.0", tk.END).strip()

            if not class_name or not module_name or not lecture_title:
                messagebox.showerror(
                    "Add lecture",
                    "Class, module, and lecture titles are required.",
                    parent=dialog,
                )
                return

            try:
                self._create_lecture(class_name, module_name, lecture_title, description)
            except ValueError as error:
                messagebox.showerror("Add lecture", str(error), parent=dialog)
                return

            close_dialog()
            messagebox.showinfo(
                "Lecture created",
                "Your lecture has been added to the library.",
                parent=self._root,
            )
            self._refresh_ui()

        ttk.Button(button_bar, text="Cancel", command=close_dialog, style="Ghost.TButton").pack(
            side=tk.RIGHT, padx=(12, 0)
        )
        ttk.Button(button_bar, text="Add", command=submit, style="Primary.TButton").pack(side=tk.RIGHT)

        dialog.wait_window()

    def _create_lecture(
        self,
        class_name: str,
        module_name: str,
        lecture_title: str,
        description: str,
    ) -> None:
        existing_class = self._repository.find_class_by_name(class_name)
        if existing_class is None:
            class_id = self._repository.add_class(class_name)
        else:
            class_id = existing_class.id

        existing_module = self._repository.find_module_by_name(class_id, module_name)
        if existing_module is None:
            module_id = self._repository.add_module(class_id, module_name)
        else:
            module_id = existing_module.id

        existing_lecture = self._repository.find_lecture_by_name(module_id, lecture_title)
        if existing_lecture is not None:
            raise ValueError("A lecture with that title already exists in this module.")

        self._repository.add_lecture(module_id, lecture_title, description)

    # ------------------------------------------------------------------
    # Asset management helpers
    # ------------------------------------------------------------------
    def _upload_audio(
        self,
        record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        file_path = filedialog.askopenfilename(
            title="Select audio file",
            filetypes=[("Audio/Video", "*.mp3 *.wav *.m4a *.mp4 *.mkv"), ("All files", "*.*")],
        )
        if not file_path:
            return
        self._store_file(record, Path(file_path), "audio_path", module_overview, class_overview)

    def _record_audio(
        self,
        record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        if not self._root:
            return
        if not self._config:
            messagebox.showerror(
                "Record audio",
                "Asset storage is not configured.",
                parent=self._root,
            )
            return

        hierarchy = self._resolve_hierarchy(record, module_overview, class_overview)
        if hierarchy is None:
            return
        class_record, module_record = hierarchy

        duration = simpledialog.askfloat(
            "Record audio",
            "Duration in seconds (1-1800):",
            minvalue=1.0,
            maxvalue=1_800.0,
            parent=self._root,
        )
        if not duration:
            return

        if record.audio_path:
            overwrite = messagebox.askyesno(
                "Record audio",
                "An audio file already exists for this lecture. Replace it with the new recording?",
                parent=self._root,
            )
            if not overwrite:
                return

        status_window = tk.Toplevel(self._root)
        status_window.title("Record audio")
        status_window.transient(self._root)
        status_window.grab_set()
        status_window.resizable(False, False)
        ttk.Label(status_window, text="Recording...", style="PanelHeading.TLabel").grid(
            row=0, column=0, padx=16, pady=(16, 8)
        )
        status_var = tk.StringVar(value="Capturing microphone input")
        ttk.Label(status_window, textvariable=status_var, style="DetailText.TLabel").grid(
            row=1, column=0, padx=16, pady=(0, 16)
        )

        lecture_paths = LecturePaths.build(
            self._config.storage_root, class_record.name, module_record.name, record.name
        )
        lecture_paths.ensure()

        def worker() -> None:
            try:
                recorder = AudioRecorder()
                raw_audio = recorder.record(duration)
                if self._root:
                    self._root.after(0, lambda: status_var.set("Balancing audio for Whisper..."))
                processed = preprocess_audio(raw_audio, recorder.sample_rate)
                stem = build_asset_stem(
                    class_record.name,
                    module_record.name,
                    record.name,
                    "audio-recording",
                )
                destination = lecture_paths.raw_dir / build_timestamped_name(
                    stem, extension=".wav"
                )
                if self._root:
                    self._root.after(0, lambda: status_var.set("Saving optimised mono WAV"))
                save_preprocessed_wav(destination, processed, recorder.sample_rate)
            except Exception as error:  # pragma: no cover - depends on optional audio backend
                def on_error() -> None:
                    status_window.grab_release()
                    status_window.destroy()
                    messagebox.showerror("Record audio", str(error), parent=self._root)

                if self._root:
                    self._root.after(0, on_error)
                return

            def on_success() -> None:
                status_window.grab_release()
                status_window.destroy()
                relative = destination.relative_to(self._config.storage_root).as_posix()
                self._repository.update_lecture_assets(record.id, audio_path=relative)
                self._refresh_ui()
                messagebox.showinfo(
                    "Record audio",
                    "Recording saved and prepared for Whisper transcription.",
                    parent=self._root,
                )

            if self._root:
                self._root.after(0, on_success)

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

    def _upload_slides(
        self,
        record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        file_path = filedialog.askopenfilename(
            title="Select PDF slides",
            filetypes=[("PDF", "*.pdf"), ("All files", "*.*")],
        )
        if not file_path:
            return
        self._store_file(record, Path(file_path), "slide_path", module_overview, class_overview)

    def _upload_transcript(
        self,
        record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        file_path = filedialog.askopenfilename(
            title="Select transcript",
            filetypes=[("Text", "*.txt *.md"), ("All files", "*.*")],
        )
        if not file_path:
            return
        self._store_file(
            record,
            Path(file_path),
            "transcript_path",
            module_overview,
            class_overview,
            destination="transcript",
        )

    def _upload_notes(
        self,
        record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        file_path = filedialog.askopenfilename(
            title="Select lecture notes",
            filetypes=[("Word documents", "*.docx *.doc"), ("All files", "*.*")],
        )
        if not file_path:
            return
        self._store_file(
            record,
            Path(file_path),
            "notes_path",
            module_overview,
            class_overview,
            destination="notes",
        )

    def _upload_slide_images(
        self,
        record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        files = filedialog.askopenfilenames(
            title="Select slide images",
            filetypes=[
                ("Images", "*.png *.jpg *.jpeg *.webp *.bmp *.gif"),
                ("All files", "*.*"),
            ],
        )
        if not files:
            return
        self._store_images(record, [Path(path) for path in files], module_overview, class_overview)

    def _store_file(
        self,
        lecture_record: LectureRecord,
        source: Path,
        attribute: str,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
        *,
        destination: str = "raw",
    ) -> None:
        if not self._config:
            messagebox.showerror(
                "Storage unavailable",
                "Asset storage is not configured.",
                parent=self._root,
            )
            return

        hierarchy = self._resolve_hierarchy(lecture_record, module_overview, class_overview)
        if hierarchy is None:
            return
        class_record, module_record = hierarchy

        lecture_paths = LecturePaths.build(
            self._config.storage_root, class_record.name, module_record.name, lecture_record.name
        )
        lecture_paths.ensure()

        destination_dir = {
            "raw": lecture_paths.raw_dir,
            "transcript": lecture_paths.transcript_dir,
            "slides": lecture_paths.slide_dir,
            "notes": lecture_paths.notes_dir,
        }.get(destination, lecture_paths.raw_dir)

        destination_dir.mkdir(parents=True, exist_ok=True)
        kind_map = {
            "audio_path": "audio",
            "slide_path": "slides",
            "transcript_path": "transcript",
            "notes_path": "notes",
        }
        stem = build_asset_stem(
            class_record.name,
            module_record.name,
            lecture_record.name,
            kind_map.get(attribute, attribute),
        )
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = build_timestamped_name(stem, timestamp=timestamp, extension=source.suffix)
        target = destination_dir / filename
        shutil.copy2(source, target)

        relative = target.relative_to(self._config.storage_root).as_posix()
        self._repository.update_lecture_assets(lecture_record.id, **{attribute: relative})
        self._refresh_ui()

    def _store_images(
        self,
        lecture_record: LectureRecord,
        sources: List[Path],
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        if not self._config:
            messagebox.showerror(
                "Storage unavailable",
                "Asset storage is not configured.",
                parent=self._root,
            )
            return

        hierarchy = self._resolve_hierarchy(lecture_record, module_overview, class_overview)
        if hierarchy is None:
            return
        class_record, module_record = hierarchy

        lecture_paths = LecturePaths.build(
            self._config.storage_root, class_record.name, module_record.name, lecture_record.name
        )
        lecture_paths.ensure()

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        folder_stem = build_asset_stem(
            class_record.name,
            module_record.name,
            lecture_record.name,
            "slide-images",
        )
        folder_name = build_timestamped_name(folder_stem, timestamp=timestamp)
        destination_dir = lecture_paths.slide_dir / folder_name
        destination_dir.mkdir(parents=True, exist_ok=True)

        file_stem = build_asset_stem(
            class_record.name,
            module_record.name,
            lecture_record.name,
            "slide-image",
        )

        for index, source in enumerate(sources, start=1):
            filename = build_timestamped_name(
                file_stem,
                timestamp=timestamp,
                sequence=index,
                extension=source.suffix,
            )
            target = destination_dir / filename
            shutil.copy2(source, target)

        relative = destination_dir.relative_to(self._config.storage_root).as_posix()
        self._repository.update_lecture_assets(lecture_record.id, slide_image_dir=relative)
        self._refresh_ui()

    def _view_slide_images(self, lecture_record: LectureRecord) -> None:
        if not self._root:
            return
        if not self._config:
            messagebox.showerror(
                "Slide images",
                "Asset storage is not configured.",
                parent=self._root,
            )
            return
        if not lecture_record.slide_image_dir:
            messagebox.showinfo("Slide images", "No slide images available yet.", parent=self._root)
            return

        directory = self._config.storage_root / lecture_record.slide_image_dir
        if not directory.exists():
            messagebox.showerror(
                "Slide images",
                f"The slide image folder could not be found at {directory}.",
                parent=self._root,
            )
            return

        if directory.is_file() and directory.suffix.lower() == ".zip":
            messagebox.showinfo(
                "Slide images",
                "Slide images are stored in a ZIP archive. Use the open option to inspect the files.",
                parent=self._root,
            )
            return

        valid_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
        image_files = sorted(
            path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() in valid_extensions
        )
        if not image_files:
            messagebox.showinfo("Slide images", "No image files were found in this folder.", parent=self._root)
            return

        viewer = tk.Toplevel(self._root)
        viewer.title("Slide images")
        viewer.transient(self._root)
        viewer.grab_set()
        viewer.minsize(720, 520)

        container = ttk.Frame(viewer, padding=16, style="Panel.TFrame")
        container.grid(row=0, column=0, sticky="nsew")
        viewer.columnconfigure(0, weight=1)
        viewer.rowconfigure(0, weight=1)

        list_var = tk.StringVar(value=[path.relative_to(directory).as_posix() for path in image_files])
        listbox = tk.Listbox(container, listvariable=list_var, exportselection=False, width=30)
        listbox.grid(row=0, column=0, sticky="nsw")
        scrollbar = ttk.Scrollbar(container, orient=tk.VERTICAL, command=listbox.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        listbox.configure(yscrollcommand=scrollbar.set)

        preview_frame = ttk.Frame(container, padding=(16, 0), style="PanelBody.TFrame")
        preview_frame.grid(row=0, column=2, sticky="nsew")
        container.columnconfigure(2, weight=1)
        container.rowconfigure(0, weight=1)

        preview_label = ttk.Label(preview_frame)
        preview_label.pack(fill=tk.BOTH, expand=True)

        caption_var = tk.StringVar()
        ttk.Label(preview_frame, textvariable=caption_var, style="DetailSubtitle.TLabel").pack(
            anchor="w", pady=(12, 0)
        )

        button_bar = ttk.Frame(preview_frame, style="PanelBody.TFrame")
        button_bar.pack(anchor="e", pady=(12, 0))

        def open_selected() -> None:
            selection = listbox.curselection()
            if not selection:
                return
            relative = image_files[selection[0]].relative_to(self._config.storage_root).as_posix()
            self._open_asset_path(relative)

        ttk.Button(button_bar, text="Open image", command=open_selected, style="Neutral.TButton").pack(side=tk.RIGHT)
        ttk.Button(button_bar, text="Close", command=viewer.destroy, style="Ghost.TButton").pack(
            side=tk.RIGHT, padx=(0, 12)
        )

        def show_preview(index: int) -> None:
            image_path = image_files[index]
            try:
                with Image.open(image_path) as pil_image:
                    width, height = pil_image.size
                    max_width = 640
                    max_height = 440
                    scale = min(max_width / width, max_height / height, 1.0)
                    if scale < 1.0:
                        new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
                        pil_image = pil_image.resize(new_size, Image.LANCZOS)
                    photo = ImageTk.PhotoImage(pil_image)
            except Exception as error:  # pragma: no cover - depends on optional imaging libs
                messagebox.showerror(
                    "Slide images",
                    f"Unable to preview the selected image:\n{error}",
                    parent=viewer,
                )
                return

            preview_label.configure(image=photo)
            preview_label.image = photo
            caption_var.set(image_path.name)

        def on_select(event: tk.Event | None = None) -> None:
            selection = listbox.curselection()
            if not selection:
                return
            show_preview(selection[0])

        listbox.bind("<<ListboxSelect>>", on_select)
        listbox.selection_set(0)
        show_preview(0)

        viewer.wait_window()

    def _transcribe_audio(
        self,
        lecture_record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        if not self._config:
            messagebox.showerror(
                "Transcription unavailable",
                "Asset storage is not configured.",
                parent=self._root,
            )
            return

        if not lecture_record.audio_path:
            messagebox.showwarning("Transcribe audio", "Upload an audio file before transcribing.", parent=self._root)
            return

        hierarchy = self._resolve_hierarchy(lecture_record, module_overview, class_overview)
        if hierarchy is None:
            return
        class_record, module_record = hierarchy

        lecture_paths = LecturePaths.build(
            self._config.storage_root, class_record.name, module_record.name, lecture_record.name
        )
        lecture_paths.ensure()

        audio_file = self._config.storage_root / lecture_record.audio_path
        if not audio_file.exists():
            messagebox.showerror(
                "Transcribe audio",
                f"The audio file could not be found at {audio_file}.",
                parent=self._root,
            )
            return

        status_window = tk.Toplevel(self._root)
        status_window.title("Transcribe audio")
        status_window.transient(self._root)
        status_window.grab_set()
        status_window.resizable(False, False)
        ttk.Label(status_window, text="Transcribing", style="PanelHeading.TLabel").grid(
            row=0, column=0, padx=16, pady=(16, 8)
        )
        status_var = tk.StringVar(value="Whisper is working on your transcript...")
        ttk.Label(status_window, textvariable=status_var, style="DetailText.TLabel").grid(
            row=1, column=0, padx=16, pady=(0, 16)
        )

        def worker() -> None:
            try:
                engine = FasterWhisperTranscription(
                    self._settings.whisper_model,
                    download_root=self._config.assets_root,
                    compute_type=self._settings.whisper_compute_type,
                    beam_size=int(self._settings.whisper_beam_size),
                )
                status = "Decoding audio with Whisper..."
                if self._root:
                    self._root.after(0, lambda: status_var.set(status))
                result = engine.transcribe(audio_file, lecture_paths.transcript_dir)
            except Exception as error:  # pragma: no cover - depends on optional packages
                def on_error() -> None:
                    status_window.grab_release()
                    status_window.destroy()
                    messagebox.showerror(
                        "Transcribe audio",
                        f"Whisper could not finish the transcript:\n{error}",
                        parent=self._root,
                    )

                if self._root:
                    self._root.after(0, on_error)
                return

            def on_success() -> None:
                status_window.grab_release()
                status_window.destroy()
                relative = result.text_path.relative_to(self._config.storage_root).as_posix()
                self._repository.update_lecture_assets(lecture_record.id, transcript_path=relative)
                self._refresh_ui()
                messagebox.showinfo(
                    "Transcribe audio",
                    "Whisper is working great – transcript generated successfully.",
                    parent=self._root,
                )

            if self._root:
                self._root.after(0, on_success)

        threading.Thread(target=worker, daemon=True).start()

    def _render_slide_images(
        self,
        lecture_record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        if not self._config:
            messagebox.showerror(
                "Render slides",
                "Asset storage is not configured.",
                parent=self._root,
            )
            return

        if not lecture_record.slide_path:
            messagebox.showwarning("Render slides", "Upload a PDF slideshow first.", parent=self._root)
            return

        hierarchy = self._resolve_hierarchy(lecture_record, module_overview, class_overview)
        if hierarchy is None:
            return
        class_record, module_record = hierarchy

        lecture_paths = LecturePaths.build(
            self._config.storage_root, class_record.name, module_record.name, lecture_record.name
        )
        lecture_paths.ensure()

        slide_file = self._config.storage_root / lecture_record.slide_path
        if not slide_file.exists():
            messagebox.showerror(
                "Render slides",
                f"The slide file could not be found at {slide_file}.",
                parent=self._root,
            )
            return

        try:
            converter = PyMuPDFSlideConverter(dpi=int(self._settings.slide_dpi))
        except Exception as error:  # pragma: no cover - optional dependency
            messagebox.showerror(
                "Render slides",
                f"Unable to initialise slide converter:\n{error}",
                parent=self._root,
            )
            return

        try:
            generated = list(converter.convert(slide_file, lecture_paths.slide_dir))
        except Exception as error:  # pragma: no cover - optional dependency
            messagebox.showerror(
                "Render slides",
                f"Slide conversion failed:\n{error}",
                parent=self._root,
            )
            return

        if not generated:
            messagebox.showwarning("Render slides", "No images were generated from the slideshow.", parent=self._root)
            return

        relative = lecture_paths.slide_dir.relative_to(self._config.storage_root).as_posix()
        self._repository.update_lecture_assets(lecture_record.id, slide_image_dir=relative)
        self._refresh_ui()
        messagebox.showinfo("Render slides", "Slide images generated successfully.", parent=self._root)

    def _delete_asset(
        self,
        lecture_record: LectureRecord,
        attribute: str,
        label: str,
        *,
        directory: bool = False,
    ) -> None:
        if not self._root:
            return
        if not self._config:
            messagebox.showerror(
                f"Delete {label}",
                "Asset storage is not configured.",
                parent=self._root,
            )
            return

        relative: Optional[str] = getattr(lecture_record, attribute, None)
        if not relative:
            messagebox.showinfo(
                f"Delete {label}",
                f"No {label.lower()} linked to this lecture.",
                parent=self._root,
            )
            return

        if not messagebox.askyesno(
            f"Delete {label}",
            f"Remove the {label.lower()} from this lecture?",
            parent=self._root,
        ):
            return

        path = self._config.storage_root / relative
        if not self._is_within_storage(path):
            messagebox.showerror(
                f"Delete {label}",
                "The asset is stored outside the configured storage directory.",
                parent=self._root,
            )
            return

        try:
            if path.exists():
                if directory:
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                elif path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
        except Exception as error:
            messagebox.showerror(
                f"Delete {label}",
                f"Failed to delete the {label.lower()}:\n{error}",
                parent=self._root,
            )
            return

        self._selected_lecture_id = lecture_record.id
        self._repository.update_lecture_assets(lecture_record.id, **{attribute: None})
        self._refresh_ui()
        messagebox.showinfo(
            f"Delete {label}",
            f"{label} removed successfully.",
            parent=self._root,
        )

    def _delete_class(self, overview: ClassOverview) -> None:
        if not self._root:
            return

        module_count = len(overview.modules)
        lecture_count = sum(len(module.lectures) for module in overview.modules)
        if not messagebox.askyesno(
            "Delete class",
            (
                f"Delete class '{overview.record.name}'?\n\n"
                f"This will remove {module_count} modules and {lecture_count} lectures."
            ),
            parent=self._root,
        ):
            return

        if self._config:
            class_dir = self._config.storage_root / slugify(overview.record.name)
            self._delete_storage_path(class_dir, "Delete class")

        self._selected_lecture_id = None
        self._active_class = None
        self._active_module = None
        self._repository.remove_class(overview.record.id)
        self._refresh_ui()
        messagebox.showinfo("Delete class", "Class removed successfully.", parent=self._root)

    def _delete_module(self, overview: ModuleOverview, class_overview: ClassOverview | None) -> None:
        if not self._root:
            return

        class_record = class_overview.record if class_overview else self._repository.get_class(overview.record.class_id)
        if class_record is None:
            messagebox.showerror("Delete module", "Class information is unavailable.", parent=self._root)
            return

        lecture_count = len(overview.lectures)
        if not messagebox.askyesno(
            "Delete module",
            (
                f"Delete module '{overview.record.name}' from '{class_record.name}'?\n\n"
                f"This will remove {lecture_count} lectures."
            ),
            parent=self._root,
        ):
            return

        if self._config:
            module_dir = (
                self._config.storage_root
                / slugify(class_record.name)
                / slugify(overview.record.name)
            )
            self._delete_storage_path(module_dir, "Delete module")

        self._selected_lecture_id = None
        self._active_module = None
        self._repository.remove_module(overview.record.id)
        self._refresh_ui()
        messagebox.showinfo("Delete module", "Module removed successfully.", parent=self._root)

    def _delete_lecture(
        self,
        overview: LectureOverview,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> None:
        if not self._root:
            return

        if not messagebox.askyesno(
            "Delete lecture",
            f"Delete lecture '{overview.record.name}' and all associated assets?",
            parent=self._root,
        ):
            return

        if self._config:
            hierarchy = self._resolve_hierarchy(overview.record, module_overview, class_overview)
            if hierarchy is not None:
                class_record, module_record = hierarchy
                lecture_paths = LecturePaths.build(
                    self._config.storage_root,
                    class_record.name,
                    module_record.name,
                    overview.record.name,
                )
                self._delete_storage_path(lecture_paths.lecture_root, "Delete lecture")

        self._selected_lecture_id = None
        self._repository.remove_lecture(overview.record.id)
        self._refresh_ui()
        messagebox.showinfo("Delete lecture", "Lecture removed successfully.", parent=self._root)

    def _resolve_hierarchy(
        self,
        lecture_record: LectureRecord,
        module_overview: ModuleOverview | None,
        class_overview: ClassOverview | None,
    ) -> Optional[Tuple[ClassRecord, ModuleRecord]]:
        module_record = (
            module_overview.record if module_overview else self._repository.get_module(lecture_record.module_id)
        )
        if module_record is None:
            messagebox.showerror("Asset handling", "Module information is unavailable.", parent=self._root)
            return None

        class_record = class_overview.record if class_overview else self._repository.get_class(module_record.class_id)
        if class_record is None:
            messagebox.showerror("Asset handling", "Class information is unavailable.", parent=self._root)
            return None

        return class_record, module_record

    def _open_asset_path(self, relative: Optional[str], directory: bool = False) -> None:
        if not relative:
            messagebox.showinfo("Open asset", "No asset available yet.", parent=self._root)
            return

        if not self._config:
            messagebox.showerror("Open asset", "Asset storage is not configured.", parent=self._root)
            return

        path = self._config.storage_root / relative
        if not path.exists():
            messagebox.showerror("Open asset", f"Path not found: {path}", parent=self._root)
            return

        if directory:
            target = path if path.is_dir() else path.parent
            select_file = path.is_file()
        else:
            target = path
            select_file = False

        try:
            system = platform.system()
            if system == "Windows":
                if select_file:
                    subprocess.check_call(["explorer", f"/select,{path}"])
                else:
                    os.startfile(target)  # type: ignore[attr-defined]
            elif system == "Darwin":
                if select_file:
                    subprocess.check_call(["open", "-R", str(path)])
                else:
                    subprocess.check_call(["open", str(target)])
            else:
                subprocess.check_call(["xdg-open", str(target)])
        except Exception as error:
            messagebox.showerror(
                "Open asset",
                f"Failed to open asset:\n{error}",
                parent=self._root,
            )

    def _is_within_storage(self, path: Path) -> bool:
        if not self._config:
            return False
        try:
            storage_root = self._config.storage_root.resolve(strict=False)
        except Exception:
            storage_root = self._config.storage_root.resolve()
        try:
            target = path.resolve(strict=False)
        except Exception:
            target = path.resolve()
        return target.is_relative_to(storage_root)

    def _delete_storage_path(self, path: Path, context: str) -> None:
        if not self._config or not self._root:
            return

        if not self._is_within_storage(path):
            messagebox.showwarning(
                context,
                "Associated files are stored outside the configured storage directory and were left untouched.",
                parent=self._root,
            )
            return

        if not path.exists():
            return

        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
        except Exception as error:
            messagebox.showwarning(
                context,
                f"Failed to remove associated files:\n{error}",
                parent=self._root,
            )

    # ------------------------------------------------------------------
    # Settings and theming
    # ------------------------------------------------------------------
    def _resolve_effective_theme(self, theme: ThemeName) -> ThemeName:
        if theme != "system":
            return theme
        return self._detect_system_theme()

    def _detect_system_theme(self) -> ThemeName:
        system = platform.system()
        if system == "Windows":
            try:  # pragma: no cover - platform specific
                import winreg  # type: ignore

                with winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                ) as key:
                    value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
                    return "light" if int(value) else "dark"
            except Exception:
                return "light"
        if system == "Darwin":
            try:  # pragma: no cover - platform specific
                result = subprocess.run(
                    ["defaults", "read", "-g", "AppleInterfaceStyle"],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0 and result.stdout.strip():
                    return "dark"
            except Exception:
                return "light"
            return "light"
        scheme = os.environ.get("GTK_THEME", "").lower()
        if "dark" in scheme:
            return "dark"
        try:  # pragma: no cover - depends on optional desktop tooling
            result = subprocess.run(
                [
                    "gsettings",
                    "get",
                    "org.gnome.desktop.interface",
                    "color-scheme",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and "dark" in result.stdout.lower():
                return "dark"
        except Exception:
            pass
        return "light"

    def _toggle_theme(self) -> None:
        effective = self._resolve_effective_theme(self._current_theme)
        self._current_theme = "light" if effective == "dark" else "dark"
        self._settings.theme = self._current_theme
        if self._settings_store:
            self._settings_store.save(self._settings)
        self._apply_theme()

    def _apply_theme(self) -> None:
        if not self._root:
            return

        style = ttk.Style(self._root)
        palette = self._get_palette(self._resolve_effective_theme(self._current_theme))
        self._configure_styles(style, palette)
        self._root.configure(background=palette["background"])
        self._update_theme_button()
        if self._asset_canvas is not None:
            self._asset_canvas.configure(background=palette["surface"])

    def _update_theme_button(self) -> None:
        if self._theme_button_text is None:
            return
        effective = self._resolve_effective_theme(self._current_theme)
        if effective == "dark":
            self._theme_button_text.set("Switch to light mode")
        else:
            self._theme_button_text.set("Switch to dark mode")

    def _get_palette(self, theme: ThemeName) -> Palette:
        if theme == "light":
            return {
                "background": "#f1f5f9",
                "surface": "#ffffff",
                "accent": "#2563eb",
                "accent_active": "#1d4ed8",
                "accent_pressed": "#1e40af",
                "subtle": "#475569",
                "text": "#0f172a",
                "muted": "#94a3b8",
                "danger": "#dc2626",
                "danger_active": "#b91c1c",
                "danger_pressed": "#991b1b",
            }
        return {
            "background": "#0f172a",
            "surface": "#1f2937",
            "accent": "#38bdf8",
            "accent_active": "#0ea5e9",
            "accent_pressed": "#0284c7",
            "subtle": "#94a3b8",
            "text": "#f8fafc",
            "muted": "#64748b",
            "danger": "#f87171",
            "danger_active": "#ef4444",
            "danger_pressed": "#dc2626",
        }

    def _open_settings_dialog(self) -> None:
        if not self._root:
            return

        dialog = tk.Toplevel(self._root)
        dialog.title("Settings")
        dialog.transient(self._root)
        dialog.grab_set()
        dialog.resizable(False, False)

        frame = ttk.Frame(dialog, padding=20, style="Panel.TFrame")
        frame.grid(row=0, column=0, sticky="nsew")

        theme_var = tk.StringVar(value=self._current_theme)
        whisper_model_var = tk.StringVar(value=self._settings.whisper_model)
        compute_type_var = tk.StringVar(value=self._settings.whisper_compute_type)
        beam_size_var = tk.IntVar(value=int(self._settings.whisper_beam_size))
        slide_dpi_var = tk.IntVar(value=int(self._settings.slide_dpi))

        ttk.Label(frame, text="Appearance", style="DetailTitle.TLabel").grid(row=0, column=0, sticky="w")

        theme_frame = ttk.Frame(frame, style="PanelBody.TFrame")
        theme_frame.grid(row=1, column=0, sticky="w", pady=(4, 16))
        ttk.Radiobutton(
            theme_frame, text="Follow system", value="system", variable=theme_var
        ).pack(side=tk.LEFT)
        ttk.Radiobutton(theme_frame, text="Dark", value="dark", variable=theme_var).pack(
            side=tk.LEFT, padx=(12, 0)
        )
        ttk.Radiobutton(theme_frame, text="Light", value="light", variable=theme_var).pack(
            side=tk.LEFT, padx=(12, 0)
        )

        ttk.Label(frame, text="Whisper settings", style="DetailTitle.TLabel").grid(
            row=2, column=0, sticky="w"
        )

        whisper_frame = ttk.Frame(frame, style="PanelBody.TFrame")
        whisper_frame.grid(row=3, column=0, sticky="w", pady=(4, 16))

        ttk.Label(whisper_frame, text="Model", style="CardTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Entry(whisper_frame, textvariable=whisper_model_var, width=18).grid(
            row=0,
            column=1,
            sticky="w",
            padx=(12, 0),
        )

        ttk.Label(whisper_frame, text="Compute type", style="CardTitle.TLabel").grid(
            row=1, column=0, sticky="w", pady=(6, 0)
        )
        ttk.Entry(whisper_frame, textvariable=compute_type_var, width=18).grid(
            row=1,
            column=1,
            sticky="w",
            padx=(12, 0),
            pady=(6, 0),
        )

        ttk.Label(whisper_frame, text="Beam size", style="CardTitle.TLabel").grid(
            row=2, column=0, sticky="w", pady=(6, 0)
        )
        ttk.Spinbox(whisper_frame, from_=1, to=10, textvariable=beam_size_var, width=6).grid(
            row=2,
            column=1,
            sticky="w",
            padx=(12, 0),
            pady=(6, 0),
        )

        ttk.Label(frame, text="Slide rendering", style="DetailTitle.TLabel").grid(
            row=4, column=0, sticky="w"
        )
        slide_frame = ttk.Frame(frame, style="PanelBody.TFrame")
        slide_frame.grid(row=5, column=0, sticky="w", pady=(4, 12))
        ttk.Label(slide_frame, text="DPI", style="CardTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Spinbox(slide_frame, from_=72, to=600, increment=10, textvariable=slide_dpi_var, width=6).grid(
            row=0,
            column=1,
            sticky="w",
            padx=(12, 0),
        )

        button_bar = ttk.Frame(frame, style="Stats.TFrame")
        button_bar.grid(row=6, column=0, sticky="e", pady=(12, 0))

        def close_dialog() -> None:
            dialog.grab_release()
            dialog.destroy()

        def save_settings() -> None:
            self._current_theme = theme_var.get()  # type: ignore[assignment]
            self._settings.theme = self._current_theme
            self._settings.whisper_model = whisper_model_var.get().strip() or "base"
            self._settings.whisper_compute_type = compute_type_var.get().strip() or "int8"
            self._settings.whisper_beam_size = max(1, beam_size_var.get())
            self._settings.slide_dpi = max(72, slide_dpi_var.get())
            if self._settings_store:
                self._settings_store.save(self._settings)
            self._apply_theme()
            close_dialog()

        ttk.Button(button_bar, text="Cancel", command=close_dialog, style="Ghost.TButton").pack(
            side=tk.RIGHT, padx=(12, 0)
        )
        ttk.Button(button_bar, text="Save", command=save_settings, style="Primary.TButton").pack(side=tk.RIGHT)

        dialog.wait_window()

    # ------------------------------------------------------------------
    # Refresh helpers
    # ------------------------------------------------------------------
    def _refresh_ui(self) -> None:
        if not self._root or not self._tree:
            return

        snapshot = collect_overview(self._repository)

        metrics = {
            "Classes": snapshot.class_count,
            "Modules": snapshot.module_count,
            "Lectures": snapshot.lecture_count,
        }

        for label, value in metrics.items():
            if label in self._stat_vars:
                self._stat_vars[label].set(str(value))

        if self._asset_text_var is not None:
            asset_texts = [
                f"{ASSET_LABELS[key]}: {snapshot.asset_totals.get(key, 0)}"
                for key in ("audio", "slides", "transcript", "notes", "slide_images")
            ]
            self._asset_text_var.set("\n".join(asset_texts))

        preferred = None
        if self._selected_lecture_id is not None:
            preferred = f"lecture:{self._selected_lecture_id}"
        elif self._tree.selection():
            preferred = self._tree.selection()[0]

        self._populate_tree(self._tree, snapshot, preferred_selection=preferred)

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------
    def _get_selected_overview(self) -> Optional[LectureOverview]:
        if not self._tree:
            return None
        selection = self._tree.selection()
        if not selection:
            return None
        kind, payload, _module, _class = self._tree_items.get(selection[0], ("", None, None, None))
        if kind == "lecture" and isinstance(payload, LectureOverview):
            return payload
        return None


__all__ = ["DesktopUI"]
