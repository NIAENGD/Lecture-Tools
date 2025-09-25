"""Entry-point for the Lecture Tools application."""

from __future__ import annotations

import logging
import shutil
import threading
import time
import webbrowser
from enum import Enum
from pathlib import Path
from typing import Optional

import uvicorn
import typer

from app.bootstrap import initialize_app
from app.logging_utils import DEFAULT_LOG_FORMAT, configure_logging, get_log_file_path
from app.processing import FasterWhisperTranscription, PyMuPDFSlideConverter
from app.services.ingestion import LectureIngestor
from app.services.storage import LectureRepository
from app.ui.console import ConsoleUI
from app.ui.modern import ModernUI
from app.web import create_app


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

style_option = typer.Option(
    UIStyle.MODERN,
    "--style",
    "-s",
    help="Select the overview presentation style.",
    show_default=True,
)


@cli.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Launch the web server when no explicit command is provided."""

    if ctx.invoked_subcommand is None:
        ctx.invoke(serve, host=DEFAULT_HOST, port=DEFAULT_PORT)


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000


def _normalize_root_path(root_path: Optional[str]) -> str:
    if root_path is None:
        return ""
    normalized = root_path.strip()
    if not normalized:
        return ""
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    normalized = normalized.rstrip("/")
    if normalized == "":
        return ""
    return normalized


@cli.command()
def serve(
    host: str = typer.Option(DEFAULT_HOST, help="Host interface for the web server"),
    port: int = typer.Option(DEFAULT_PORT, help="Port for the web server"),
    root_path: Optional[str] = typer.Option(
        None,
        help="Prefix the application expects when mounted behind a proxy",
        envvar="LECTURE_TOOLS_ROOT_PATH",
    ),
) -> None:
    """Run the FastAPI-powered web experience."""

    app_config = initialize_app()
    _prepare_logging(app_config.storage_root)

    repository = LectureRepository(app_config)
    normalized_root = _normalize_root_path(root_path)
    app = create_app(repository, config=app_config, root_path=normalized_root)

    server_config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_config=None,
        root_path=normalized_root,
    )
    server = uvicorn.Server(server_config)
    app.state.server = server

    browser_host = host
    if not browser_host or browser_host in {"0.0.0.0", "::"}:
        browser_host = "127.0.0.1"
    browser_suffix = normalized_root.rstrip("/")
    url_path = f"{browser_suffix}/" if browser_suffix else "/"
    url = f"http://{browser_host}:{port}{url_path}"

    def _open_browser_later() -> None:
        time.sleep(1.0)
        try:
            webbrowser.open(url, new=2, autoraise=True)
        except Exception:
            pass

    threading.Thread(target=_open_browser_later, daemon=True).start()

    server.run()


@cli.command()
def overview(style: UIStyle = style_option) -> None:
    """Render an overview of stored lectures using the chosen UI style."""

    config = initialize_app()
    _prepare_logging(config.storage_root)

    repository = LectureRepository(config)
    if style is UIStyle.MODERN:
        ui = ModernUI(repository)
    else:
        ui = ConsoleUI(repository)
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


@cli.command()
def transcribe_audio(
    audio: Path = typer.Argument(
        ...,
        exists=True,
        file_okay=True,
        dir_okay=False,
        resolve_path=True,
        help="Path to the audio file to transcribe.",
    ),
    whisper_model: str = typer.Option("base", help="Whisper model size to download"),
) -> None:
    """Transcribe *audio* using the standard Lecture Tools pipeline."""

    config = initialize_app()
    _prepare_logging(config.storage_root)

    typer.echo(f"Transcribing audio: {audio}")

    transcription = FasterWhisperTranscription(
        whisper_model,
        download_root=config.assets_root,
    )

    audio_path = audio.resolve()
    output_dir = audio_path.parent / f"{audio_path.stem}_transcription"
    output_dir.mkdir(parents=True, exist_ok=True)

    typer.echo(f"Writing intermediate results to: {output_dir}")
    result = transcription.transcribe(audio_path, output_dir)

    final_transcript = audio_path.parent / f"{audio_path.stem}_transcript.txt"
    shutil.copy2(result.text_path, final_transcript)
    typer.echo(f"Transcript saved to: {final_transcript}")

    if result.segments_path is not None and result.segments_path.exists():
        final_segments = audio_path.parent / f"{audio_path.stem}_segments.json"
        shutil.copy2(result.segments_path, final_segments)
        typer.echo(f"Segment breakdown saved to: {final_segments}")

    typer.echo("Transcription completed successfully.")


if __name__ == "__main__":
    cli()
