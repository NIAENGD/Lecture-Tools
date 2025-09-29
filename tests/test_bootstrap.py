from pathlib import Path

import pytest

import app.config as config_module
from app.bootstrap import BootstrapError, Bootstrapper
from app.config import AppConfig


def test_bootstrapper_raises_when_storage_directory_unwritable(
    tmp_path: Path, monkeypatch
) -> None:
    storage_root = tmp_path / "storage"
    assets_root = tmp_path / "assets"
    database_file = storage_root / "lectures.db"

    config = AppConfig(
        storage_root=storage_root,
        database_file=database_file,
        assets_root=assets_root,
    )

    original_ensure = config_module._ensure_writable_directory

    def fake_ensure(path: Path) -> bool:
        if path.resolve() == storage_root.resolve():
            return False
        return original_ensure(path)

    monkeypatch.setattr(config_module, "_ensure_writable_directory", fake_ensure)

    bootstrapper = Bootstrapper(config)

    with pytest.raises(BootstrapError) as excinfo:
        bootstrapper.initialize()

    assert "storage" in str(excinfo.value).lower()


