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
3. [🐳 Docker Deployment (Server)](#-docker-deployment-server)
4. [🧭 Project Tour](#-project-tour)
5. [🎛️ Interface Customization](#-interface-customization)
6. [🛠️ Core Workflows](#-core-workflows)
7. [🧪 Testing](#-testing)
8. [🤝 Contributing](#-contributing)

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

## 🐳 Docker Deployment (Server)

Deploy the Lecture Tools server in a reproducible Docker container. Personal computers can still use the direct setup described above; Docker is now the recommended path for remote servers.

### 📦 Requirements

- Docker Engine 24 or newer
- The Docker Compose plugin (bundled with modern Docker releases)

### 🚀 Quick start

1. Clone the repository on the host that will run the container and navigate into it.
2. (Optional) Define a root-path prefix if the app sits behind a proxy: `export LECTURE_TOOLS_ROOT_PATH=/lecture`.
3. Build and launch the service:
   ```bash
   docker compose up -d
   ```
4. Open `http://SERVER_IP:8000/` (or the proxied address) to reach the UI.

The compose stack mounts `./storage` and `./assets` from the host so transcripts, uploads, and downloaded models persist across restarts.

### 🔧 Configuration

- **Port mapping** – Adjust the `8000:8000` mapping in `docker-compose.yml` when exposing a different port.
- **Reverse proxies** – When terminating TLS with Nginx/Traefik, forward to the container and ensure the `LECTURE_TOOLS_ROOT_PATH` environment variable matches any prefix you inject (e.g. `/lecture`).
- **Custom images** – Build and push your own tag with `docker build -t registry.example.com/lecture-tools:latest .` and update the compose file to reference it.

### ♻️ Updating

```bash
docker compose pull  # fetch updated base images
docker compose build # rebuild the Lecture Tools image
docker compose up -d --force-recreate
```

### 🧹 Removing the stack

```bash
docker compose down
```

Remove the `storage/` and `assets/` directories manually if you no longer need the persisted data.

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

### GPU-accelerated Whisper (optional indulgence)
1. Create `assets/models/` if absent.
2. Download `ggml-medium.en.bin` from [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin).
3. Set `--whisper-model GPU` during ingestion or switch to GPU in the web Settings once the support probe passes.
4. Trigger **Test support** from the settings pane to unlock the GPU option globally.

During transcription, Lecture Tools automatically benchmarks GPU availability and gracefully falls back to CPU pipelines with live progress indicators when acceleration is unavailable.

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
