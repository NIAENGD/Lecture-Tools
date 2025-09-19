"""Slide processing helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List

from PIL import Image

from ..services.ingestion import SlideConverter


class PyMuPDFSlideConverter(SlideConverter):
    """Slide converter that renders PDF slides via :mod:`PyMuPDF`."""

    def __init__(self, dpi: int = 200) -> None:
        self._dpi = dpi

    def convert(self, slide_path: Path, output_dir: Path) -> Iterable[Path]:
        try:
            import fitz  # type: ignore
        except ImportError as exc:  # pragma: no cover - runtime check
            raise RuntimeError("PyMuPDF (fitz) is not installed") from exc

        output_dir.mkdir(parents=True, exist_ok=True)
        scale = self._dpi / 72
        matrix = fitz.Matrix(scale, scale)

        slides: List[Path] = []
        with fitz.open(slide_path) as document:
            page_count = document.page_count
            for index in range(0, page_count, 2):
                pages = []
                for offset in range(2):
                    page_number = index + offset
                    if page_number >= page_count:
                        break
                    pix = document.load_page(page_number).get_pixmap(matrix=matrix, alpha=False)
                    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    pages.append(image)
                if not pages:
                    continue
                combined = self._combine_pages(pages)
                filename = output_dir / f"slide_{index // 2 + 1:03d}.png"
                combined.save(filename, format="PNG")
                slides.append(filename)
        return slides

    @staticmethod
    def _combine_pages(pages: List[Image.Image]) -> Image.Image:
        if len(pages) == 1:
            return pages[0]

        width = max(image.width for image in pages)
        total_height = sum(image.height for image in pages)
        canvas = Image.new("RGB", (width, total_height), color=(255, 255, 255))

        offset = 0
        for image in pages:
            if image.width != width:
                background = Image.new("RGB", (width, image.height), color=(255, 255, 255))
                background.paste(image, ((width - image.width) // 2, 0))
                image = background
            canvas.paste(image, (0, offset))
            offset += image.height

        return canvas


__all__ = ["PyMuPDFSlideConverter"]
