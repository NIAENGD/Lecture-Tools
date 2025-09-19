"""Persistence helpers for user interface settings."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from ..config import AppConfig


ThemeName = Literal["dark", "light"]


@dataclass
class UISettings:
    """Container for customisable UI options."""

    theme: ThemeName = "dark"
    whisper_model: str = "base"
    whisper_compute_type: str = "int8"
    whisper_beam_size: int = 5
    slide_dpi: int = 200


class SettingsStore:
    """Load and store :class:`UISettings` alongside other persisted assets."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._path = config.storage_root / "settings.json"

    @property
    def path(self) -> Path:
        return self._path

    def load(self) -> UISettings:
        if not self._path.exists():
            return UISettings()

        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return UISettings()

        settings = UISettings()
        for field, value in payload.items():
            if hasattr(settings, field):
                setattr(settings, field, value)
        return settings

    def save(self, settings: UISettings) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = asdict(settings)
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")


__all__ = ["SettingsStore", "ThemeName", "UISettings"]
