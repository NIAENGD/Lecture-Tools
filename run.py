"""Entry-point for the Lecture Tools application."""

from __future__ import annotations

import logging
from enum import Enum
from pathlib import Path
from typing import Optional

import typer

from app.bootstrap import initialize_app
from app.logging_utils import DEFAULT_LOG_FORMAT, configure_logging, get_log_file_path
from app.processing import FasterWhisperTranscription, PyMuPDFSlideConverter
from app.services.ingestion import LectureIngestor
from app.services.storage import LectureRepository
from app.ui.console import ConsoleUI
from app.ui.modern import ModernUI


cli = typer.Typer(add_completion=False, help="Lecture Tools management commands")


def _prepare_logging(storage_root: Path) -> None:
    log_file = get_log_file_path(storage_root)
    formatter = logging.Formatter(DEFAULT_LOG_FORMAT)
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(formatter)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    configure_logging(handlers=[file_handler, stream_handler])



class UIStyle(str, Enum):
    MODERN = "modern"
    CONSOLE = "console"


@cli.command()
def overview(
    style: UIStyle = typer.Option(
        UIStyle.MODERN,
        "--style",
        "-s",
        help="Select the overview presentation style.",
        show_default=True,
    ),
) -> None:
    """Render an overview of stored lectures using the chosen UI style."""

    config = initialize_app()
    _prepare_logging(config.storage_root)

    repository = LectureRepository(config)
    ui = ModernUI(repository) if style is UIStyle.MODERN else ConsoleUI(repository)
    ui.run()


@cli.command()
def ingest(
    class_name: str = typer.Option(..., help="Class name"),
    module_name: str = typer.Option(..., help="Module name"),
    lecture_name: str = typer.Option(..., help="Lecture title"),
    description: Optional[str] = typer.Option(None, help="Lecture description"),
    audio: Optional[Path] = typer.Option(
        None,
        exists=True,
        file_okay=True,
        dir_okay=False,
        resolve_path=True,
        help="Path to the lecture audio/video file",
    ),
    slides: Optional[Path] = typer.Option(
        None,
        exists=True,
        file_okay=True,
        dir_okay=False,
        resolve_path=True,
        help="Path to the slideshow PDF",
    ),
    whisper_model: str = typer.Option("base", help="Whisper model size to download"),
) -> None:
    """Ingest raw lecture assets and produce transcripts and slide images."""

    config = initialize_app()
    _prepare_logging(config.storage_root)

    repository = LectureRepository(config)
    transcription = None
    if audio is not None:
        transcription = FasterWhisperTranscription(
            whisper_model,
            download_root=config.assets_root,
        )

    slide_converter = PyMuPDFSlideConverter() if slides is not None else None

    ingestor = LectureIngestor(
        config,
        repository,
        transcription_engine=transcription,
        slide_converter=slide_converter,
    )

    lecture = ingestor.ingest(
        class_name=class_name,
        module_name=module_name,
        lecture_name=lecture_name,
        description=description or "",
        audio_file=audio,
        slide_file=slides,
    )

    typer.echo("Ingestion completed.")
    if lecture.transcript_path:
        typer.echo(f"  Transcript: {lecture.transcript_path}")
    if lecture.slide_image_dir:
        typer.echo(f"  Slide images: {lecture.slide_image_dir}")


if __name__ == "__main__":
    cli()
