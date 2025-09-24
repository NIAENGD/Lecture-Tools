#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This removal script must be run as root." >&2
  exit 1
fi

SERVICE_FILE="/etc/systemd/system/lecture-tools.service"
NGINX_SITE="/etc/nginx/sites-available/lecture-tools"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/lecture-tools"
SERVICE_NAME="lecture-tools"
INSTALL_ROOT="/opt/lecture-tools"

if systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
  systemctl disable --now "${SERVICE_NAME}" || true
else
  systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
fi

rm -f "${SERVICE_FILE}"
systemctl daemon-reload

rm -f "${NGINX_SITE_LINK}"
rm -f "${NGINX_SITE}"
if command -v nginx >/dev/null 2>&1; then
  nginx -t && systemctl reload nginx || true
fi

echo "Lecture Tools service has been removed."
echo "Application files remain in ${INSTALL_ROOT}."
