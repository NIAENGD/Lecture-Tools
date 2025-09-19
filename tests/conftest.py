from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.bootstrap import Bootstrapper
from app.config import AppConfig


@pytest.fixture()
def temp_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AppConfig:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    config_file = config_dir / "default.json"
    config_file.write_text(
        """
        {
            \"storage_root\": \"storage\",\n
            \"database_file\": \"storage/lectures.db\",\n
            \"assets_root\": \"assets\"\n
        }
        """,
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)

    config = AppConfig.from_mapping(
        {
            "storage_root": "storage",
            "database_file": "storage/lectures.db",
            "assets_root": "assets",
        },
        base_path=tmp_path,
    )

    Bootstrapper(config).initialize()
    return config

