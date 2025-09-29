"""Configuration loading utilities for the Lecture Tools application."""

from __future__ import annotations

import contextlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple


LOGGER = logging.getLogger(__name__)


_PERMISSION_SENTINEL = ".lecture_tools_write_check"


def _ensure_writable_directory(path: Path) -> bool:
    """Return ``True`` if *path* can be created and written to."""

    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False

    test_file = path / _PERMISSION_SENTINEL
    try:
        with test_file.open("w", encoding="utf-8") as handle:
            handle.write("ok")
    except OSError:
        return False
    finally:
        with contextlib.suppress(OSError):
            test_file.unlink()

    return True


def _select_writable_directory(
    preferred: Path,
    *,
    label: str,
    fallbacks: Iterable[Path] = (),
) -> Tuple[Path, bool]:
    """Return a usable directory based on ``preferred`` and ``fallbacks``.

    The helper attempts to create ``preferred`` and returns it when writable. If
    the preferred location is unavailable, each candidate in ``fallbacks`` is
    tried in order. The first writable fallback is returned along with a flag
    indicating that a fallback was used. When no candidate can be prepared the
    original ``preferred`` path is returned.
    """

    preferred = preferred.resolve()
    if _ensure_writable_directory(preferred):
        return preferred, False

    for fallback in fallbacks:
        candidate = fallback.resolve()
        if candidate == preferred:
            continue
        if _ensure_writable_directory(candidate):
            LOGGER.warning(
                "Preferred %s directory '%s' is not writable; using fallback '%s'.",
                label,
                preferred,
                candidate,
            )
            return candidate, True

    LOGGER.warning(
        "%s directory '%s' is not writable and no fallback is available.",
        label.capitalize(),
        preferred,
    )
    return preferred, False


@dataclass(frozen=True)
class AppConfig:
    """Simple container describing runtime paths for the application."""

    storage_root: Path
    database_file: Path
    assets_root: Path

    @property
    def archive_root(self) -> Path:
        """Location used for temporary export archives."""

        return (self.storage_root / "_archives").resolve()

    @classmethod
    def from_mapping(cls, mapping: Dict[str, Any], *, base_path: Path) -> "AppConfig":
        preferred_storage = (base_path / mapping["storage_root"]).resolve()
        storage_fallback = Path.home() / ".lecture_tools" / "storage"
        storage_root, storage_fallback_used = _select_writable_directory(
            preferred_storage,
            label="storage",
            fallbacks=(storage_fallback,),
        )

        database_file = (base_path / mapping["database_file"]).resolve()

        preferred_assets = (base_path / mapping["assets_root"]).resolve()
        assets_root, _ = _select_writable_directory(
            preferred_assets,
            label="assets",
            fallbacks=(storage_root / "_assets",),
        )

        if storage_fallback_used:
            try:
                relative_database = database_file.relative_to(preferred_storage)
            except ValueError:
                relative_database = None
            if relative_database is not None:
                fallback_database = (storage_root / relative_database).resolve()
                if _ensure_writable_directory(fallback_database.parent):
                    LOGGER.warning(
                        "Preferred database location '%s' is not writable; using fallback '%s'.",
                        database_file,
                        fallback_database,
                    )
                    database_file = fallback_database

        database_parent = database_file.parent
        if not _ensure_writable_directory(database_parent):
            fallback_database = (storage_root / database_file.name).resolve()
            if fallback_database != database_file and _ensure_writable_directory(
                fallback_database.parent
            ):
                LOGGER.warning(
                    "Preferred database location '%s' is not writable; using fallback '%s'.",
                    database_file,
                    fallback_database,
                )
                database_file = fallback_database
            else:
                LOGGER.warning(
                    "Database location '%s' is not writable and no fallback is available.",
                    database_file,
                )

        return cls(storage_root=storage_root, database_file=database_file, assets_root=assets_root)


def load_config(config_path: Path | None = None) -> AppConfig:
    """Load the application configuration from ``config/default.json`` by default."""

    base_path = Path(__file__).resolve().parent.parent
    if config_path is None:
        config_path = base_path / "config" / "default.json"

    with config_path.open("r", encoding="utf-8") as config_file:
        raw_config = json.load(config_file)

    return AppConfig.from_mapping(raw_config, base_path=base_path)


__all__ = ["AppConfig", "load_config"]
