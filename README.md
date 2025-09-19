# Lecture Tools

Lecture Tools ingests lecture recordings and slide decks, producing searchable
transcripts and paired slide images organised by class → module → lecture. The
project emphasises a portable workflow that keeps dependencies self-contained
inside the repository's `storage` and `assets` directories.

Key capabilities include:

- SQLite-backed storage for classes, modules, and lectures.
- Automatic folder management for raw uploads and processed artefacts.
- CPU-only transcription using [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (models download to `assets`).
- Slide conversion with PyMuPDF and Pillow that exports vertically stacked slide pairs.
- A Typer-powered CLI for ingesting lectures and reviewing stored metadata.

## Getting Started

1. Ensure Python 3.11 or later is available on your system.
2. (Optional) Create and activate a virtual environment.
3. Install the runtime dependencies:

   ```bash
   pip install -r requirements-dev.txt
   ```

   The runtime stack relies on CPU-only builds of `faster-whisper`, `PyMuPDF`,
   `Pillow`, and `typer`. The first transcription run downloads the selected
   Whisper model into `assets/` automatically.

4. Review the stored hierarchy at any time:

   ```bash
   python run.py overview
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

## Running Tests

Execute the test suite with:

```bash
pytest
```

The tests rely on lightweight dummy processing backends so they run quickly
without downloading ML models.
