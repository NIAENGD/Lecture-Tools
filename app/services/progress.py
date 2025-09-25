"""Utilities for reporting deterministic progress percentages."""

from __future__ import annotations

from typing import Optional


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

