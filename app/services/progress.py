"""Utilities for reporting deterministic progress percentages."""

from __future__ import annotations

from typing import Optional, Tuple

from app.processing.recording import (
    PreprocessAudioStageDescription,
    describe_preprocess_audio_stage,
)


# The mastering pipeline consists of four major stages that are surfaced to the
# user: ensuring a WAV input, analysing the audio, reducing background noise,
# and rendering the mastered waveform.
AUDIO_MASTERING_TOTAL_STEPS: float = 4.0


def format_progress_message(
    message: str,
    completed_steps: Optional[float],
    total_steps: Optional[float],
) -> str:
    """Append a percentage indicator to ``message`` when possible.

    ``completed_steps`` represents the number of stages that have already
    finished, while ``total_steps`` is the total number of stages in the
    pipeline. When the totals are unavailable (``None`` or zero) the message is
    returned unchanged. Percentages are clamped to the inclusive range ``[0,100]``.
    """

    if completed_steps is None or total_steps in {None, 0}:
        return message

    try:
        ratio = float(completed_steps) / float(total_steps)
    except (TypeError, ValueError):  # Defensive: ensure unexpected types fail safe
        return message

    clamped = max(0.0, min(ratio, 1.0))
    percent = int(round(clamped * 100))
    return f"{message} ({percent}%)"


def build_mastering_stage_progress_message(
    completed_steps: Optional[float],
    total_steps: Optional[float],
) -> Tuple[str, PreprocessAudioStageDescription, Optional[int], Optional[int]]:
    """Return a descriptive progress message for the mastering stage."""

    description = describe_preprocess_audio_stage()

    stage_index: Optional[int] = None
    if completed_steps is not None:
        try:
            stage_index = int(float(completed_steps)) + 1
        except (TypeError, ValueError):  # Defensive guard against bad inputs
            stage_index = None

    total_count: Optional[int] = None
    if total_steps not in {None, 0}:
        try:
            total_count = int(float(total_steps))
        except (TypeError, ValueError):
            total_count = None

    if stage_index is not None and total_count is not None:
        summary = f"Stage {stage_index}/{total_count} – {description.summary}"
    else:
        summary = description.summary

    message = f"====> {summary}: {description.headline}…"
    return (
        format_progress_message(message, completed_steps, total_steps),
        description,
        stage_index,
        total_count,
    )

