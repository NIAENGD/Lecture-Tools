"""Processing backends for lecture ingestion."""

from .audio import (
    FasterWhisperTranscription,
    GPUWhisperError,
    GPUWhisperModelMissingError,
    GPUWhisperUnsupportedError,
    check_gpu_whisper_availability,
)
from .recording import (
    PreprocessAudioStageDescription,
    check_audio_mastering_cli_availability,
    describe_audio_debug_stats,
    describe_preprocess_audio_stage,
    load_wav_file,
    preprocess_audio,
    save_preprocessed_wav,
)
from .slides import PyMuPDFSlideConverter

__all__ = [
    "FasterWhisperTranscription",
    "GPUWhisperError",
    "GPUWhisperModelMissingError",
    "GPUWhisperUnsupportedError",
    "check_gpu_whisper_availability",
    "check_audio_mastering_cli_availability",
    "PyMuPDFSlideConverter",
    "describe_audio_debug_stats",
    "describe_preprocess_audio_stage",
    "load_wav_file",
    "preprocess_audio",
    "PreprocessAudioStageDescription",
    "save_preprocessed_wav",
]
