"""Configuration loading utilities for the Lecture Tools application."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


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
        storage_root = (base_path / mapping["storage_root"]).resolve()
        database_file = (base_path / mapping["database_file"]).resolve()
        assets_root = (base_path / mapping["assets_root"]).resolve()
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
