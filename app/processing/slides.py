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


class _PaddleOCREngine:
    """Adapter providing a consistent interface around PaddleOCR."""

    def __init__(self, language: str) -> None:
        try:
            from paddleocr import PaddleOCR  # type: ignore
        except ImportError as exc:  # pragma: no cover - import guard
            raise SlideConversionDependencyError("PaddleOCR is not installed") from exc

        try:
            self._engine = PaddleOCR(use_angle_cls=True, lang=language)
        except Exception as error:  # noqa: BLE001 - PaddleOCR may raise arbitrary errors
            LOGGER.exception("Failed to initialise PaddleOCR: %s", error)
            raise SlideConversionError(f"Failed to initialise PaddleOCR: {error}") from error

    def ocr(self, image: Any) -> Any:
        return self._engine.ocr(image)


class _TesseractOCREngine:
    """Adapter that mimics PaddleOCR's interface using Tesseract OCR."""

    def __init__(self, language: str) -> None:
        try:
            import pytesseract  # type: ignore
        except ImportError as exc:  # pragma: no cover - import guard
            raise SlideConversionDependencyError("pytesseract is not installed") from exc

        try:
            get_version = pytesseract.get_tesseract_version
        except AttributeError as exc:  # pragma: no cover - defensive guard
            raise SlideConversionDependencyError(
                "Installed pytesseract is missing get_tesseract_version()"
            ) from exc

        try:
            tesseract_missing_error = pytesseract.TesseractNotFoundError
        except AttributeError as exc:  # pragma: no cover - defensive guard
            raise SlideConversionDependencyError(
                "Installed pytesseract is missing TesseractNotFoundError"
            ) from exc

        try:
            output_config = pytesseract.Output.DICT
        except AttributeError as exc:  # pragma: no cover - defensive guard
            raise SlideConversionDependencyError(
                "Installed pytesseract is missing Output.DICT"
            ) from exc

        try:
            get_version()
        except tesseract_missing_error as exc:  # pragma: no cover - runtime check
            raise SlideConversionDependencyError(
                "Tesseract OCR is not installed or not available in PATH"
            ) from exc

        self._pytesseract = pytesseract
        self._language = language
        self._output_dict = output_config

    def ocr(self, image: Any) -> List[Mapping[str, Any]]:
        try:
            import numpy as np  # type: ignore
        except ImportError as exc:  # pragma: no cover - defensive guard
            raise SlideConversionDependencyError("NumPy is required for Tesseract OCR") from exc

        try:
            from PIL import Image  # type: ignore
        except ImportError as exc:  # pragma: no cover - defensive guard
            raise SlideConversionDependencyError("Pillow is required for Tesseract OCR") from exc

        pil_image = image
        if not isinstance(image, Image.Image):
            try:
                pil_image = Image.fromarray(np.asarray(image))
            except Exception as error:  # pragma: no cover - defensive fallback
                raise SlideConversionError("Unable to convert image for Tesseract OCR") from error

        data = self._pytesseract.image_to_data(
            pil_image,
            lang=self._language,
            output_type=self._output_dict,
        )

        entries: List[Mapping[str, Any]] = []
        total = len(data.get("text", []))
        for index in range(total):
            text = str(data.get("text", [""])[index] or "").strip()
            if not text:
                continue

            try:
                confidence_value = float(data.get("conf", ["-1"])[index])
            except (TypeError, ValueError):
                confidence_value = -1.0
            confidence = max(0.0, confidence_value / 100.0)

            def _extract_float(values: Mapping[str, List[Any]], key: str) -> float:
                try:
                    return float(values.get(key, [0])[index] or 0)
                except (TypeError, ValueError):
                    return 0.0

            left = _extract_float(data, "left")
            top = _extract_float(data, "top")
            width = _extract_float(data, "width")
            height = _extract_float(data, "height")

            right = left + width
            bottom = top + height

            entry = {
                "box": [
                    [left, top],
                    [right, top],
                    [right, bottom],
                    [left, bottom],
                ],
                "text": text,
                "score": confidence,
            }
            entries.append(entry)

        return entries


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

        if self._ocr_engine is not None:
            return self._ocr_engine

        paddle_error: Exception | None = None
        try:
            engine = _PaddleOCREngine(self._ocr_language)
        except SlideConversionError as error:
            paddle_error = error
        except SlideConversionDependencyError as error:
            paddle_error = error
        else:
            LOGGER.info("Using PaddleOCR backend for slide OCR")
            self._ocr_engine = engine
            return engine

        if paddle_error is not None:
            LOGGER.warning("PaddleOCR backend unavailable: %s", paddle_error)

        try:
            engine = _TesseractOCREngine(self._ocr_language)
        except SlideConversionError:
            raise
        except SlideConversionDependencyError as error:
            if paddle_error is not None:
                raise SlideConversionDependencyError(
                    "No OCR backend available. Install PaddleOCR or Tesseract OCR."
                ) from error
            raise
        else:
            LOGGER.info("Using Tesseract OCR backend for slide OCR")
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
                page_images = page.get_images(full=True) or []
                page_drawings = page.get_drawings() or []
                full_pix = page.get_pixmap(matrix=matrix, alpha=False)
                full_image = Image.frombytes("RGB", [full_pix.width, full_pix.height], full_pix.samples)

                array = np.asarray(full_image)
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

                has_textual_entries = any(line.startswith("- ") for line in entries)
                has_text_content = bool(fallback_lines) or has_textual_entries
                visual_regions = self._detect_visual_regions(page)
                include_image = self._should_include_image(
                    has_text=has_text_content,
                    has_raster_images=bool(page_images),
                    has_vector_drawings=bool(page_drawings),
                    has_visual_regions=bool(visual_regions),
                )

                section_lines = [
                    f"## Slide {page_number + 1}",
                    "",
                ]

                if include_image:
                    image_name = f"slide-{page_number + 1:03d}.png"
                    image_path = asset_dir / image_name
                    target_image = full_image
                    if visual_regions:
                        clip_box = self._union_rectangles(visual_regions)
                        if clip_box is not None:
                            try:
                                clip_rect = fitz.Rect(*clip_box)
                            except Exception:
                                clip_rect = None
                            else:
                                clip_pix = page.get_pixmap(
                                    matrix=matrix,
                                    alpha=False,
                                    clip=clip_rect,
                                )
                                target_image = Image.frombytes(
                                    "RGB",
                                    [clip_pix.width, clip_pix.height],
                                    clip_pix.samples,
                                )

                    target_image.save(image_path, format="PNG")
                    image_reference = Path(asset_dir.name) / image_name
                    section_lines.extend(
                        [
                            f"![Slide {page_number + 1}]({image_reference.as_posix()})",
                            "",
                        ]
                    )

                section_lines.extend(entries)
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

    @staticmethod
    def _should_include_image(
        *,
        has_text: bool,
        has_raster_images: bool,
        has_vector_drawings: bool,
        has_visual_regions: bool,
    ) -> bool:
        """Determine whether a slide preview image should be included."""

        if has_visual_regions:
            return True
        if has_raster_images or has_vector_drawings:
            return True
        return False

    @staticmethod
    def _detect_visual_regions(
        page: Any,
        *,
        min_size: float = 12.0,
        merge_margin: float = 6.0,
    ) -> List[Tuple[float, float, float, float]]:
        """Return bounding boxes of non-text visual regions on a slide."""

        rectangles: List[Tuple[float, float, float, float]] = []
        try:
            raw_dict = page.get_text("rawdict")
        except Exception:  # pragma: no cover - defensive fallback
            raw_dict = None

        blocks: Iterable[Mapping[str, Any]]
        if isinstance(raw_dict, Mapping):
            blocks = raw_dict.get("blocks") or []
        else:  # pragma: no cover - defensive fallback
            blocks = []

        for block in blocks:
            if not isinstance(block, Mapping):
                continue
            if block.get("type") != 1:
                continue
            bbox = block.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            try:
                x0, y0, x1, y1 = (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
            except Exception:  # pragma: no cover - defensive fallback
                continue
            if x1 <= x0 or y1 <= y0:
                continue
            if (x1 - x0) < min_size or (y1 - y0) < min_size:
                continue
            rectangles.append((x0, y0, x1, y1))

        try:
            drawings = page.get_drawings()
        except Exception:  # pragma: no cover - defensive fallback
            drawings = []

        for drawing in drawings or []:
            if not isinstance(drawing, Mapping):
                continue
            rect = drawing.get("rect")
            if rect is None:
                continue
            try:
                if hasattr(rect, "x0"):
                    x0 = float(rect.x0)
                    y0 = float(rect.y0)
                    x1 = float(rect.x1)
                    y1 = float(rect.y1)
                else:
                    x0 = float(rect[0])
                    y0 = float(rect[1])
                    x1 = float(rect[2])
                    y1 = float(rect[3])
            except Exception:  # pragma: no cover - defensive fallback
                continue
            if x1 <= x0 or y1 <= y0:
                continue
            if (x1 - x0) < min_size or (y1 - y0) < min_size:
                continue
            rectangles.append((x0, y0, x1, y1))

        if not rectangles:
            return []

        merged = PyMuPDFSlideConverter._merge_rectangles(rectangles, margin=merge_margin)
        merged.sort(key=lambda item: (item[1], item[0]))
        return merged

    @staticmethod
    def _merge_rectangles(
        rectangles: Iterable[Tuple[float, float, float, float]],
        *,
        margin: float,
    ) -> List[Tuple[float, float, float, float]]:
        """Merge overlapping rectangles while applying an outward margin."""

        merged: List[Tuple[float, float, float, float]] = []
        for rect in rectangles:
            x0, y0, x1, y1 = rect
            expanded = (
                min(x0, x1) - margin,
                min(y0, y1) - margin,
                max(x0, x1) + margin,
                max(y0, y1) + margin,
            )
            new_rect = expanded
            overlaps: List[int] = []
            for index, existing in enumerate(merged):
                if PyMuPDFSlideConverter._rectangles_overlap(existing, new_rect):
                    new_rect = (
                        min(new_rect[0], existing[0]),
                        min(new_rect[1], existing[1]),
                        max(new_rect[2], existing[2]),
                        max(new_rect[3], existing[3]),
                    )
                    overlaps.append(index)
            for index in reversed(overlaps):
                merged.pop(index)
            merged.append(new_rect)
        return merged

    @staticmethod
    def _rectangles_overlap(
        a: Tuple[float, float, float, float],
        b: Tuple[float, float, float, float],
    ) -> bool:
        """Return True when two rectangles overlap or touch."""

        return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])

    @staticmethod
    def _union_rectangles(
        rectangles: Iterable[Tuple[float, float, float, float]]
    ) -> Optional[Tuple[float, float, float, float]]:
        """Return the union bounding box for a list of rectangles."""

        iterator = iter(rectangles)
        try:
            first = next(iterator)
        except StopIteration:
            return None

        x0, y0, x1, y1 = first
        for rect in iterator:
            x0 = min(x0, rect[0])
            y0 = min(y0, rect[1])
            x1 = max(x1, rect[2])
            y1 = max(y1, rect[3])
        return (x0, y0, x1, y1)


__all__ = [
    "PyMuPDFSlideConverter",
    "SlideConversionDependencyError",
    "SlideConversionError",
    "get_pdf_page_count",
    "render_pdf_page",
]
