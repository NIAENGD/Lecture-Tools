# Lecture Tools

Lecture Tools ingests lecture recordings and slide decks, producing searchable
transcripts and paired slide images organised by class → module → lecture. The
project emphasises a portable workflow that keeps dependencies self-contained
inside the repository's `storage` and `assets` directories.

Key capabilities include:

- A polished desktop overview with a navigation tree, stats cards, and lecture detail panes that let you browse classes in a modern UI as soon as the app launches.
- SQLite-backed storage for classes, modules, and lectures.
- Automatic folder management for raw uploads and processed artefacts.
- CPU-only transcription using [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (models download to `assets`).
- Optional GPU-accelerated Whisper transcription via the bundled Windows CLI runner.
- Slide conversion with PyMuPDF and Pillow that exports vertically stacked slide pairs.
- A Typer-powered CLI for ingesting lectures and reviewing stored metadata.

## Getting Started

1. Ensure Python 3.11 or later is available on your system.
2. (Optional) Create and activate a virtual environment.
3. On Windows, run `start.bat` to bootstrap the project. On macOS and Linux,
   use the companion `start.sh` script. Both helpers:

   - create a local `.venv` virtual environment if one does not exist,
   - install the dependencies from `requirements-dev.txt` (or `requirements.txt`
     when the development file is absent), and
   - launch the CLI so you can pass commands such as `overview` or `ingest`.

   ```powershell
   .\start.bat overview
   ```

   ```bash
   ./start.sh overview
   ```

   Prefer manual setup? Install the runtime dependencies yourself:

   ```bash
   pip install -r requirements-dev.txt
   ```

   The runtime stack relies on CPU-only builds of `faster-whisper`, `PyMuPDF`,
   `Pillow`, and `typer`. The first transcription run downloads the selected
   Whisper model into `assets/` automatically. GPU acceleration is optional and
   requires manual setup (see below).

4. Launch the new web experience:

   ```bash
   python run.py  # or: python run.py serve --host 0.0.0.0 --port 9000
   ```

   The command starts a lightweight FastAPI server that serves a responsive
   dashboard at `http://127.0.0.1:8000/`. The page combines shimmering cards for
   high-level statistics with an interactive tree that lets you drill down from
   classes to modules and individual lectures. Asset links open directly from
   the browser, so transcripts, audio, and slide images are always one click
   away.

   Prefer the original terminal styles? They are still available:

   ```bash
   python run.py overview --style modern
   python run.py overview --style console
   ```

5. Ingest a lecture by providing an audio/video file and (optionally) a PDF deck:

   ```bash
   python run.py ingest \
     --class-name "Computer Science" \
     --module-name "Algorithms" \
     --lecture-name "Sorting" \
     --audio path/to/lecture.wav \
     --slides path/to/deck.pdf
   ```

   The CLI stores raw uploads under `storage/<class>/<module>/<lecture>/raw`
   and writes transcripts plus slide images into the corresponding
   `processed/transcripts` and `processed/slides` folders. The SQLite database
   is updated with the relative paths so the information can be surfaced in the
   overview command or future graphical front-ends.

### GPU-accelerated Whisper (optional)

The repository ships with a Windows-only `cli/main.exe` binary that can drive a
GPU-enabled Whisper transcription. To enable it:

1. Create an `assets/models/` directory if it does not already exist.
2. Download the `ggml-medium.en.bin` model from
   [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin)
   and place the file inside `assets/models/`.
3. When running `python run.py ingest`, set `--whisper-model GPU`.
4. In the web interface, open **Settings → Whisper transcription** and click
   **Test support**. If the CLI prints diagnostic output the GPU option is
   unlocked in both the default model selector and the lecture transcription
   dropdown.

During ingestion or web-driven transcription the application probes whether
`cli/main.exe` can run on the current platform. If it produces output, the GPU
path is used and real-time progress is displayed using a `====>` bar derived
from the CLI timestamps (the web UI mirrors this progress in the status banner).
When the binary is unavailable or unsupported, the workflow automatically falls
back to the standard CPU-based `faster-whisper` pipeline.

## Running Tests

Execute the test suite with:

```bash
pytest
```

The tests rely on lightweight dummy processing backends so they run quickly
without downloading ML models.
