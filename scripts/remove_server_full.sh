#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "[lecture-tools] error: This script must be run as root (e.g. with sudo)." >&2
  exit 1
fi

CONFIG_FILE="/etc/lecture-tools.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR=""
SERVICE_USER=""
SERVICE_GROUP=""

if [[ -f $CONFIG_FILE ]]; then
  # shellcheck disable=SC1091
  source "$CONFIG_FILE"
  INSTALL_DIR="${INSTALL_DIR:-}"
  SERVICE_USER="${SERVICE_USER:-}"
  SERVICE_GROUP="${SERVICE_GROUP:-}"
else
  echo "[lecture-tools] warning: Configuration file $CONFIG_FILE not found. The removal helper will continue." >&2
fi

"$SCRIPT_DIR/remove_server.sh"

if [[ -n $INSTALL_DIR && -d $INSTALL_DIR ]]; then
  read -r -p "Permanently delete $INSTALL_DIR? [no]: " response || response="no"
  response=${response:-no}
  case ${response,,} in
    y|yes)
      echo "[lecture-tools] Removing $INSTALL_DIR..."
      rm -rf "$INSTALL_DIR"
      ;;
    *)
      echo "[lecture-tools] Skipping deletion of $INSTALL_DIR."
      ;;
  esac
fi

if [[ -n $SERVICE_USER ]]; then
  read -r -p "Delete system user $SERVICE_USER? [no]: " response || response="no"
  response=${response:-no}
  case ${response,,} in
    y|yes)
      echo "[lecture-tools] Removing user $SERVICE_USER..."
      userdel "$SERVICE_USER" || true
      if [[ -n $SERVICE_GROUP ]]; then
        if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
          groupdel "$SERVICE_GROUP" || true
        fi
      fi
      ;;
    *)
      echo "[lecture-tools] Skipping removal of user $SERVICE_USER."
      ;;
  esac
fi

if [[ -n $INSTALL_DIR ]]; then
  echo "[lecture-tools] Any media assets stored outside $INSTALL_DIR must be cleaned up manually."
fi

