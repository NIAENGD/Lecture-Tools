"""Tests for slide processing helpers."""

import sys
from types import ModuleType
from typing import Any, Dict, List

import numpy as np
import pytest

from app.processing.slides import (
    PyMuPDFSlideConverter,
    SlideConversionDependencyError,
    _TesseractOCREngine,
)


def test_should_include_image_when_text_only():
    converter = PyMuPDFSlideConverter(dpi=72)

    assert (
        converter._should_include_image(
            has_text=True,
            has_raster_images=False,
            has_vector_drawings=False,
            has_visual_regions=False,
        )
        is False
    )


def test_should_include_image_when_no_text():
    converter = PyMuPDFSlideConverter(dpi=72)

    assert (
        converter._should_include_image(
            has_text=False,
            has_raster_images=False,
            has_vector_drawings=False,
            has_visual_regions=False,
        )
        is False
    )


def test_should_include_image_with_drawings_or_images():
    converter = PyMuPDFSlideConverter(dpi=72)

    assert (
        converter._should_include_image(
            has_text=True,
            has_raster_images=True,
            has_vector_drawings=False,
            has_visual_regions=False,
        )
        is True
    )

    assert (
        converter._should_include_image(
            has_text=True,
            has_raster_images=False,
            has_vector_drawings=True,
            has_visual_regions=False,
        )
        is True
    )


def test_should_include_image_with_visual_regions():
    converter = PyMuPDFSlideConverter(dpi=72)

    assert (
        converter._should_include_image(
            has_text=True,
            has_raster_images=False,
            has_vector_drawings=False,
            has_visual_regions=True,
        )
        is True
    )


class DummyRect:
    """Simple rectangle mimic for tests."""

    def __init__(self, x0: float, y0: float, x1: float, y1: float) -> None:
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1


class DummyPage:
    """Simplified PyMuPDF page interface for testing detection helpers."""

    def __init__(self, blocks: List[Dict[str, Any]], drawings: List[Dict[str, Any]]) -> None:
        self._blocks = blocks
        self._drawings = drawings

    def get_text(self, mode: str) -> Dict[str, Any]:  # pragma: no cover - simple shim
        if mode != "rawdict":
            raise ValueError("Only rawdict mode is supported in DummyPage")
        return {"blocks": self._blocks}

    def get_drawings(self) -> List[Dict[str, Any]]:  # pragma: no cover - simple shim
        return self._drawings


def test_detect_visual_regions_from_image_blocks():
    converter = PyMuPDFSlideConverter(dpi=72)
    page = DummyPage(
        blocks=[{"type": 1, "bbox": [10, 20, 110, 180]}],
        drawings=[],
    )

    regions = converter._detect_visual_regions(page)

    assert regions == [(4.0, 14.0, 116.0, 186.0)]


def test_detect_visual_regions_merges_overlapping_rectangles():
    converter = PyMuPDFSlideConverter(dpi=72)
    page = DummyPage(
        blocks=[
            {"type": 1, "bbox": [50, 50, 150, 150]},
            {"type": 1, "bbox": [140, 140, 220, 220]},
        ],
        drawings=[],
    )

    regions = converter._detect_visual_regions(page)

    assert regions == [(44.0, 44.0, 226.0, 226.0)]


def test_detect_visual_regions_includes_drawings():
    converter = PyMuPDFSlideConverter(dpi=72)
    page = DummyPage(
        blocks=[],
        drawings=[{"rect": DummyRect(20, 30, 120, 90)}],
    )

    regions = converter._detect_visual_regions(page)

    assert regions == [(14.0, 24.0, 126.0, 96.0)]


def test_detect_visual_regions_filters_small_shapes():
    converter = PyMuPDFSlideConverter(dpi=72)
    page = DummyPage(
        blocks=[{"type": 1, "bbox": [10, 10, 15, 15]}],
        drawings=[],
    )

    regions = converter._detect_visual_regions(page)

    assert regions == []


@pytest.mark.parametrize(
    "rectangles,expected",
    [
        ([], None),
        ([(0.0, 0.0, 10.0, 10.0)], (0.0, 0.0, 10.0, 10.0)),
        ([(0.0, 0.0, 10.0, 10.0), (5.0, 5.0, 12.0, 30.0)], (0.0, 0.0, 12.0, 30.0)),
    ],
)
def test_union_rectangles(rectangles, expected):
    converter = PyMuPDFSlideConverter(dpi=72)

    assert converter._union_rectangles(rectangles) == expected


def test_prepare_engine_falls_back_to_tesseract(monkeypatch):
    converter = PyMuPDFSlideConverter(dpi=72)

    missing_paddle = ModuleType("paddleocr")
    monkeypatch.setitem(sys.modules, "paddleocr", missing_paddle)

    dummy_tesseract = ModuleType("pytesseract")

    class DummyOutput:
        DICT = "dict"

    class DummyTesseractError(RuntimeError):
        pass

    def fake_get_version():
        return "5.0.0"

    def fake_image_to_data(image, lang: str, output_type: str) -> Dict[str, List[str]]:
        return {
            "text": ["Hello", ""],
            "conf": ["90", "-1"],
            "left": ["1", "0"],
            "top": ["2", "0"],
            "width": ["20", "0"],
            "height": ["10", "0"],
        }

    dummy_tesseract.Output = DummyOutput()
    dummy_tesseract.TesseractNotFoundError = DummyTesseractError
    dummy_tesseract.get_tesseract_version = fake_get_version
    dummy_tesseract.image_to_data = fake_image_to_data

    monkeypatch.setitem(sys.modules, "pytesseract", dummy_tesseract)

    engine = converter._prepare_ocr_engine()

    assert isinstance(engine, _TesseractOCREngine)

    result = engine.ocr(np.zeros((5, 5), dtype=np.uint8))
    assert result and result[0]["text"] == "Hello"
    assert result[0]["score"] == pytest.approx(0.9)


def test_prepare_engine_raises_when_no_backends(monkeypatch):
    converter = PyMuPDFSlideConverter(dpi=72)

    missing_paddle = ModuleType("paddleocr")
    monkeypatch.setitem(sys.modules, "paddleocr", missing_paddle)

    missing_tesseract = ModuleType("pytesseract")
    monkeypatch.setitem(sys.modules, "pytesseract", missing_tesseract)

    with pytest.raises(SlideConversionDependencyError):
        converter._prepare_ocr_engine()
