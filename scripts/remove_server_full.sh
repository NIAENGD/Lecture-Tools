#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This removal script must be run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/remove_server.sh"

INSTALL_ROOT="/opt/lecture-tools"
SERVICE_USER="lecturetools"

if [[ -d "${INSTALL_ROOT}" ]]; then
  read -rp "Delete all Lecture Tools files under ${INSTALL_ROOT}? [y/N]: " DELETE_FILES
  DELETE_FILES=${DELETE_FILES,,}
  if [[ "${DELETE_FILES}" == "y" || "${DELETE_FILES}" == "yes" ]]; then
    rm -rf "${INSTALL_ROOT}"
    echo "Removed ${INSTALL_ROOT}."
  else
    echo "Preserved application files in ${INSTALL_ROOT}."
  fi
fi

if id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  read -rp "Remove the dedicated service account '${SERVICE_USER}'? [y/N]: " DELETE_USER
  DELETE_USER=${DELETE_USER,,}
  if [[ "${DELETE_USER}" == "y" || "${DELETE_USER}" == "yes" ]]; then
    deluser --remove-home "${SERVICE_USER}" >/dev/null 2>&1 || deluser "${SERVICE_USER}" >/dev/null 2>&1 || true
    echo "Removed user ${SERVICE_USER}."
  else
    echo "Preserved user ${SERVICE_USER}."
  fi
fi

if command -v certbot >/dev/null 2>&1; then
  read -rp "Enter the primary domain of the certificate to delete (leave blank to skip): " CERT_NAME
  if [[ -n "${CERT_NAME}" ]]; then
    certbot delete --cert-name "${CERT_NAME}" || true
  fi
fi

echo "Full removal procedure completed."
