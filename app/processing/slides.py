"""Slide processing helpers."""

from __future__ import annotations

import inspect
import json
import logging
import math
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import fmean
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Tuple, Union
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageFilter, ImageOps

from ..services.ingestion import SlideConversionResult, SlideConverter


LOGGER = logging.getLogger(__name__)


@dataclass
class TextExtractionResult:
    """Container describing text recovered directly from a PDF page."""

    lines: List[str]
    had_text_layer: bool


@dataclass
class _OCRBackendInfo:
    """Metadata describing a configured OCR backend."""

    engine: Any
    label: str
    version: Optional[str]


@dataclass
class _OCRVariant:
    """Describes a preprocessed image variant for OCR."""

    label: str
    image: Image.Image


@dataclass
class _OCRCandidate:
    """Captures the best OCR result for a backend/variant pair."""

    label: str
    entries: List[Tuple[List[Any], str, float]]
    recognition: Any
    score: float


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

        module_name = getattr(PaddleOCR, "__module__", "")
        version_value: Optional[str] = None
        if module_name:
            root_module = module_name.split(".")[0]
            candidate = sys.modules.get(root_module) or sys.modules.get(module_name)
            if candidate is not None:
                version_attr = getattr(candidate, "__version__", None)
                if version_attr:
                    version_value = str(version_attr)

        self.name = f"PaddleOCR {version_value}" if version_value else "PaddleOCR"
        self.version = version_value

    def ocr(self, image: Any) -> Any:
        return self._engine.ocr(image)


class _EasyOCREngine:
    """Adapter that provides a consistent interface for EasyOCR."""

    def __init__(self, language: str) -> None:
        try:
            from easyocr import Reader  # type: ignore
        except ImportError as exc:  # pragma: no cover - import guard
            raise SlideConversionDependencyError("EasyOCR is not installed") from exc

        language_codes = [language.strip() or "en"]
        try:
            self._reader = Reader(language_codes, gpu=False)
        except Exception as error:  # noqa: BLE001 - EasyOCR may raise arbitrary errors
            LOGGER.exception("Failed to initialise EasyOCR: %s", error)
            raise SlideConversionError(f"Failed to initialise EasyOCR: {error}") from error

        module = sys.modules.get("easyocr")
        version_value: Optional[str] = None
        if module is not None:
            candidate = getattr(module, "__version__", None)
            if candidate is not None:
                version_value = str(candidate)

        self.name = f"EasyOCR {version_value}" if version_value else "EasyOCR"
        self.version = version_value

    def ocr(self, image: Any) -> Any:
        return self._reader.readtext(image)


