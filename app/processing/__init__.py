"""Processing backends for lecture ingestion."""

from .audio import (
    FasterWhisperTranscription,
    GPUWhisperError,
    GPUWhisperModelMissingError,
    GPUWhisperUnsupportedError,
    check_gpu_whisper_availability,
)
from .recording import AudioRecorder, preprocess_audio, save_preprocessed_wav
from .slides import PyMuPDFSlideConverter

__all__ = [
    "AudioRecorder",
    "FasterWhisperTranscription",
    "GPUWhisperError",
    "GPUWhisperModelMissingError",
    "GPUWhisperUnsupportedError",
    "check_gpu_whisper_availability",
    "PyMuPDFSlideConverter",
    "preprocess_audio",
    "save_preprocessed_wav",
]
