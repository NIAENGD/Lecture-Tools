<h1 align="center">Lecture Tools</h1>

<p align="center"><strong>A comprehensive platform for lecture capture, transcription, and course management.</strong></p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Made%20with-Python%203.11-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img alt="Pydantic" src="https://img.shields.io/badge/Validation-Pydantic-3666A0?style=for-the-badge" />
  <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-black?style=for-the-badge" />
</p>

---

## Table of Contents

1. [✨ Key Features](#-key-features)
2. [🏁 Quick Start](#-quick-start)
3. [🤖 Automated Server Install (systemd)](#-automated-server-install-systemd)
4. [🧰 Manual Debian Server Install](#-manual-debian-server-install)
5. [🧭 Project Tour](#-project-tour)
6. [🎛️ Interface Customization](#-interface-customization)
7. [🛠️ Core Workflows](#-core-workflows)
8. [🧪 Testing](#-testing)
9. [🤝 Contributing](#-contributing)

---

## ✨ Key Features

- **Seamless setup** – No build steps or cross-platform workarounds required. Start the project with a single command on any major OS.
- **Dashboard navigation** – The legacy web dashboard has been retired while the next-generation interface is under construction.
- **Managed media pipeline** – Lecture audio, transcripts, and slides are automatically organized and maintained in a structured storage layout.
- **Flexible transcription** – Run CPU-optimized [faster-whisper](https://github.com/SYSTRAN/faster-whisper) locally or enable GPU acceleration when available.
- **Multi-language support** – Switch between **English**, **中文**, **Español**, and **Français** directly from the settings menu.
- **Cross-platform CLI** – A Typer-powered assistant for ingestion, metadata review, and automation workflows.

---

## 🏁 Lightning-Fast Onboarding

> 💡 **Prerequisite**: Nothing! You just run my script and it's gonna set itself up.

1. **Clone & (optionally) isolate dependencies**
   ```bash
   git clone https://github.com/NIAENGD/Lecture-Tools.git
   cd Lecture-Tools
   python -m venv .venv && source .venv/bin/activate  # PowerShell: .\.venv\\Scripts\\Activate.ps1
   ```
2. **Bootstrap with my launcher**
   - Windows: `start.bat`
   - macOS/Linux: `./start.sh`

   Both scripts pamper your environment by creating a virtualenv (if needed), installing from `requirements-dev.txt`, and launching the CLI so you can immediately explore commands like `overview` or `ingest`.
3. **Prefer a bespoke setup?** Install dependencies manually:
   ```bash
   pip install -r requirements-dev.txt
   ```
4. **Explore the CLI toolkit**
   With the GUI overhaul underway, the Typer-powered CLI remains the primary experience:
   ```bash
   python run.py --help
   python run.py overview --style modern
   python run.py ingest --help
   ```

---

## 🤖 Automated Server Install (systemd)

> ⚠️ The legacy systemd installer is currently disabled while the new GUI is
> being developed. A refreshed deployment story will return alongside the new
> interface.

---

## 🧰 Manual Debian Server Install

Need a reproducible bare-metal deployment? While the legacy web server is
offline, the manual guide remains available for reference. Expect major updates
once the new interface lands.

---

## 🧭 Project Tour

| Area | Description |
| --- | --- |
| `app/` | Application core – services, CLI-facing UI layers, and background workers. |
| `assets/` | Whisper models and supporting binaries land here. |
| `storage/` | Your curated lecture library lives here with raw uploads and processed exports. |
| `cli/` | Cross-platform helpers, including the optional GPU-enabled Windows binary. |
| `tests/` | Pytest suite with lightweight doubles for rapid validation. |

---

## 🎛️ Interface Personalisation

The upcoming GUI refresh will reintroduce the detailed appearance controls from the legacy web interface, including theming,
language selection, whisper defaults, and slide rendering preferences. Stay tuned!

---

## 🛠️ Core Workflows

### Transcribe a standalone audio file

Run the same faster-whisper pipeline the application uses, store artefacts in a
temporary workspace, and copy the final transcript/segments beside the source
audio:

```bash
python run.py transcribe-audio path/to/lecture.wav --whisper-model base
```

- **`--whisper-model`** is optional; choose any faster-whisper model tag (e.g.
  `small`, `medium`, `large-v2`).
- Intermediate files (logits, timings, etc.) live in a sibling directory named
  `<audio>_transcription` so you can inspect the raw pipeline output.
- The completed transcript (`<audio>_transcript.txt`) and optional segment
  breakdown (`<audio>_segments.json`) land alongside the original audio file.

### Ingest a lecture
```bash
python run.py ingest \
  --class-name "Computer Science" \
  --module-name "Algorithms" \
  --lecture-name "Sorting" \
  --audio path/to/lecture.wav \
  --slides path/to/slides.pdf
```
The CLI stores originals under `storage/<class>/<module>/<lecture>/raw` while transcripts and slides enter the `processed/` suites. Metadata is tracked in SQLite for instant retrieval by the UI.

Slide processing now produces a Markdown document with inline image references plus the rendered slide images. The Markdown file lives in `processed/notes/` and a consolidated ZIP bundle is stored in `processed/slides/` for future GUI integrations.

### GPU-accelerated Whisper (optional indulgence)
1. Create `assets/models/` if absent.
2. Download `ggml-medium.en.bin` from [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin).
3. Set `--whisper-model GPU` during ingestion or switch to GPU in the web Settings once the support probe passes.
4. Trigger **Test support** from the settings pane to unlock the GPU option globally.

During transcription, Lecture Tools automatically benchmarks GPU availability and gracefully falls back to CPU pipelines with live progress indicators when acceleration is unavailable.

---

### 🎧 Verify the audio mastering CLI (optional)

Run the mastering pipeline end-to-end against a sample file to confirm the helper binary works on your machine:

```bash
python run.py test-mastering path/to/audio.wav
```

Windows users can run the exact same mastering pipeline without touching
Python by launching the dedicated batch helper:

```bat
audio_mastering.bat "C:\Lectures\week1.wav"
```

Prefer a flag-style invocation? The command also understands `-testmastering`:

```bash
python run.py -testmastering path/to/audio.wav
```

Progress mirrors the web upload flow, reporting each step (analysis, noise reduction, render). When the run completes the terminal prints the mastered file location alongside the untouched original.

---

## 🧪 Quality Suite

```bash
pytest
```
The test harness relies on lightweight doubles, so it runs swiftly without needing to download ML models.

---

## 🤝 Contributing

Pull requests are welcome! Please ensure code is formatted, tests are green, and any UI additions respect the project’s modern aesthetic. For feature proposals or feedback, open an issue and let’s craft the next premium experience together.

---

<p align="center">Crafted with care for educators, researchers, and knowledge artisans everywhere.</p>
