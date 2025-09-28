"""Entry-point for the Lecture Tools application."""

from __future__ import annotations

import inspect
import logging
import shutil
import sys
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
from app.processing import (
    FasterWhisperTranscription,
    PyMuPDFSlideConverter,
    describe_audio_debug_stats,
    load_wav_file,
    preprocess_audio,
    save_preprocessed_wav,
)
from app.services.audio_conversion import ensure_wav
from app.services.ingestion import LectureIngestor
from app.services.naming import build_timestamped_name
from app.services.progress import (
    AUDIO_MASTERING_TOTAL_STEPS,
    build_mastering_stage_progress_message,
    format_progress_message,
)
from app.services.storage import LectureRepository
from app.ui.console import ConsoleUI
from app.ui.modern import ModernUI
from app.web import create_app
from app.web.server import get_max_upload_bytes


LOGGER = logging.getLogger("lecture_tools.mastering")


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
        ctx.invoke(serve, host=DEFAULT_HOST, port=DEFAULT_PORT, root_path=None)


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

    config_kwargs = {}
    max_upload_bytes = get_max_upload_bytes()
    if max_upload_bytes > 0:
        config_signature = inspect.signature(uvicorn.Config.__init__)
        if "limit_max_request_size" in config_signature.parameters:
            config_kwargs["limit_max_request_size"] = max_upload_bytes
        else:
            LOGGER.warning(
                "Ignoring max upload size limit; uvicorn.Config does not support "
                "'limit_max_request_size'.",
            )

    server_config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_config=None,
        root_path=normalized_root,
        **config_kwargs,
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


@cli.command("test-mastering", context_settings={"allow_extra_args": True})
def test_mastering(
    ctx: typer.Context,
    audio: Optional[str] = typer.Argument(
        None,
        help="Path to the audio file that should be mastered.",
    ),
    audio_option: Optional[str] = typer.Option(
        None,
        "--audio",
        "-a",
        help="Path to the audio file that should be mastered.",
    ),
) -> None:
    """Run the mastering pipeline on *audio* and report progress."""

    extras = list(ctx.args)

    if audio is not None and audio_option is not None:
        raise typer.BadParameter(
            "Provide the audio file either as a positional argument or via --audio, not both.",
            param_hint="AUDIO",
        )

    if extras:
        if audio is not None or audio_option is not None:
            unexpected = " ".join(extras)
            raise typer.BadParameter(
                f"Unexpected extra arguments: {unexpected}",
                param_hint="AUDIO",
            )
        if len(extras) > 1:
            unexpected = " ".join(extras)
            raise typer.BadParameter(
                f"Audio path must be provided as a single argument (got: {unexpected}).",
                param_hint="AUDIO",
            )
        raw_audio = extras[0]
    else:
        raw_audio = audio_option if audio is None else audio
    if raw_audio is None:
        raise typer.BadParameter(
            "Missing required audio file argument.",
            param_hint="AUDIO",
        )

    audio_path = Path(raw_audio).expanduser()
    if not audio_path.exists() or not audio_path.is_file():
        raise typer.BadParameter(
            f"File '{audio_path}' does not exist or is not a file.",
            param_hint="AUDIO",
        )
    audio_path = audio_path.resolve()

    config = initialize_app()
    _prepare_logging(config.storage_root)
    total_steps = float(AUDIO_MASTERING_TOTAL_STEPS)
    completed_steps = 0.0

    typer.echo(
        format_progress_message(
            "====> Preparing audio mastering…",
            completed_steps,
            total_steps,
        )
    )
    typer.echo(f"Source audio: {audio_path}")

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    wav_path: Optional[Path] = None
    converted = False
    processed_target: Optional[Path] = None

    try:
        typer.echo(
            format_progress_message(
                "====> Ensuring WAV input…",
                completed_steps,
                total_steps,
            )
        )
        wav_path, converted = ensure_wav(
            audio_path,
            output_dir=audio_path.parent,
            stem=audio_path.stem or "audio",
            timestamp=timestamp,
        )
        completed_steps += 1.0

        typer.echo(
            format_progress_message(
                "====> Analysing uploaded audio…",
                completed_steps,
                total_steps,
            )
        )
        samples, sample_rate = load_wav_file(wav_path)
        if LOGGER.isEnabledFor(logging.DEBUG):
            LOGGER.debug(
                "Audio mastering diagnostics before preprocessing for '%s': %s",
                audio_path,
                describe_audio_debug_stats(samples, sample_rate),
            )
        completed_steps += 1.0

        stage_message, stage_description, stage_index, total_stage_count = (
            build_mastering_stage_progress_message(completed_steps, total_steps)
        )
        typer.echo(stage_message)
        for detail in stage_description.detail_lines:
            typer.echo(f"        • {detail}")
        if LOGGER.isEnabledFor(logging.INFO):
            LOGGER.info(
                "Mastering stage %s/%s operations: %s",
                stage_index,
                total_stage_count,
                "; ".join(stage_description.detail_lines),
            )
            LOGGER.info(
                "Mastering stage %s/%s parameters: %s",
                stage_index,
                total_stage_count,
                ", ".join(
                    f"{name}={value}" for name, value in stage_description.parameters.items()
                ),
            )
        processed = preprocess_audio(samples, sample_rate)
        if LOGGER.isEnabledFor(logging.DEBUG):
            LOGGER.debug(
                "Audio mastering diagnostics after preprocessing for '%s': %s",
                audio_path,
                describe_audio_debug_stats(processed, sample_rate),
            )
        completed_steps += 1.0

        typer.echo(
            format_progress_message(
                "====> Rendering mastered waveform…",
                completed_steps,
                total_steps,
            )
        )
        base_stem = audio_path.stem or "audio"
        candidate = wav_path.parent / f"{base_stem}-master.wav"
        if candidate.exists():
            candidate = candidate.parent / build_timestamped_name(
                f"{base_stem}-master",
                timestamp=timestamp,
                extension=".wav",
            )

        save_preprocessed_wav(candidate, processed, sample_rate)
        processed_target = candidate
        completed_steps = total_steps

    except ValueError as error:
        typer.echo(f"Audio mastering failed: {error}")
        raise typer.Exit(code=1) from error
    except Exception as error:  # noqa: BLE001 - surfacing unexpected issues
        typer.echo(f"Unexpected mastering failure: {error}")
        raise typer.Exit(code=1) from error
    finally:
        if converted and wav_path and wav_path.exists() and wav_path != audio_path:
            wav_path.unlink(missing_ok=True)

    typer.echo(
        format_progress_message(
            "====> Audio mastering completed.",
            completed_steps,
            total_steps,
        )
    )
    if processed_target is not None:
        typer.echo(f"Mastered audio saved to: {processed_target}")
    typer.echo(f"Original audio remains at: {audio_path}")


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
    if len(sys.argv) > 1 and sys.argv[1] in {
        "-testmastering",
        "--testmastering",
        "--test-mastering",
    }:
        sys.argv[1] = "test-mastering"
    cli()
