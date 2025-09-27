# Lecture Tools Logical Structure

This document summarises the major layers, data flows, and integration points that make up the Lecture Tools platform. It is organised from the outermost entry points down to the lower-level processing utilities so that developers can trace how user actions propagate through the system.

## 1. Runtime Entry Points

### 1.1 Command-line bootstrap
- `run.py` exposes a Typer-powered CLI. Invoking the script with no arguments launches the FastAPI web server through the `serve` command, while explicit subcommands provide administrative workflows such as overview rendering, audio mastering tests, asset ingestion, and standalone transcription.
- Every CLI invocation begins by loading configuration and running `initialize_app()`, ensuring directories, logging, and the SQLite database are ready before the requested workflow executes.【F:run.py†L110-L158】【F:run.py†L215-L366】

### 1.2 Web server startup
- The `serve` command initialises the FastAPI application via `create_app`, mounts static assets, opens a browser tab for convenience, and runs Uvicorn with the configured root path, host, and port settings.【F:run.py†L98-L143】
- When started without arguments, `run.py` rewrites legacy `--testmastering` flags for compatibility and dispatches the CLI entry point, keeping command variants consistent.【F:run.py†L443-L450】

## 2. Configuration & Bootstrapping

- `AppConfig` provides strongly typed paths for the storage root, SQLite database, and assets directory derived from `config/default.json`. The configuration loader resolves relative locations against the project root for predictable filesystem layout.【F:app/config.py†L11-L43】【F:config/default.json†L1-L5】
- `initialize_app()` creates a `Bootstrapper` that ensures runtime directories exist, clears temporary archives, and migrates the SQLite schema for classes, modules, and lectures (including optional columns and position ordering).【F:app/bootstrap.py†L19-L171】

## 3. Persistence Model

### 3.1 Database schema
- The bootstrap routine creates three core tables (`classes`, `modules`, `lectures`) with cascading deletes, textual metadata, ordering columns, and optional asset paths so that the UI can track uploaded artefacts and their derived outputs.【F:app/bootstrap.py†L54-L160】

### 3.2 Repository abstraction
- `LectureRepository` centralises CRUD operations for domain records, opening SQLite connections with foreign key enforcement and computing ordering positions when new entities are inserted.【F:app/services/storage.py†L52-L200】
- Iterators expose classes, modules, and lectures to other layers, while update helpers mutate stored asset paths as processing pipelines produce transcripts, slides, and mastered audio.【F:app/services/storage.py†L201-L400】

## 4. Filesystem Layout

- `LecturePaths` calculates the on-disk directories (raw uploads, processed audio, transcripts, slides, notes) derived from slugified class/module/lecture names, and guarantees that each path exists before ingestion proceeds.【F:app/services/ingestion.py†L58-L176】
- Asset naming utilities (`slugify`, `build_asset_stem`, `build_timestamped_name`) keep filenames stable and collision-free across ingestion runs, incorporating timestamps and sequences when necessary.【F:app/services/naming.py†L16-L49】

## 5. Domain Services & Utilities

- `ensure_wav()` upgrades arbitrary audio files to PCM WAV using FFmpeg, selecting destination names based on timestamped stems and reporting conversion failures with meaningful diagnostics.【F:app/services/audio_conversion.py†L17-L111】
- `format_progress_message()` and `build_mastering_stage_progress_message()` turn deterministic stage counts into human-readable status updates consumed by CLI tasks and web polling endpoints.【F:app/services/progress.py†L1-L78】
- `SettingsStore` serialises UI preferences (theme, language, Whisper defaults, slide DPI, toggles) to `storage/settings.json`, providing resilient load/save behaviour when files are missing or corrupted.【F:app/services/settings.py†L21-L69】

## 6. Processing Pipelines

### 6.1 Audio mastering
- `test-mastering` within `run.py` orchestrates the mastering flow: convert inputs to WAV, analyse statistics, run `preprocess_audio`, and persist the mastered result while reporting structured progress messages.【F:run.py†L161-L336】
- The preprocessing backend in `app/processing/recording.py` performs noise reduction, equalisation, compression, loudness normalisation, and diagnostic logging to optimise speech clarity.【F:app/processing/recording.py†L45-L200】

