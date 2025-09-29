from pathlib import Path

import app.config as config_module
from app.config import AppConfig


def test_assets_root_falls_back_when_preferred_is_unusable(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()

    preferred_assets = tmp_path / "assets"
    preferred_assets.write_text("not a directory", encoding="utf-8")

    config = AppConfig.from_mapping(
        {
            "storage_root": "storage",
            "database_file": "storage/lectures.db",
            "assets_root": "assets",
        },
        base_path=tmp_path,
    )

    expected_fallback = (storage / "_assets").resolve()
    assert config.assets_root == expected_fallback
    assert expected_fallback.exists()
    assert expected_fallback.is_dir()


def test_storage_root_falls_back_when_preferred_is_unusable(
    tmp_path: Path, monkeypatch
) -> None:
    home_dir = tmp_path / "home"
    monkeypatch.setattr(config_module.Path, "home", lambda: home_dir)

    preferred_storage = tmp_path / "storage"
    preferred_storage.write_text("not a directory", encoding="utf-8")

    preferred_assets = tmp_path / "assets"
    preferred_assets.write_text("not a directory", encoding="utf-8")

    config = AppConfig.from_mapping(
        {
            "storage_root": "storage",
            "database_file": "storage/lectures.db",
            "assets_root": "assets",
        },
        base_path=tmp_path,
    )

    expected_storage = (home_dir / ".lecture_tools" / "storage").resolve()
    expected_database = (expected_storage / "lectures.db").resolve()
    expected_assets = (expected_storage / "_assets").resolve()

    assert config.storage_root == expected_storage
    assert config.database_file == expected_database
    assert config.assets_root == expected_assets
    assert expected_storage.exists()
    assert expected_assets.exists()
