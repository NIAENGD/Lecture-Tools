"""Processing backends for lecture ingestion."""

from .audio import FasterWhisperTranscription
from .recording import AudioRecorder, preprocess_audio, save_preprocessed_wav
from .slides import PyMuPDFSlideConverter

__all__ = [
    "AudioRecorder",
    "FasterWhisperTranscription",
    "PyMuPDFSlideConverter",
    "preprocess_audio",
    "save_preprocessed_wav",
]
