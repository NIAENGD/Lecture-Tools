"""Slide processing helpers."""

from __future__ import annotations

import logging
from io import BytesIO
from pathlib import Path
from typing import Iterable, Optional, Tuple
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image

from ..services.ingestion import SlideConverter


LOGGER = logging.getLogger(__name__)


class PyMuPDFSlideConverter(SlideConverter):
    """Slide converter that renders PDF slides via :mod:`PyMuPDF`."""

    def __init__(self, dpi: int = 200) -> None:
        self._dpi = dpi
        LOGGER.debug("PyMuPDFSlideConverter initialised with dpi=%s", dpi)

    def convert(
        self,
        slide_path: Path,
        output_dir: Path,
        *,
        page_range: Optional[Tuple[int, int]] = None,
    ) -> Iterable[Path]:
        LOGGER.debug(
            "Starting slide conversion for %s into %s (page_range=%s, dpi=%s)",
            slide_path,
            output_dir,
            page_range,
            self._dpi,
        )
        try:
            import fitz  # type: ignore
        except ImportError as exc:  # pragma: no cover - runtime check
            raise RuntimeError("PyMuPDF (fitz) is not installed") from exc

        output_dir.mkdir(parents=True, exist_ok=True)
        scale = self._dpi / 72
        matrix = fitz.Matrix(scale, scale)
        LOGGER.debug("Rendering scale factor computed as %.2f", scale)

        with fitz.open(slide_path) as document:
            page_count = document.page_count
            if page_range is None:
                start_index = 0
                end_index = page_count - 1
            else:
                start, end = page_range
                # Convert to zero-based indices and clamp to bounds.
                start_index = max(0, min(page_count - 1, start - 1))
                end_index = max(start_index, min(page_count - 1, end - 1))

            if page_count == 0 or start_index > end_index:
                LOGGER.debug(
                    "Slide document contains no convertible pages (page_count=%s, start_index=%s, end_index=%s)",
                    page_count,
                    start_index,
                    end_index,
                )
                return []

            stem = slide_path.stem or "slides"
            zip_path = self._prepare_destination(output_dir, stem)
            LOGGER.debug("Slide conversion output will be zipped to %s", zip_path)

            with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as archive:
                for page_number in range(start_index, end_index + 1):
                    pix = document.load_page(page_number).get_pixmap(matrix=matrix, alpha=False)
                    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    buffer = BytesIO()
                    image.save(buffer, format="PNG")
                    buffer.seek(0)
                    archive.writestr(f"page_{page_number + 1:03d}.png", buffer.read())
                    LOGGER.debug(
                        "Converted slide page %s (size=%sx%s)",
                        page_number + 1,
                        pix.width,
                        pix.height,
                    )

        return [zip_path]

    @staticmethod
    def _prepare_destination(output_dir: Path, stem: str) -> Path:
        base_name = f"{stem}.zip"
        candidate = output_dir / base_name
        counter = 1
        while candidate.exists():
            candidate = output_dir / f"{stem}-{counter}.zip"
            counter += 1
        LOGGER.debug("Resolved unique slide archive name: %s", candidate)
        return candidate


__all__ = ["PyMuPDFSlideConverter"]
