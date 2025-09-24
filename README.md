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
3. [🖥️ Debian 13 VPS Deployment](#%F0%9F%96%A5%EF%B8%8F-debian-13-vps-deployment)
4. [🧭 Project Structure](#-project-structure)
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

## 🖥️ Debian 13 VPS Deployment

You can either use the automated installer or follow the manual steps below to configure the application as a managed service.

### ⚙️ Automated installer (Nginx + HTTPS)

Make sure Git is available, clone the repository, and run the helper script as root on a fresh Debian 13 server:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/NIAENGD/Lecture-Tools.git
cd Lecture-Tools
sudo ./scripts/install_server.sh
```

The script will:

- install required system packages (Python, Git, Nginx, Certbot, …),
- create the `/opt/lecture-tools` application home and service account,
- copy the repository, set up the virtual environment, and register the systemd unit,
- ask for the public domain and optional URL prefix (e.g. `/lecture`) and configure Nginx as a reverse proxy, and
- optionally request and auto-renew HTTPS certificates via Let's Encrypt.

To remove the deployment later, run `sudo ./scripts/remove_server.sh`. For a complete cleanup—including data, service account, and certificates—run `sudo ./scripts/remove_server_full.sh`.

### 🛠️ Manual installation

Follow the steps below to deploy Lecture Tools manually and serve it securely at a custom domain (e.g. `lecture.example.com/tools`).

### 1. Prepare the server

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip git nginx certbot python3-certbot-nginx
sudo adduser --system --group --home /opt/lecture-tools lecturetools
sudo mkdir -p /opt/lecture-tools
sudo chown -R lecturetools:lecturetools /opt/lecture-tools
```

> 🧱 The dedicated `lecturetools` user isolates the application from the rest of the system. The Nginx and Certbot packages are installed now so that HTTPS can be configured later without additional steps.

### 2. Deploy the application

```bash
sudo -u lecturetools git clone https://github.com/NIAENGD/Lecture-Tools.git /opt/lecture-tools/app
sudo -u lecturetools python3 -m venv /opt/lecture-tools/.venv
sudo -u lecturetools /opt/lecture-tools/.venv/bin/pip install --upgrade pip
sudo -u lecturetools /opt/lecture-tools/.venv/bin/pip install -r /opt/lecture-tools/app/requirements-dev.txt
```

Create an environment file for runtime configuration:

```bash
sudo -u lecturetools tee /opt/lecture-tools/app/.env <<'EOF'
LECTURE_TOOLS_ROOT_PATH=/tools
LECTURE_TOOLS_LOG_LEVEL=info
EOF
```

Adjust values (database URLs, storage paths, etc.) as needed for your deployment.

### 3. Review the systemd service

The repository ships a unit file at `config/systemd/lecture-tools.service`. Update the following directives if required:

- `WorkingDirectory=` – path containing `run.py` (default `/opt/lecture-tools/app`).
- `ExecStart=` – full path to the virtual environment’s Python interpreter and desired `run.py` command. Add `--root-path /tools` to match the sub-path you plan to expose.
- `EnvironmentFile=` – point to `/opt/lecture-tools/app/.env` if you want systemd to load it automatically.
- `User=` / `Group=` – ensure the service runs as the `lecturetools` user.

### 4. Install and enable the service

```bash
sudo cp /opt/lecture-tools/app/config/systemd/lecture-tools.service /etc/systemd/system/lecture-tools.service
sudo chown root:root /etc/systemd/system/lecture-tools.service
sudo chmod 644 /etc/systemd/system/lecture-tools.service
sudo systemctl daemon-reload
sudo systemctl enable --now lecture-tools
sudo systemctl status lecture-tools
```

Tail runtime logs with `journalctl -u lecture-tools -f` to confirm that the API is listening on `http://127.0.0.1:8000`.

### 5. Configure Nginx for `https://lecture.example.com/tools`

Replace `lecture.example.com` with your domain and `/tools` with the sub-path you selected.

```bash
sudo tee /etc/nginx/sites-available/lecture-tools.conf <<'EOF'
server {
    listen 80;
    server_name lecture.example.com;

    location /tools/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Prefix /tools;
        proxy_redirect off;
    }

    location /tools/static/ {
        proxy_pass http://127.0.0.1:8000/static/;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/lecture-tools.conf /etc/nginx/sites-enabled/lecture-tools.conf
sudo nginx -t
sudo systemctl reload nginx
```

> 📌 The `proxy_set_header X-Forwarded-Prefix /tools` header and matching `LECTURE_TOOLS_ROOT_PATH` ensure that FastAPI generates correct URLs for assets and API routes.

### 6. Issue a Let's Encrypt certificate

Certbot will detect the Nginx site and request a certificate for the defined domain. The `--redirect` flag automatically updates the configuration to force HTTPS.

```bash
sudo certbot --nginx -d lecture.example.com --non-interactive --agree-tos -m admin@lecture.example.com --redirect
```

Verify the renewal timer:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

### 7. Update the deployment

Whenever you pull new code, restart the service to pick up the changes:

```bash
sudo systemctl stop lecture-tools
sudo -u lecturetools git -C /opt/lecture-tools/app pull
sudo -u lecturetools /opt/lecture-tools/.venv/bin/pip install -r /opt/lecture-tools/app/requirements-dev.txt
sudo systemctl start lecture-tools
```

Your Lecture Tools instance is now available at `https://lecture.example.com/tools/` with automatic HTTPS renewal and an isolated systemd service.

> 🔐 Harden your VPS further by restricting inbound firewall rules to ports 22 and 443, rotating SSH keys regularly, and monitoring `journalctl` logs for suspicious activity.

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
