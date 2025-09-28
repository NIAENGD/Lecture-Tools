# Manual Debian Server Installation

This guide walks through a full manual installation of Lecture Tools on a Debian 12 (Bookworm) server without relying on Docker. Every step assumes you have `sudo` privileges on the target machine. Adjust paths and usernames to match your environment.

## 1. Update the operating system

```bash
sudo apt update
sudo apt upgrade
```

Reboot if the kernel or critical libraries were upgraded.

## 2. Install system dependencies

Lecture Tools requires Python 3.11+, build tooling for native wheels, FFmpeg for media handling, and PortAudio for the `sounddevice` helper. Install the packages with APT:

```bash
sudo apt install \
  python3.11 python3.11-venv python3-pip \
  git ffmpeg libportaudio2 build-essential
```

If you are targeting GPU acceleration later, install the appropriate CUDA drivers separately.

## 3. (Optional) Create a dedicated service account

Running the application under its own user keeps the deployment self-contained:

```bash
sudo adduser --system --group --home /opt/lecture-tools lecturetools
sudo mkdir -p /opt/lecture-tools
sudo chown lecturetools:lecturetools /opt/lecture-tools
```

Log in as that user (or switch with `sudo -iu lecturetools`) before continuing.

## 4. Clone the repository

Choose the directory where Lecture Tools should live and clone the project:

```bash
cd /opt/lecture-tools
git clone https://github.com/NIAENGD/Lecture-Tools.git
cd Lecture-Tools
```

## 5. Create an isolated Python environment

Use the built-in `venv` module so system packages remain untouched:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
```

Whenever you start a new shell session, reactivate the virtual environment with `source /opt/lecture-tools/Lecture-Tools/.venv/bin/activate`.

## 6. Install Python requirements

The repository ships with a `requirements-dev.txt` that mirrors the dependencies used in the Docker image (`faster-whisper`, FastAPI, uvicorn, etc.). Install them via pip:

```bash
pip install --upgrade pip
pip install -r requirements-dev.txt
```

If you only need the runtime dependencies you can swap in `requirements.txt` instead.

## 7. Review storage configuration

By default Lecture Tools stores processed lectures under `storage/`, persistent assets under `assets/`, and the SQLite database at `storage/lectures.db`. You can adjust these paths by editing `config/default.json` before the first launch:

```json
{
  "storage_root": "storage",
  "database_file": "storage/lectures.db",
  "assets_root": "assets"
}
```

All paths are resolved relative to the repository root, so you can point them at mounted volumes (e.g., `/srv/lecture-tools/storage`).

## 8. Prime the application

The bootstrap process creates any missing directories and ensures the database schema exists. Run the CLI once to perform that work:

```bash
python run.py overview --style console
```

You can substitute any command (including `serve`)—the bootstrap executes automatically during startup.

## 9. Launch the web UI

Start the FastAPI server and expose it on all interfaces. Adjust the port or root path when running behind a reverse proxy:

```bash
python run.py serve --host 0.0.0.0 --port 8000
```

Visit `http://SERVER_IP:8000/` in your browser. If you are serving the app from a sub-path (e.g., `/lecture`), pass `--root-path /lecture` or set `LECTURE_TOOLS_ROOT_PATH=/lecture` in the environment before launching.

## 10. Open firewall ports (if applicable)

On Debian systems with UFW enabled, allow inbound HTTP traffic:

```bash
sudo ufw allow 8000/tcp
```

When reverse proxying, open the port exposed by your proxy instead.

## 11. Optional: run Lecture Tools as a systemd service

A sample unit file is provided in `config/systemd/lecture-tools.service`. Copy and edit it so `WorkingDirectory`, `ExecStart`, `User`, and `Group` match your installation:

```ini
[Service]
WorkingDirectory=/opt/lecture-tools/Lecture-Tools
ExecStart=/opt/lecture-tools/Lecture-Tools/.venv/bin/python run.py serve --host 0.0.0.0 --port 8000
User=lecturetools
Group=lecturetools
```

Install the service and enable it at boot:

```bash
sudo cp config/systemd/lecture-tools.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lecture-tools.service
```

Check the logs with `journalctl -u lecture-tools.service -f`.

## 12. Updating the deployment

When new releases land, pull the latest changes and reinstall dependencies:

```bash
cd /opt/lecture-tools/Lecture-Tools
source .venv/bin/activate
git pull
pip install -r requirements-dev.txt
sudo systemctl restart lecture-tools.service  # if using systemd
```

That’s it—Lecture Tools is now running natively on your Debian server without containers.
