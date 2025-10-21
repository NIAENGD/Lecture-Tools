"""Slide processing helpers."""

from __future__ import annotations

import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, List, Mapping, Optional, Tuple, Union
from zipfile import ZIP_DEFLATED, ZipFile

from ..services.ingestion import SlideConversionResult, SlideConverter


LOGGER = logging.getLogger(__name__)


class SlideConversionError(RuntimeError):
    """Base class for slide conversion errors."""


class SlideConversionDependencyError(SlideConversionError):
    """Raised when the configured converter cannot operate due to a missing dependency."""


def get_pdf_page_count(source: Union[Path, bytes]) -> int:
    """Return the number of pages contained in a PDF document."""

    try:
        import fitz  # type: ignore
    except ImportError as exc:  # pragma: no cover - runtime check
        raise SlideConversionDependencyError("PyMuPDF (fitz) is not installed") from exc

    document = None
    try:
        if isinstance(source, Path):
            document = fitz.open(source)
        else:
            document = fitz.open(stream=source, filetype="pdf")
        return int(document.page_count)
    except Exception as error:  # pragma: no cover - defensive catch
        raise SlideConversionError("Unable to inspect PDF document") from error
    finally:
        if document is not None:
            document.close()


def render_pdf_page(
    source: Union[Path, bytes],
    page_number: int,
    *,
    dpi: int = 200,
) -> bytes:
    """Render a single PDF page to PNG bytes."""

    if page_number < 1:
        raise SlideConversionError("Invalid PDF page index")

    try:
        import fitz  # type: ignore
    except ImportError as exc:  # pragma: no cover - runtime check
        raise SlideConversionDependencyError("PyMuPDF (fitz) is not installed") from exc

    document = None
    try:
        if isinstance(source, Path):
            document = fitz.open(source)
        else:
            document = fitz.open(stream=source, filetype="pdf")

        total_pages = int(document.page_count)
        if page_number > total_pages:
            raise SlideConversionError("PDF page is out of range")

        scale = float(dpi) / 72.0
        matrix = fitz.Matrix(scale, scale)
        page = document.load_page(page_number - 1)
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        return pixmap.tobytes("png")
    except SlideConversionError:
        raise
    except Exception as error:  # pragma: no cover - defensive catch
        raise SlideConversionError("Unable to render PDF page") from error
    finally:
        if document is not None:
            document.close()


