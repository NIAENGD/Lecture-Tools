"""Processing backends for lecture ingestion."""

from .audio import FasterWhisperTranscription
from .slides import PyMuPDFSlideConverter

__all__ = ["FasterWhisperTranscription", "PyMuPDFSlideConverter"]
