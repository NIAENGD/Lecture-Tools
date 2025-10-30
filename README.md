<h1 align="center">Lecture Tools</h1>

<p align="center"><strong>A comprehensive platform for lecture capture, transcription, and course management.</strong></p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Made%20with-Python%203.11-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/API-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
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
- **Dashboard navigation** – Move from classes to modules to lectures with a unified interface that keeps relevant actions and statistics close at hand.
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
4. **Enter the immersive web suite**
   ```bash
   python run.py  # or customise: python run.py serve --host 0.0.0.0 --port 9000
   ```
   Visit **http://127.0.0.1:8000/** to enjoy the modern control centre.
   - Deploying behind a reverse proxy? Provide the mount prefix so API, UI, and
     static assets resolve correctly:
       ```bash
       python run.py serve --root-path /lecture
       ```
     or set `LECTURE_TOOLS_ROOT_PATH=/lecture` in the environment.
5. **Classic terminal vibes still included**
 ```bash
  python run.py overview --style modern
  python run.py overview --style console
 ```

---

## 🤖 Automated Server Install (systemd)

Need a headless deployment that boots automatically? The repository now ships a
full bare-metal installer that provisions Lecture Tools as a native systemd
service—no containers required.

```bash
curl -fsSL https://raw.githubusercontent.com/NIAENGD/Lecture-Tools/main/scripts/install_server.sh | sudo bash
```

What the helper now does for you:

- Validates that you are running on a Debian-based distribution and installs
  any missing system dependency (Python 3.11, FFmpeg, PortAudio, build tools,
  git) without re-downloading packages that are already present.
- Detects previous Docker-based deployments, offers to tear them down (systemd
  unit, Compose stack, legacy config), and reuses details from existing native
  installs so re-running the script is idempotent.
- Prompts for the Git repository, branch, installation directory (default
  `/opt/lecture-tools`), HTTP port, optional root path (normalising entries such
  as `lecturetools` to `/lecturetools`), public domain, and TLS
  certificate/key locations—auto-detecting Let’s Encrypt assets when they
  already exist so you can skip duplicate configuration.
- Clones or updates the repository in-place, creates an isolated virtual
  environment, and installs dependencies from `requirements-dev.txt` when
  available (falling back to `requirements.txt`).
- Writes/updates a dedicated systemd unit that runs `run.py serve --host
  0.0.0.0` at boot, stops any previous instance before redeploying, and when
  UFW is active, offers to open the chosen port.
- Installs an expanded management CLI named `lecturetool` under
  `/usr/local/bin` with subcommands such as `start`, `stop`, `restart`,
  `reload`, `logs`/`tail`, `nginx`, `update`, `upgrade`, `info`, `config`,
  `doctor`, `shell`, and `purge` (full uninstall) for quick troubleshooting and
  lifecycle management.

Example service management:

```bash
sudo lecturetool status      # Inspect service health
sudo lecturetool doctor      # Run a health check (service, ports, TLS files)
sudo lecturetool update      # Pull the latest git commit & reinstall deps
sudo lecturetool shell       # Drop into a shell as the service account
sudo lecturetool purge       # Remove service, config, files, and service user

# Configure an Nginx reverse proxy (interactive wizard + manual modes)
sudo lecturetool nginx            # Launch the guided setup (choose IP/HTTP/HTTPS with Let's Encrypt assistance)
sudo lecturetool nginx https example.com \
  /etc/letsencrypt/live/example.com/fullchain.pem \
  /etc/letsencrypt/live/example.com/privkey.pem
sudo lecturetool nginx http example.com 80  # Plain HTTP for a domain
sudo lecturetool nginx ip 80                # Plain HTTP bound to the server IP
```

Ready to uninstall? Two cleanup helpers are available:

- `scripts/remove_server.sh` disables the service, removes the helper CLI, and
  leaves the code/data on disk.
- `scripts/remove_server_full.sh` chains the above and interactively removes the
  repository directory plus the dedicated system user.
- `sudo lecturetool purge` provides a non-interactive option to stop the
  service, remove the repository, configuration, systemd unit, helper CLI, and
  dedicated service user in one step.

---

## 🧰 Manual Debian Server Install

Need a reproducible bare-metal deployment? Follow the step-by-step [Debian manual installation guide](docs/debian-manual-install.md) to provision system packages, configure Python, and (optionally) wire Lecture Tools into systemd.

---

## 🧭 Project Tour

| Area | Description |
| --- | --- |
| `app/` | Application core – services, UI layers, background workers, and FastAPI server. |
| `assets/` | Whisper models and supporting binaries land here. |
| `storage/` | Your curated lecture library lives here with raw uploads and processed exports. |
| `cli/` | Cross-platform helpers, including the optional GPU-enabled Windows binary. |
| `tests/` | Pytest suite with lightweight doubles for rapid validation. |

---

## 🎛️ Interface Personalisation

Visit **Settings → Appearance** in the web UI to tailor the ambience:

- **Theme**: Follow your system palette or opt for Light/Dark.
- **Language**: Choose English (`en`), 中文 (`zh`), Español (`es`), or Français (`fr`). Preferences persist in `storage/settings.json` and sync automatically across sessions.
- **Whisper defaults**: Pre-select your transcription model, compute type, and beam size; GPU options unlock once verified.
- **Slide rendering**: Dial in DPI quality from lightning-fast 150 to exquisite 600.

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
Slides can be ingested from PDFs (which enable Markdown bundle generation) or from other document formats such as DOC/DOCX and Markdown. Non-PDF files are stored alongside the lecture for direct download without additional processing.
The CLI stores originals under `storage/<class>/<module>/<lecture>/raw` while transcripts and slides enter the `processed/` suites. Metadata is tracked in SQLite for instant retrieval by the UI.

Slide processing now produces a Markdown document with inline image references plus the rendered slide images. The Markdown file lives in `processed/notes/` and the web UI exposes a single ZIP bundle containing the Markdown and its assets from `processed/slides/`.

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
