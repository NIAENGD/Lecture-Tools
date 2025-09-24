"""Processing backends for lecture ingestion."""

from .audio import (
    FasterWhisperTranscription,
    GPUWhisperError,
    GPUWhisperModelMissingError,
    GPUWhisperUnsupportedError,
    check_gpu_whisper_availability,
)
from .recording import load_wav_file, preprocess_audio, save_preprocessed_wav
from .slides import PyMuPDFSlideConverter

__all__ = [
    "FasterWhisperTranscription",
    "GPUWhisperError",
    "GPUWhisperModelMissingError",
    "GPUWhisperUnsupportedError",
    "check_gpu_whisper_availability",
    "PyMuPDFSlideConverter",
    "load_wav_file",
    "preprocess_audio",
    "save_preprocessed_wav",
]
