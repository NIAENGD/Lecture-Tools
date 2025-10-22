#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo
    echo "An error occurred while preparing or running Lecture Tools."
    echo "Exit code: $exit_code"
  fi
}
trap cleanup EXIT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Error: Could not find '$PYTHON_BIN' on PATH."
  echo "Please install Python 3.11 or later and try again."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  "$PYTHON_BIN" -m venv .venv
fi

if [ -x ".venv/bin/python" ]; then
  VENV_PY=".venv/bin/python"
elif [ -x ".venv/Scripts/python.exe" ]; then
  VENV_PY=".venv/Scripts/python.exe"
else
  echo "Virtual environment is missing the Python executable."
  exit 1
fi

echo "Updating pip..."
"$VENV_PY" -m pip install --upgrade pip >/dev/null

echo "Installing project requirements..."
if [ -f "requirements-dev.txt" ]; then
  "$VENV_PY" -m pip install -r requirements-dev.txt
elif [ -f "requirements.txt" ]; then
  "$VENV_PY" -m pip install -r requirements.txt
else
  echo "No requirements file found. Skipping dependency installation."
fi

echo
if [ "$#" -eq 0 ]; then
  echo "Launching Lecture Tools CLI..."
  echo "Hint: pass commands such as 'overview' or 'ingest' after start.sh."
  echo "Example: ./start.sh overview --style modern"
  echo "Example: ./start.sh ingest --help"
  echo
fi

"$VENV_PY" "$SCRIPT_DIR/run.py" "$@"