### 6.2 Transcription
- `FasterWhisperTranscription` adapts to CPU (`faster-whisper` library) or GPU CLI execution, probing binaries/models, streaming progress updates, and saving both transcript text and segment JSON for downstream use.【F:app/processing/audio.py†L48-L277】
- The transcription CLI command and ingestion workflow construct this engine with assets stored in the configured download directory, ensuring consistent model caching across runs.【F:run.py†L338-L439】

### 6.3 Slide conversion
- `PyMuPDFSlideConverter` renders PDF slides to PNG images inside a ZIP archive, notifying progress callbacks as each page is processed. Dependency checks guard against missing PyMuPDF installations.【F:app/processing/slides.py†L27-L177】

## 7. Ingestion Workflow

- `LectureIngestor` coordinates the high-level ingestion flow: ensure class/module/lecture records exist, copy uploaded audio/slides into the raw directory, invoke transcription and slide conversion backends, and persist relative asset paths back to the repository.【F:app/services/ingestion.py†L135-L200】
- Successful CLI ingestion prints the locations of generated transcripts and slide images, providing immediate feedback to operators.【F:run.py†L338-L399】

## 8. Web Application Layer

### 8.1 Application scaffolding
- `create_app()` instantiates FastAPI with CORS support, mounts static assets, injects PDF.js URLs into the HTML shell, and attaches progress trackers that capture long-running operations for polling clients.【F:app/web/server.py†L765-L860】【F:app/web/server.py†L120-L241】

### 8.2 REST API surface
- Endpoints under `/api` manage the curriculum hierarchy (list/create/delete classes, modules, lectures), update lecture metadata, and stream files from the storage tree with defensive path validation.【F:app/web/server.py†L1347-L1520】
- Additional routes trigger transcription, slide previews, slide processing, GPU diagnostics, storage purges, exports/imports, and graceful shutdown. Each task logs contextual events and updates the shared progress tracker for the web UI to display status in real time.【F:app/web/server.py†L2320-L2438】【F:app/web/server.py†L2434-L2642】【F:app/web/server.py†L2990-L3027】

### 8.3 Settings & diagnostics
- The web layer persists UI preferences through `SettingsStore`, tests GPU Whisper availability, and streams debug log entries collected by an in-memory handler so administrators can review recent activity without leaving the browser.【F:app/web/server.py†L773-L807】【F:app/services/settings.py†L35-L69】

## 9. User Interfaces

- `ModernUI` renders a Rich-based dashboard in the terminal, combining tree views and statistics by querying the repository, while `ConsoleUI` offers a lightweight textual alternative; both reuse the shared `collect_overview()` snapshot builder.【F:app/ui/modern.py†L27-L145】【F:app/ui/console.py†L18-L83】【F:app/ui/overview.py†L11-L105】
- The FastAPI SPA served from `app/web/static` consumes the same REST endpoints, presenting a graphical management experience with live progress feedback fed by `TranscriptionProgressTracker`.【F:app/web/server.py†L146-L233】【F:app/web/server.py†L765-L860】

## 10. External Integrations

- Audio conversion relies on FFmpeg being available on the execution path; failure to find the binary or a supported codec surfaces actionable errors to users.【F:app/services/audio_conversion.py†L33-L111】
- Transcription can leverage the GPU-enabled CLI when bundled binaries and models are present, falling back to CPU inference when unavailable. The platform records GPU capability tests so the UI can report compatibility status.【F:app/processing/audio.py†L48-L277】【F:app/web/server.py†L2320-L2432】
- Slide rendering uses PyMuPDF and Pillow; missing dependencies trigger explicit `SlideConversionDependencyError` exceptions that bubble up to the API and CLI surfaces.【F:app/processing/slides.py†L27-L177】

---

This overview is intended to help contributors navigate the repository, understand where new functionality should live, and appreciate how runtime concerns—configuration, persistence, processing, APIs, and user interfaces—fit together within Lecture Tools.
