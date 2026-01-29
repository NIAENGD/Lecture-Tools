"""Persistence helpers for user interface settings."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Literal, Tuple

from ..config import AppConfig


DisplayModeName = Literal["system", "bright", "dark"]
ThemeName = Literal[
    "vibrant",
    "serene",
    "noir",
    "solar",
    "cyber",
    "pastel",
    "obsidian",
    "ethereal",
]
EffectsLevelName = Literal["none", "low", "mid", "high"]
DISPLAY_MODE_OPTIONS: Tuple[DisplayModeName, ...] = ("system", "bright", "dark")
THEME_OPTIONS: Tuple[ThemeName, ...] = (
    "vibrant",
    "serene",
    "noir",
    "solar",
    "cyber",
    "pastel",
    "obsidian",
    "ethereal",
)
EFFECTS_LEVEL_OPTIONS: Tuple[EffectsLevelName, ...] = ("none", "low", "mid", "high")
DEFAULT_DISPLAY_MODE: DisplayModeName = "system"
DEFAULT_THEME: ThemeName = "vibrant"
DEFAULT_VISUAL_EFFECTS: EffectsLevelName = "mid"
_THEME_ALIASES: Dict[str, ThemeName] = {
    "bright-vibrant": "vibrant",
    "bright-serene": "serene",
    "bright-kawaii": "pastel",
    "dark-cool": "vibrant",
    "dark-aurora": "serene",
    "dark-midnight": "obsidian",
    "light": "vibrant",
    "dark": "obsidian",
}
_LEGACY_THEME_MAP: Dict[str, Tuple[DisplayModeName, ThemeName]] = {
    "system": ("system", "vibrant"),
    "bright-vibrant": ("bright", "vibrant"),
    "bright-serene": ("bright", "serene"),
    "bright-kawaii": ("bright", "pastel"),
    "dark-cool": ("dark", "vibrant"),
    "dark-aurora": ("dark", "serene"),
    "dark-midnight": ("dark", "obsidian"),
    "light": ("bright", "vibrant"),
    "dark": ("dark", "obsidian"),
}


def normalize_display_mode(value: object) -> DisplayModeName:
    """Coerce arbitrary input to a supported display mode."""

    if isinstance(value, str):
        candidate = value.strip().lower()
    else:
        candidate = ""

    for option in DISPLAY_MODE_OPTIONS:
        if candidate == option:
            return option

    if candidate in {"light", "bright"}:
        return "bright"
    if candidate in {"dark", "night"}:
        return "dark"

    return DEFAULT_DISPLAY_MODE


def normalize_theme(value: object) -> ThemeName:
    """Coerce arbitrary input to a supported theme choice."""

    if isinstance(value, str):
        candidate = value.strip().lower()
    else:
        candidate = ""

    for option in THEME_OPTIONS:
        if candidate == option:
            return option

    alias = _THEME_ALIASES.get(candidate)
    if alias is not None:
        return alias

    return DEFAULT_THEME


def normalize_visual_effects(value: object) -> EffectsLevelName:
    """Coerce arbitrary input to a supported visual effects intensity."""

    if isinstance(value, str):
        candidate = value.strip().lower()
    else:
        candidate = ""

    for option in EFFECTS_LEVEL_OPTIONS:
        if candidate == option:
            return option

    if candidate in {"medium", "default"}:
        return "mid"
    if candidate in {"off", "disabled", "disable", "no", "no-effects", "zero", "flat"}:
        return "none"

    return DEFAULT_VISUAL_EFFECTS


def resolve_theme_preferences(
    theme_value: object, display_mode_value: object
) -> Tuple[DisplayModeName, ThemeName]:
    """Normalise theme and display mode selections, migrating legacy options."""

    inferred_display: DisplayModeName = DEFAULT_DISPLAY_MODE
    inferred_theme: ThemeName = DEFAULT_THEME
    legacy_mapping: Tuple[DisplayModeName, ThemeName] | None = None

    if isinstance(theme_value, str):
        trimmed = theme_value.strip().lower()
        legacy_mapping = _LEGACY_THEME_MAP.get(trimmed)
        if legacy_mapping is not None:
            inferred_display, inferred_theme = legacy_mapping
        else:
            inferred_theme = normalize_theme(trimmed)
    else:
        inferred_theme = DEFAULT_THEME

    explicit_display: DisplayModeName | None = None
    if display_mode_value is not None:
        explicit_display = normalize_display_mode(display_mode_value)

    if explicit_display and explicit_display != DEFAULT_DISPLAY_MODE:
        inferred_display = explicit_display
    elif explicit_display == DEFAULT_DISPLAY_MODE:
        if legacy_mapping is not None and legacy_mapping[0] != DEFAULT_DISPLAY_MODE:
            inferred_display = legacy_mapping[0]
        else:
            inferred_display = explicit_display

    return inferred_display, normalize_theme(inferred_theme)
LanguageCode = Literal["en", "zh", "es", "fr"]


LOGGER = logging.getLogger(__name__)
_SENSITIVE_SETTINGS_FIELDS = {"update_sudo_password"}


@dataclass
class UISettings:
    """Container for customisable UI options."""

    display_mode: DisplayModeName = DEFAULT_DISPLAY_MODE
    theme: ThemeName = DEFAULT_THEME
    visual_effects: EffectsLevelName = DEFAULT_VISUAL_EFFECTS
    language: LanguageCode = "en"
    whisper_model: str = "base"
    whisper_compute_type: str = "int8"
    whisper_beam_size: int = 5
    slide_dpi: int = 200
    audio_mastering_enabled: bool = True
    debug_enabled: bool = False
    update_sudo_password: str | None = None


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
            LOGGER.debug("Settings file %s does not exist; using defaults", self._path)
            return UISettings()

        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            LOGGER.debug("Settings file %s is invalid JSON; using defaults", self._path)
            return UISettings()

        settings = UISettings()
        for field, value in payload.items():
            if hasattr(settings, field):
                setattr(settings, field, value)
                if field in _SENSITIVE_SETTINGS_FIELDS:
                    LOGGER.debug("Loaded UI setting %s=<hidden>", field)
                else:
                    LOGGER.debug("Loaded UI setting %s=%s", field, value)
        display_mode, theme = resolve_theme_preferences(
            payload.get("theme", settings.theme), payload.get("display_mode", settings.display_mode)
        )
        settings.display_mode = display_mode
        settings.theme = theme
        settings.visual_effects = normalize_visual_effects(
            payload.get("visual_effects", settings.visual_effects)
        )
        return settings

    def save(self, settings: UISettings) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = asdict(settings)
        data["display_mode"] = normalize_display_mode(data.get("display_mode"))
        data["theme"] = normalize_theme(data.get("theme"))
        data["visual_effects"] = normalize_visual_effects(data.get("visual_effects"))
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        LOGGER.debug("Persisted UI settings to %s", self._path)


__all__ = [
    "DEFAULT_DISPLAY_MODE",
    "DEFAULT_THEME",
    "DEFAULT_VISUAL_EFFECTS",
    "DISPLAY_MODE_OPTIONS",
    "EFFECTS_LEVEL_OPTIONS",
    "SettingsStore",
    "THEME_OPTIONS",
    "EffectsLevelName",
    "DisplayModeName",
    "ThemeName",
    "UISettings",
    "normalize_display_mode",
    "normalize_theme",
    "normalize_visual_effects",
    "resolve_theme_preferences",
]
