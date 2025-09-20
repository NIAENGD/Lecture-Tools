"""Utility helpers for consistent asset naming."""

from __future__ import annotations

from datetime import datetime
import re
from typing import Optional

__all__ = [
    "slugify",
    "build_asset_stem",
    "build_timestamped_name",
]


def slugify(value: str) -> str:
    """Return a filesystem-friendly representation of *value*."""

    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "item"


def build_asset_stem(*parts: str) -> str:
    """Return a slugified stem joined from the provided *parts*."""

    cleaned = [slugify(part) for part in parts if part]
    return "-".join(cleaned) if cleaned else "item"


def build_timestamped_name(
    stem: str,
    *,
    timestamp: Optional[str] = None,
    sequence: Optional[int] = None,
    extension: str = "",
) -> str:
    """Return a timestamped name for *stem* with an optional *extension*."""

    stamp = timestamp or datetime.now().strftime("%Y%m%d-%H%M%S")
    components = [stem or "item", stamp]
    if sequence is not None:
        components.append(f"{sequence:03d}")
    suffix = ""
    if extension:
        suffix = extension if extension.startswith(".") else f".{extension}"
        suffix = suffix.lower()
    return "-".join(components) + suffix