class PyMuPDFSlideConverter(SlideConverter):
    """Slide converter that extracts Markdown notes and images from PDFs."""

    def __init__(self, dpi: int = 200, *, ocr_language: str = "en") -> None:
        self._dpi = dpi
        self._ocr_language = ocr_language
        self._ocr_engine: Any | None = None
        LOGGER.debug(
            "PyMuPDFSlideConverter initialised with dpi=%s, ocr_language=%s",
            dpi,
            ocr_language,
        )

    def _prepare_ocr_engine(self) -> Any:
        if self._ocr_engine is not None:
            return self._ocr_engine

        try:
            from paddleocr import PaddleOCR  # type: ignore
        except ImportError as exc:  # pragma: no cover - runtime dependency check
            raise SlideConversionDependencyError("PaddleOCR is not installed") from exc

        try:
            engine = PaddleOCR(use_angle_cls=True, lang=self._ocr_language)
        except Exception as error:  # noqa: BLE001 - PaddleOCR may raise arbitrary errors
            LOGGER.exception("Failed to initialise PaddleOCR: %s", error)
            raise SlideConversionError(f"Failed to initialise PaddleOCR: {error}") from error

        self._ocr_engine = engine
        return engine

    def convert(
        self,
        slide_path: Path,
        bundle_dir: Path,
        notes_dir: Path,
        *,
        page_range: Optional[Tuple[int, int]] = None,
        progress_callback: Optional[Callable[[int, Optional[int]], None]] = None,
    ) -> SlideConversionResult:
        LOGGER.debug(
            "Starting slide conversion for %s into bundle=%s notes=%s (page_range=%s, dpi=%s)",
            slide_path,
            bundle_dir,
            notes_dir,
            page_range,
            self._dpi,
        )

        try:
            import fitz  # type: ignore
        except ImportError as exc:  # pragma: no cover - runtime dependency check
            raise SlideConversionDependencyError("PyMuPDF (fitz) is not installed") from exc

        try:
            import numpy as np  # type: ignore
        except ImportError as exc:  # pragma: no cover - runtime dependency check
            raise SlideConversionDependencyError(
                "NumPy is required for slide conversion"
            ) from exc

        try:
            from PIL import Image  # type: ignore
        except ImportError as exc:  # pragma: no cover - runtime dependency check
            raise SlideConversionDependencyError(
                "Pillow is required for slide conversion"
            ) from exc

        engine = self._prepare_ocr_engine()

        bundle_dir.mkdir(parents=True, exist_ok=True)
        notes_dir.mkdir(parents=True, exist_ok=True)

        stem = slide_path.stem or "slides"
        asset_dir = notes_dir / f"{stem}-assets"
        if asset_dir.exists():
            shutil.rmtree(asset_dir)
        asset_dir.mkdir(parents=True, exist_ok=True)

        markdown_path = notes_dir / f"{stem}-ocr.md"
        if markdown_path.exists():
            markdown_path.unlink()

        matrix = fitz.Matrix(self._dpi / 72, self._dpi / 72)
        render_dpi = self._dpi
        generated_at = datetime.now(timezone.utc).isoformat()
        page_sections: List[str] = []
        processed_pages = 0
        total_pages: Optional[int] = None
        actual_start_page: Optional[int] = None
        actual_end_page: Optional[int] = None
        document_page_count: Optional[int] = None

        def _normalise_dict(candidate: Mapping[str, Any]) -> Mapping[str, Any]:
            line = candidate.get("line")
            if isinstance(line, Mapping):
                return line
            return candidate

        def _extract_entry(raw: Any) -> Optional[Tuple[List[Any], str, float]]:
            box: List[Any] = []
            text = ""
            confidence = 1.0

            candidate = raw
            if isinstance(candidate, Mapping):
                candidate = _normalise_dict(candidate)
                box = list(
                    candidate.get("points")
                    or candidate.get("box")
                    or candidate.get("bbox")
                    or []
                )
                text_value = (
                    candidate.get("text")
                    or candidate.get("transcription")
                    or candidate.get("label")
                )
                if isinstance(text_value, str):
                    text = text_value.strip()
                confidence_value = None
                for key in ("score", "confidence", "probability", "prob", "certainty"):
                    if key in candidate:
                        confidence_value = candidate[key]
                        break
                if confidence_value is not None:
                    try:
                        confidence = float(confidence_value)
                    except (TypeError, ValueError):
                        confidence = 1.0
            elif isinstance(candidate, (list, tuple)):
                if candidate and isinstance(candidate[0], (list, tuple)):
                    box = list(candidate[0])
                if len(candidate) > 1:
                    text_info = candidate[1]
                    if isinstance(text_info, Mapping):
                        text = str(
                            text_info.get("text")
                            or text_info.get("transcription")
                            or text_info.get("label")
                            or ""
                        ).strip()
                        confidence_value = None
                        for key in ("score", "confidence", "probability", "prob", "certainty"):
                            if key in text_info:
                                confidence_value = text_info[key]
                                break
                        if confidence_value is not None:
                            try:
                                confidence = float(confidence_value)
                            except (TypeError, ValueError):
                                confidence = 1.0
                    elif isinstance(text_info, (list, tuple)) and text_info:
                        text = str(text_info[0]).strip()
                        if len(text_info) > 1:
                            try:
                                confidence = float(text_info[1])
                            except (TypeError, ValueError):
                                confidence = 1.0
                    elif isinstance(text_info, str):
                        text = text_info.strip()
            else:
                return None

            if not text:
                return None
            return (box, text, confidence)

        def _sort_key(box: Iterable[Any]) -> Tuple[float, float]:
            points = list(box) if isinstance(box, Iterable) else []
            if not points:
                return (0.0, 0.0)
            try:
                y_values = [float(point[1]) for point in points]
                x_values = [float(point[0]) for point in points]
            except Exception:  # pragma: no cover - defensive fallback
                return (0.0, 0.0)
            avg_y = sum(y_values) / len(y_values)
            avg_x = sum(x_values) / len(x_values)
            return (avg_y, avg_x)

        with fitz.open(slide_path) as document:
            page_count = document.page_count
            document_page_count = page_count
            if page_range is None:
                start_index = 0
                end_index = page_count - 1
            else:
                start, end = page_range
                start_index = max(0, min(page_count - 1, start - 1))
                end_index = max(start_index, min(page_count - 1, end - 1))

            total_pages = end_index - start_index + 1 if page_count else 0
            if page_count == 0 or start_index > end_index:
                LOGGER.debug(
                    "Slide document contains no convertible pages (page_count=%s, start_index=%s, end_index=%s)",
                    page_count,
                    start_index,
                    end_index,
                )
                total_pages = 0
            else:
                actual_start_page = start_index + 1
                actual_end_page = end_index + 1

            if progress_callback is not None:
                try:
                    progress_callback(0, total_pages or None)
                except Exception:  # pragma: no cover - defensive against callback errors
                    LOGGER.exception("Slide conversion progress callback failed at start")

            for processed_index, page_number in enumerate(
                range(start_index, end_index + 1),
                start=1,
            ):
                if page_count == 0 or start_index > end_index:
                    break

                page = document.load_page(page_number)
                pix = page.get_pixmap(matrix=matrix, alpha=False)
                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                image_name = f"slide-{page_number + 1:03d}.png"
                image_path = asset_dir / image_name
                image.save(image_path, format="PNG")

                array = np.asarray(image)
                try:
                    recognition = engine.ocr(array)
                except Exception as error:  # noqa: BLE001 - OCR may raise arbitrary errors
                    message = f"Slide text extraction failed: {error}"
                    LOGGER.exception(message)
                    raise SlideConversionError(message) from error

                fallback_lines = [
                    line.strip()
                    for line in page.get_text("text").splitlines()
                    if line.strip()
                ]

                parsed_entries: List[Tuple[List[Any], str, float]] = []
                for raw in recognition or []:
                    entry = _extract_entry(raw)
                    if entry is not None:
                        parsed_entries.append(entry)

                parsed_entries.sort(key=lambda item: _sort_key(item[0]))

                groups: List[Tuple[float, List[str]]] = []
                threshold = 24.0
                for box, text, confidence in parsed_entries:
                    if not text or confidence < 0.3:
                        continue
                    try:
                        center_y = sum(float(point[1]) for point in box) / len(box) if box else 0.0
                    except Exception:  # pragma: no cover - defensive fallback
                        center_y = 0.0
                    sanitized = " ".join(part for part in text.splitlines()).strip()
                    if not sanitized:
                        continue
                    if not groups:
                        groups.append((center_y, [sanitized]))
                    else:
                        last_y, last_parts = groups[-1]
                        if abs(center_y - last_y) <= threshold:
                            last_parts.append(sanitized)
                        else:
                            groups.append((center_y, [sanitized]))

                entries: List[str] = []
                if not groups:
                    if fallback_lines:
                        for fallback in fallback_lines:
                            sanitized_fallback = fallback.strip()
                            if sanitized_fallback:
                                entries.append(f"- {sanitized_fallback}")
                    else:
                        entries.append("_No text detected._")
                else:
                    for _center, parts in groups:
                        line = " ".join(parts).strip()
                        if line:
                            entries.append(f"- {line}")

                image_reference = Path(asset_dir.name) / image_name
                section_lines = [
                    f"## Slide {page_number + 1}",
                    "",
                    f"![Slide {page_number + 1}]({image_reference.as_posix()})",
                    "",
                    *entries,
                ]
                page_sections.append("\n".join(section_lines))

                processed_pages = len(page_sections)

                if progress_callback is not None:
                    try:
                        progress_callback(processed_index, total_pages or None)
                    except Exception:  # pragma: no cover - defensive against callback errors
                        LOGGER.exception("Slide conversion progress callback failed mid-run")

        if not page_sections:
            page_sections.append("_No slides were processed._")

        if document_page_count is not None and actual_start_page is not None:
            if actual_end_page is not None and actual_end_page == document_page_count and actual_start_page == 1:
                page_range_label = "all"
            else:
                end_value = actual_end_page if actual_end_page is not None else actual_start_page
                page_range_label = f"{actual_start_page}-{end_value}"
        else:
            page_range_label = "unknown"

        metadata_lines = [
            "---",
            "generator: Lecture Tools Slide Converter",
            f"generated_at: {generated_at}",
            f"render_dpi: {render_dpi}",
            f"source_pdf: {slide_path.name}",
            f"page_range: {page_range_label}",
            f"pages_processed: {processed_pages}",
        ]
        if document_page_count is not None:
            metadata_lines.append(f"document_pages: {document_page_count}")
        metadata_lines.append("---")

        sections = ["\n".join(metadata_lines), "# Slide Notes", *page_sections]
        content = "\n\n".join(section for section in sections if section)
        markdown_path.write_text(content, encoding="utf-8")

        existing_archives = list(bundle_dir.glob("*.zip"))
        for leftover in existing_archives:
            try:
                leftover.unlink()
            except OSError:
                continue

        bundle_path = self._prepare_destination(bundle_dir, stem)
        with ZipFile(bundle_path, "w", compression=ZIP_DEFLATED) as archive:
            archive.write(markdown_path, arcname=markdown_path.name)
            for image_file in sorted(asset_dir.iterdir()):
                if not image_file.is_file():
                    continue
                arcname = Path(asset_dir.name) / image_file.name
                archive.write(image_file, arcname=arcname.as_posix())

        return SlideConversionResult(bundle_path=bundle_path, markdown_path=markdown_path)

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


__all__ = [
    "PyMuPDFSlideConverter",
    "SlideConversionDependencyError",
    "SlideConversionError",
    "get_pdf_page_count",
    "render_pdf_page",
]