class _TesseractOCREngine:
    """Adapter that mimics PaddleOCR's interface using Tesseract OCR."""

    def __init__(self, language: str, *, config: Optional[str] = None) -> None:
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
            version_info = get_version()
        except tesseract_missing_error as exc:  # pragma: no cover - runtime check
            raise SlideConversionDependencyError(
                "Tesseract OCR is not installed or not available in PATH"
            ) from exc

        self._pytesseract = pytesseract
        self._language = language
        self._output_dict = output_config
        self._config = config or "--oem 1 --psm 6"
        version_value = str(version_info)
        self.version = version_value
        self.name = f"Tesseract {version_value}".strip()

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

        ocr_kwargs = {
            "lang": self._language,
            "output_type": self._output_dict,
        }
        if "config" in inspect.signature(self._pytesseract.image_to_data).parameters:
            ocr_kwargs["config"] = self._config

        data = self._pytesseract.image_to_data(pil_image, **ocr_kwargs)

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

    def __init__(
        self,
        dpi: int = 200,
        *,
        ocr_language: str = "en",
        ocr_dpi: int = 320,
        ocr_preprocess: bool = True,
        ocr_upscale_factor: float = 1.5,
        tesseract_config: Optional[str] = None,
        force_ocr: bool = False,
        retain_debug_assets: bool = False,
    ) -> None:
        self._dpi = dpi
        self._ocr_language = ocr_language
        self._ocr_dpi = ocr_dpi
        self._ocr_preprocess = ocr_preprocess
        self._ocr_upscale_factor = max(1.0, ocr_upscale_factor)
        self._tesseract_config = tesseract_config or "--oem 1 --psm 6"
        self._force_ocr = bool(force_ocr)
        self._ocr_backends: List[_OCRBackendInfo] = []
        self._ocr_backends_initialized = False
        self._ocr_engine_label: str = "text-layer-only"
        self._ocr_engine_version: Optional[str] = None
        self._retain_debug_assets = bool(retain_debug_assets)
        LOGGER.debug(
            "PyMuPDFSlideConverter initialised with dpi=%s, ocr_language=%s, ocr_dpi=%s, "
            "ocr_preprocess=%s, force_ocr=%s, retain_debug_assets=%s",
            dpi,
            ocr_language,
            ocr_dpi,
            ocr_preprocess,
            self._force_ocr,
            self._retain_debug_assets,
        )

    def _prepare_ocr_backends(self) -> List[_OCRBackendInfo]:
        if self._ocr_backends_initialized:
            return self._ocr_backends

        available: List[_OCRBackendInfo] = []
        initialization_errors: List[str] = []
        candidates = [
            ("PaddleOCR", _PaddleOCREngine, {}),
            ("EasyOCR", _EasyOCREngine, {}),
            (
                "Tesseract OCR",
                _TesseractOCREngine,
                {"config": self._tesseract_config},
            ),
        ]

        for label, factory, kwargs in candidates:
            try:
                engine = factory(self._ocr_language, **kwargs)
            except SlideConversionDependencyError as error:
                LOGGER.warning("%s backend unavailable: %s", label, error)
                initialization_errors.append(f"{label}: {error}")
                continue
            except SlideConversionError as error:
                LOGGER.error("%s backend failed to initialise: %s", label, error, exc_info=True)
                initialization_errors.append(f"{label}: {error}")
                continue

            backend_label = getattr(engine, "name", label)
            version_value = getattr(engine, "version", None)
            backend_version = str(version_value) if version_value is not None else None
            available.append(
                _OCRBackendInfo(
                    engine=engine,
                    label=backend_label,
                    version=backend_version,
                )
            )
            LOGGER.info("Registered %s backend for slide OCR", backend_label)

        if not available:
            detail_suffix = (
                f" ({'; '.join(initialization_errors)})" if initialization_errors else ""
            )
            raise SlideConversionDependencyError(
                "No OCR backend available. Install PaddleOCR, EasyOCR, or Tesseract OCR." + detail_suffix
            )

        self._ocr_backends = available
        self._ocr_backends_initialized = True
        pipeline_label = " > ".join(info.label for info in available)
        self._ocr_engine_label = f"Cascade[{pipeline_label}]"
        versions = [
            f"{info.label} {info.version}" if info.version else info.label for info in available
        ]
        self._ocr_engine_version = ", ".join(versions) if versions else None
        return self._ocr_backends

    @staticmethod
    def _estimate_binarization_threshold(image: Image.Image) -> int:
        histogram = image.histogram()
        total = sum(histogram)
        if total == 0:
            return 127
        sum_total = sum(index * count for index, count in enumerate(histogram))
        sum_background = 0.0
        weight_background = 0.0
        max_variance = -1.0
        threshold = 127
        for index, count in enumerate(histogram):
            weight_background += count
            if weight_background == 0:
                continue
            weight_foreground = total - weight_background
            if weight_foreground == 0:
                break
            sum_background += index * count
            mean_background = sum_background / weight_background
            mean_foreground = (sum_total - sum_background) / weight_foreground
            variance = weight_background * weight_foreground * (
                mean_background - mean_foreground
            ) ** 2
            if variance > max_variance:
                max_variance = variance
                threshold = index
        return int(threshold)

    def _build_ocr_variants(self, image: Image.Image) -> List[_OCRVariant]:
        variants: List[_OCRVariant] = []
        base_image = ImageOps.exif_transpose(image)
        variants.append(_OCRVariant(label="original", image=base_image))

        gray = ImageOps.grayscale(base_image)
        variants.append(_OCRVariant(label="grayscale", image=gray))

        autocontrast = ImageOps.autocontrast(gray)
        variants.append(_OCRVariant(label="autocontrast", image=autocontrast))

        sharpened = autocontrast.filter(
            ImageFilter.UnsharpMask(radius=2, percent=180, threshold=3)
        )
        variants.append(_OCRVariant(label="sharpened", image=sharpened))

        threshold = self._estimate_binarization_threshold(autocontrast)
        binarized = autocontrast.point(lambda value: 255 if value >= threshold else 0)
        variants.append(_OCRVariant(label="binarized", image=binarized))

        if self._ocr_upscale_factor > 1.0:
            max_dim = max(base_image.size)
            if max_dim < 2400:
                scale = self._ocr_upscale_factor
                new_size = (
                    int(math.ceil(base_image.width * scale)),
                    int(math.ceil(base_image.height * scale)),
                )
                upscaled = base_image.resize(new_size, Image.Resampling.LANCZOS)
                variants.append(_OCRVariant(label="upscaled", image=upscaled))

        return variants

    @staticmethod
    def _variant_to_array(variant: _OCRVariant, array_module: Any) -> Any:
        rgb_image = variant.image.convert("RGB")
        return array_module.asarray(rgb_image)

    @staticmethod
    def _score_recognition_entries(
        entries: Iterable[Tuple[List[Any], str, float]]
    ) -> float:
        confidences = [max(0.0, min(1.0, float(entry[2]))) for entry in entries]
        if not confidences:
            return 0.0
        return len(confidences) * fmean(confidences)

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

        LOGGER.debug(
            "Slide OCR pipeline ready (language=%s); OCR backends will be prepared on demand",
            self._ocr_language,
        )

        ocr_backends: List[_OCRBackendInfo] | None = None
        used_backend_labels: List[str] = []

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
        ocr_matrix = fitz.Matrix(self._ocr_dpi / 72, self._ocr_dpi / 72)
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
                image_array_filename: Optional[str] = None
                if self._retain_debug_assets:
                    image_array_path = asset_dir / f"slide-{page_number + 1:03d}-image.npy"
                    try:
                        np.save(image_array_path, array)
                    except Exception:  # pragma: no cover - debug persistence best effort
                        LOGGER.exception(
                            "Failed to persist OCR pixel array for slide %s",
                            page_number + 1,
                        )
                    else:
                        image_array_filename = image_array_path.name

                fallback_result = self._extract_text_candidates(page)
                fallback_lines = fallback_result.lines
                had_text_layer = fallback_result.had_text_layer
                recognition: Any = []
                parsed_entries: List[Tuple[List[Any], str, float]] = []
                debug_entries: List[Dict[str, Any]] = []
                groups: List[Tuple[float, List[str]]] = []
                entries: List[str] = []
                backend_used: Optional[_OCRBackendInfo] = None
                ocr_variant_used: Optional[str] = None
                backend_attempts: List[str] = []
                backend_failures: List[str] = []
                ocr_variant_attempts: List[str] = []
                ocr_elapsed = 0.0
                ocr_status = "text-detected"
                no_text_reason: Optional[str] = None

                if fallback_lines and had_text_layer and not self._force_ocr:
                    ocr_status = "text-layer"
                    for fallback in fallback_lines:
                        sanitized_fallback = fallback.strip()
                        if sanitized_fallback:
                            entries.append(f"- {sanitized_fallback}")
                else:
                    if ocr_backends is None:
                        ocr_backends = self._prepare_ocr_backends()

                    if self._ocr_dpi == self._dpi:
                        ocr_image = full_image
                    else:
                        ocr_pix = page.get_pixmap(matrix=ocr_matrix, alpha=False)
                        ocr_image = Image.frombytes(
                            "RGB",
                            [ocr_pix.width, ocr_pix.height],
                            ocr_pix.samples,
                        )

                    ocr_variants = (
                        self._build_ocr_variants(ocr_image)
                        if self._ocr_preprocess
                        else [_OCRVariant(label="original", image=ocr_image)]
                    )

                    for backend in ocr_backends:
                        backend_attempts.append(backend.label)
                        LOGGER.debug(
                            "Attempting slide %s OCR with %s",
                            page_number + 1,
                            backend.label,
                        )
                        best_candidate: Optional[_OCRCandidate] = None
                        backend_elapsed = 0.0

                        for variant in ocr_variants:
                            ocr_variant_attempts.append(f"{backend.label}:{variant.label}")
                            ocr_started = time.perf_counter()
                            try:
                                variant_array = self._variant_to_array(variant, np)
                                candidate = backend.engine.ocr(variant_array)
                            except Exception as error:  # noqa: BLE001 - OCR may raise arbitrary errors
                                elapsed = time.perf_counter() - ocr_started
                                backend_elapsed += elapsed
                                backend_failures.append(
                                    f"{backend.label} ({variant.label}): {error}"
                                )
                                LOGGER.warning(
                                    "Slide %s OCR backend %s (%s) failed after %.3fs: %s",
                                    page_number + 1,
                                    backend.label,
                                    variant.label,
                                    elapsed,
                                    error,
                                    exc_info=True,
                                )
                                continue

                            elapsed = time.perf_counter() - ocr_started
                            backend_elapsed += elapsed
                            candidate_entries = self._parse_recognition_entries(candidate)
                            candidate_score = self._score_recognition_entries(candidate_entries)
                            if best_candidate is None or candidate_score > best_candidate.score:
                                best_candidate = _OCRCandidate(
                                    label=variant.label,
                                    entries=candidate_entries,
                                    recognition=candidate,
                                    score=candidate_score,
                                )

                        if best_candidate and best_candidate.entries:
                            recognition = best_candidate.recognition
                            parsed_entries = best_candidate.entries
                            backend_used = backend
                            ocr_variant_used = best_candidate.label
                            ocr_elapsed = backend_elapsed
                            if backend.label not in used_backend_labels:
                                used_backend_labels.append(backend.label)
                            LOGGER.info(
                                "Slide %s OCR succeeded with %s (%s) in %.3fs",
                                page_number + 1,
                                backend.label,
                                best_candidate.label,
                                backend_elapsed,
                            )
                            break

                        backend_failures.append(f"{backend.label}: empty result")
                        LOGGER.info(
                            "Slide %s OCR backend %s produced no text; continuing cascade",
                            page_number + 1,
                            backend.label,
                        )

                    if backend_used is None:
                        recognition = []
                        ocr_elapsed = 0.0

                if parsed_entries:
                    ocr_status = "ocr-cascade"
                    threshold = 24.0
                    for box, text, confidence in parsed_entries:
                        if not text or confidence < 0.3:
                            continue
                        try:
                            center_y = (
                                sum(float(point[1]) for point in box) / len(box)
                                if box
                                else 0.0
                            )
                        except Exception:  # pragma: no cover - defensive fallback
                            center_y = 0.0
                        sanitized = " ".join(part for part in text.splitlines()).strip()
                        if not sanitized:
                            continue
                        normalized_box: List[List[float]] = []
                        for point in box or []:
                            if isinstance(point, Iterable) and len(point) >= 2:
                                try:
                                    normalized_box.append([float(point[0]), float(point[1])])
                                except (TypeError, ValueError):
                                    continue
                        debug_entries.append(
                            {
                                "text": sanitized,
                                "confidence": float(confidence),
                                "center_y": center_y,
                                "box": normalized_box,
                            }
                        )
                        if not groups:
                            groups.append((center_y, [sanitized]))
                        else:
                            last_y, last_parts = groups[-1]
                            if abs(center_y - last_y) <= threshold:
                                last_parts.append(sanitized)
                            else:
                                groups.append((center_y, [sanitized]))

                    for _center, parts in groups:
                        line = " ".join(parts).strip()
                        if line:
                            entries.append(f"- {line}")
                elif fallback_lines and not entries:
                    no_text_reason = "used-text-layer-fallback"
                    ocr_status = "fallback-text-layer"
                    for fallback in fallback_lines:
                        sanitized_fallback = fallback.strip()
                        if sanitized_fallback:
                            entries.append(f"- {sanitized_fallback}")
                else:
                    if had_text_layer:
                        no_text_reason = "text-layer-empty"
                        ocr_status = "text-layer-empty"
                        entries.append(
                            "_No text detected (text layer contained no extractable content)._"
                        )
                    elif backend_attempts:
                        no_text_reason = "ocr-backends-failed"
                        ocr_status = "ocr-backends-failed"
                        entries.append(
                            "_No text detected (all OCR backends failed to extract text)._"
                        )
                        if backend_failures:
                            LOGGER.error(
                                "Slide %s OCR cascade failed: %s",
                                page_number + 1,
                                "; ".join(backend_failures),
                            )
                    else:
                        no_text_reason = "no-ocr-attempt"
                        ocr_status = "text-layer"

                accepted_confidences = [item["confidence"] for item in debug_entries]
                if accepted_confidences:
                    confidence_stats = {
                        "min": round(min(accepted_confidences), 6),
                        "max": round(max(accepted_confidences), 6),
                        "mean": round(fmean(accepted_confidences), 6),
                    }
                else:
                    confidence_stats = {"min": None, "max": None, "mean": None}

                if debug_entries:
                    ocr_text_lines = [item["text"] for item in debug_entries]
                else:
                    ocr_text_lines = [line.strip() for line in fallback_lines if line.strip()]

                raw_preview: List[str] = []
                for index, raw_item in enumerate(recognition or []):
                    if index >= 5:
                        break
                    raw_preview.append(str(raw_item))

                fallback_was_used = bool(fallback_lines) and not parsed_entries
                has_textual_entries = any(line.startswith("- ") for line in entries)
                has_text_content = has_textual_entries or fallback_was_used
                visual_regions = self._detect_visual_regions(page)
                include_image = self._should_include_image(
                    has_text=has_text_content,
                    has_raster_images=bool(page_images),
                    has_vector_drawings=bool(page_drawings),
                    has_visual_regions=bool(visual_regions),
                )

                backend_used_label = backend_used.label if backend_used else None
                backend_used_version = backend_used.version if backend_used else None

                debug_summary = {
                    "page": page_number + 1,
                    "ocr_engine": self._ocr_engine_label,
                    "ocr_engine_version": self._ocr_engine_version,
                    "ocr_dpi": self._ocr_dpi,
                    "ocr_duration_ms": round(ocr_elapsed * 1000, 3),
                    "ocr_status": ocr_status,
                    "ocr_preprocess": self._ocr_preprocess,
                    "ocr_variant_used": ocr_variant_used,
                    "raw_recognition_count": len(recognition or []),
                    "accepted_entry_count": len(debug_entries),
                    "fallback_line_count": len(fallback_lines),
                    "text_layer_present": had_text_layer,
                    "no_text_reason": no_text_reason,
                    "debug_assets": self._retain_debug_assets,
                }
                LOGGER.debug(
                    "Slide %s OCR debug summary: %s",
                    page_number + 1,
                    json.dumps(debug_summary, ensure_ascii=False),
                )

                if self._retain_debug_assets:
                    debug_entries_payload = [
                        {
                            "text": item["text"],
                            "confidence": round(item["confidence"], 6),
                            "center_y": round(item["center_y"], 3),
                            "box": [
                                [round(point[0], 3), round(point[1], 3)]
                                for point in item["box"]
                            ],
                        }
                        for item in debug_entries
                    ]

                    debug_payload = {
                        "page": page_number + 1,
                        "ocr_engine": self._ocr_engine_label,
                        "ocr_engine_version": self._ocr_engine_version,
                        "ocr_dpi": self._ocr_dpi,
                        "ocr_duration_ms": round(ocr_elapsed * 1000, 3),
                        "ocr_status": ocr_status,
                        "ocr_backend_used": backend_used_label,
                        "ocr_backend_version": backend_used_version,
                        "ocr_backend_attempts": backend_attempts,
                        "ocr_backend_failures": backend_failures,
                        "ocr_preprocess": self._ocr_preprocess,
                        "ocr_variant_used": ocr_variant_used,
                        "ocr_variant_attempts": ocr_variant_attempts,
                        "raw_recognition_count": len(recognition or []),
                        "accepted_entry_count": len(debug_entries),
                        "group_count": len(groups),
                        "confidence": confidence_stats,
                        "ocr_entries": debug_entries_payload,
                        "ocr_text": ocr_text_lines,
                        "fallback_line_count": len(fallback_lines),
                        "fallback_lines": fallback_lines,
                        "text_layer_present": had_text_layer,
                        "no_text_reason": no_text_reason,
                        "markdown_entries": entries,
                        "fallback_used": fallback_was_used,
                        "image_array_file": image_array_filename,
                        "image_size": {
                            "width": full_image.width,
                            "height": full_image.height,
                        },
                        "raw_recognition_preview": raw_preview,
                        "include_image": include_image,
                        "has_raster_images": bool(page_images),
                        "has_vector_drawings": bool(page_drawings),
                        "visual_region_count": len(visual_regions),
                    }

                    debug_path = asset_dir / f"slide-{page_number + 1:03d}-ocr.json"
                    try:
                        debug_path.write_text(
                            json.dumps(debug_payload, indent=2, ensure_ascii=False),
                            encoding="utf-8",
                        )
                    except Exception:  # pragma: no cover - debug persistence best effort
                        LOGGER.exception(
                            "Failed to persist OCR debug payload for slide %s",
                            page_number + 1,
                        )
                    else:
                        LOGGER.debug(
                            "Slide %s OCR debug stored at %s",
                            page_number + 1,
                            debug_path,
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
            f"ocr_dpi: {self._ocr_dpi}",
            f"ocr_preprocess: {self._ocr_preprocess}",
            f"ocr_force: {self._force_ocr}",
            f"ocr_engine: {self._ocr_engine_label}",
            f"source_pdf: {slide_path.name}",
            f"page_range: {page_range_label}",
            f"pages_processed: {processed_pages}",
        ]
        if self._ocr_engine_version:
            metadata_lines.append(f"ocr_engine_version: {self._ocr_engine_version}")
        if used_backend_labels:
            metadata_lines.append(
                f"ocr_backends_used: {', '.join(used_backend_labels)}"
            )
        elif self._ocr_backends_initialized:
            metadata_lines.append("ocr_backends_used: none-successful")
        else:
            metadata_lines.append("ocr_backends_used: text-layer")
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
    def _extract_text_candidates(page: Any) -> TextExtractionResult:
        """Return text lines extracted directly from a PDF page."""

        lines: List[str] = []
        had_text_layer = False

        try:
            raw_text = page.get_text("text")
        except Exception:  # pragma: no cover - defensive fallback
            raw_text = ""

        if isinstance(raw_text, str):
            for line in raw_text.splitlines():
                sanitized = line.strip()
                if sanitized:
                    lines.append(sanitized)
            if raw_text.strip():
                had_text_layer = True

        if lines:
            return TextExtractionResult(lines=lines, had_text_layer=True)

        try:
            raw_dict = page.get_text("rawdict")
        except Exception:  # pragma: no cover - defensive fallback
            raw_dict = None

        if not isinstance(raw_dict, Mapping):
            return TextExtractionResult(lines=lines, had_text_layer=had_text_layer)

        blocks = raw_dict.get("blocks")
        if not isinstance(blocks, Iterable):
            return TextExtractionResult(lines=lines, had_text_layer=had_text_layer)

        for block in blocks:
            if not isinstance(block, Mapping):
                continue
            if block.get("type") != 0:
                continue

            had_text_layer = True

            for line in block.get("lines", []) or []:
                if not isinstance(line, Mapping):
                    continue
                spans = line.get("spans", [])
                if not isinstance(spans, Iterable):
                    continue

                words: List[str] = []
                for span in spans:
                    if not isinstance(span, Mapping):
                        continue
                    text = span.get("text")
                    if not isinstance(text, str):
                        continue
                    sanitized = text.strip()
                    if sanitized:
                        words.append(sanitized)

                combined = " ".join(words).strip()
                if combined:
                    lines.append(combined)

        if had_text_layer and not lines:
            try:
                words_data = page.get_text("words")
            except Exception:  # pragma: no cover - defensive fallback
                words_data = None

            if isinstance(words_data, Iterable):
                grouped_words: Dict[Tuple[int, int], List[str]] = {}
                for entry in words_data:
                    if not isinstance(entry, (list, tuple)) or len(entry) < 5:
                        continue
                    text = entry[4]
                    if not isinstance(text, str):
                        continue
                    sanitized = text.strip()
                    if not sanitized:
                        continue

                    block_index = 0
                    line_index = 0
                    if len(entry) > 5:
                        try:
                            block_index = int(entry[5])
                        except (TypeError, ValueError):
                            block_index = 0
                    if len(entry) > 6:
                        try:
                            line_index = int(entry[6])
                        except (TypeError, ValueError):
                            line_index = 0

                    grouped_words.setdefault((block_index, line_index), []).append(sanitized)

                for block_line in sorted(grouped_words):
                    combined = " ".join(grouped_words[block_line]).strip()
                    if combined:
                        lines.append(combined)

                if lines:
                    return TextExtractionResult(lines=lines, had_text_layer=True)

        return TextExtractionResult(lines=lines, had_text_layer=had_text_layer)

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
    def _normalize_recognition_entry(candidate: Any) -> Optional[Tuple[List[Any], str, float]]:
        if isinstance(candidate, Mapping):
            line = candidate.get("line")
            if isinstance(line, Mapping):
                candidate = line
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
            text = str(text_value).strip() if isinstance(text_value, str) else ""
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
            else:
                confidence = 1.0
        elif isinstance(candidate, (list, tuple)):
            box = []
            text = ""
            confidence = 1.0
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

    @staticmethod
    def _recognition_sort_key(box: Iterable[Any]) -> Tuple[float, float]:
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

    @classmethod
    def _parse_recognition_entries(
        cls, recognition: Iterable[Any]
    ) -> List[Tuple[List[Any], str, float]]:
        parsed: List[Tuple[List[Any], str, float]] = []
        for raw in recognition or []:
            entry = cls._normalize_recognition_entry(raw)
            if entry is not None:
                parsed.append(entry)
        parsed.sort(key=lambda item: cls._recognition_sort_key(item[0]))
        return parsed

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
