#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "[lecture-tools] error: This script must be run as root (e.g. with sudo)." >&2
  exit 1
fi

log() {
  printf '[lecture-tools] %s\n' "$*"
}

warn() {
  printf '[lecture-tools] warning: %s\n' "$*" >&2
}

CONFIG_FILE="/etc/lecture-tools.conf"
HELPER_PATH="/usr/local/bin/lecturetools"
LEGACY_HELPER="/usr/local/bin/lecturetool"
DEFAULT_UNIT="/etc/systemd/system/lecture-tools.service"
DEFAULT_SERVICE="lecture-tools.service"

INSTALL_DIR=""
SERVICE_USER=""
UNIT_PATH="$DEFAULT_UNIT"
SERVICE_NAME="$DEFAULT_SERVICE"

if [[ -f $CONFIG_FILE ]]; then
  # shellcheck disable=SC1091
  source "$CONFIG_FILE"
  INSTALL_DIR="${INSTALL_DIR:-}"
  SERVICE_USER="${SERVICE_USER:-}"
  UNIT_PATH="${UNIT_PATH:-$DEFAULT_UNIT}"
  SERVICE_NAME="${SERVICE_NAME:-$DEFAULT_SERVICE}"
else
  warn "Configuration file $CONFIG_FILE not found. Using defaults where possible."
fi

if systemctl list-unit-files | grep -q "^$SERVICE_NAME"; then
  log "Stopping $SERVICE_NAME..."
  systemctl stop "$SERVICE_NAME" || true
  log "Disabling $SERVICE_NAME..."
  systemctl disable "$SERVICE_NAME" || true
else
  warn "Systemd unit $SERVICE_NAME not registered."
fi

if [[ -f $UNIT_PATH ]]; then
  log "Removing unit file $UNIT_PATH..."
  rm -f "$UNIT_PATH"
else
  warn "Unit file $UNIT_PATH not found."
fi

if [[ -f $HELPER_PATH ]]; then
  log "Removing helper CLI $HELPER_PATH..."
  rm -f "$HELPER_PATH"
fi
if [[ -f $LEGACY_HELPER ]]; then
  log "Removing helper CLI $LEGACY_HELPER..."
  rm -f "$LEGACY_HELPER"
fi

if [[ -f $CONFIG_FILE ]]; then
  log "Deleting configuration file $CONFIG_FILE..."
  rm -f "$CONFIG_FILE"
fi

systemctl daemon-reload

if [[ -n $INSTALL_DIR ]]; then
  log "Lecture Tools application files remain in $INSTALL_DIR"
fi

if [[ -n $SERVICE_USER ]]; then
  log "System user $SERVICE_USER was not removed."
fi

log "Service removal complete."
