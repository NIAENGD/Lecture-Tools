#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must be run as root." >&2
  exit 1
fi

INSTALL_ROOT="/opt/lecture-tools"
APP_DIR="${INSTALL_ROOT}/app"
VENV_DIR="${INSTALL_ROOT}/.venv"
SERVICE_FILE="/etc/systemd/system/lecture-tools.service"
NGINX_SITE="/etc/nginx/sites-available/lecture-tools"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/lecture-tools"
SERVICE_USER="lecturetools"

read -rp "Enter the primary domain name (e.g. example.com): " PRIMARY_DOMAIN
if [[ -z "${PRIMARY_DOMAIN}" ]]; then
  echo "A domain name is required to configure the reverse proxy." >&2
  exit 1
fi

read -rp "Enter any additional domain names (space separated, optional): " -a EXTRA_DOMAINS_ARRAY

read -rp "Enter the URL path prefix (default /): " ROOT_PATH_INPUT
ROOT_PATH_INPUT=${ROOT_PATH_INPUT:-/}

normalize_root_path() {
  local path="$1"
  # Trim leading whitespace
  path="${path#${path%%[![:space:]]*}}"
  # Trim trailing whitespace
  path="${path%${path##*[![:space:]]}}"
  if [[ -z "${path}" || "${path}" == "/" ]]; then
    echo ""
    return
  fi
  path="/${path#/}"
  path="${path%/}"
  echo "${path}"
}

ROOT_PATH="$(normalize_root_path "${ROOT_PATH_INPUT}")"

read -rp "Email address for Let's Encrypt notifications (leave blank to skip certificate request): " LETSENCRYPT_EMAIL

REQUEST_CERT="n"
if [[ -n "${LETSENCRYPT_EMAIL}" ]]; then
  read -rp "Attempt to obtain a Let's Encrypt certificate now? [y/N]: " REQUEST_CERT
  REQUEST_CERT=${REQUEST_CERT,,}
else
  echo "Skipping certificate request because no email was provided."
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 python3-venv python3-pip git nginx certbot python3-certbot-nginx rsync

if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  adduser --system --group --home "${INSTALL_ROOT}" "${SERVICE_USER}"
fi
mkdir -p "${INSTALL_ROOT}"
chown "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_ROOT}"

if [[ -d "${APP_DIR}/.git" ]]; then
  echo "Updating existing application checkout at ${APP_DIR}"
  sudo -u "${SERVICE_USER}" git -C "${APP_DIR}" fetch --prune
  sudo -u "${SERVICE_USER}" git -C "${APP_DIR}" reset --hard @{u} || sudo -u "${SERVICE_USER}" git -C "${APP_DIR}" reset --hard HEAD
else
  echo "Creating application checkout at ${APP_DIR}"
  REMOTE_URL=""
  if git -C "${REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    REMOTE_URL="$(git -C "${REPO_DIR}" config --get remote.origin.url || true)"
  fi
  if [[ -n "${REMOTE_URL}" ]]; then
    rm -rf "${APP_DIR}"
    sudo -u "${SERVICE_USER}" git clone "${REMOTE_URL}" "${APP_DIR}"
  elif git -C "${REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    rm -rf "${APP_DIR}"
    sudo -u "${SERVICE_USER}" git clone "${REPO_DIR}" "${APP_DIR}"
  else
    mkdir -p "${APP_DIR}"
    rsync -a --delete --exclude 'storage/' --exclude 'storage' --exclude 'assets/' --exclude 'assets' "${REPO_DIR}/" "${APP_DIR}/"
    mkdir -p "${APP_DIR}/storage" "${APP_DIR}/assets"
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
  fi
fi

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_ROOT}"

sudo -u "${SERVICE_USER}" python3 -m venv "${VENV_DIR}"
sudo -u "${SERVICE_USER}" "${VENV_DIR}/bin/pip" install --upgrade pip
if [[ -f "${APP_DIR}/requirements-dev.txt" ]]; then
  sudo -u "${SERVICE_USER}" "${VENV_DIR}/bin/pip" install -r "${APP_DIR}/requirements-dev.txt"
fi

ENVIRONMENT_LINES=("Environment=PYTHONUNBUFFERED=1")
if [[ -n "${ROOT_PATH}" ]]; then
  ENVIRONMENT_LINES+=("Environment=LECTURE_TOOLS_ROOT_PATH=${ROOT_PATH}")
fi

{
  echo "[Unit]"
  echo "Description=Lecture Tools FastAPI server"
  echo "After=network.target"
  echo
  echo "[Service]"
  echo "Type=simple"
  echo "WorkingDirectory=${APP_DIR}"
  for line in "${ENVIRONMENT_LINES[@]}"; do
    echo "${line}"
  done
  echo "ExecStart=${VENV_DIR}/bin/python run.py serve --host 127.0.0.1 --port 8000"
  echo "Restart=on-failure"
  echo "RestartSec=5"
  echo "User=${SERVICE_USER}"
  echo "Group=${SERVICE_USER}"
  echo
  echo "[Install]"
  echo "WantedBy=multi-user.target"
} > "${SERVICE_FILE}"
chmod 644 "${SERVICE_FILE}"

systemctl daemon-reload
systemctl enable --now lecture-tools

SERVER_NAMES=("${PRIMARY_DOMAIN}")
for domain in "${EXTRA_DOMAINS_ARRAY[@]}"; do
  [[ -n "${domain}" ]] || continue
  SERVER_NAMES+=("${domain}")
done
SERVER_NAME_LINE="    server_name ${SERVER_NAMES[*]};"

{
  echo "server {"
  echo "    listen 80;"
  echo "${SERVER_NAME_LINE}"
  echo "    client_max_body_size 200M;"
  echo
  if [[ -n "${ROOT_PATH}" ]]; then
    echo "    location = ${ROOT_PATH} {"
    echo "        return 301 ${ROOT_PATH}/;"
    echo "    }"
    echo
    echo "    location ${ROOT_PATH}/ {"
  else
    echo "    location / {"
  fi
  echo "        proxy_pass http://127.0.0.1:8000;"
  echo "        proxy_http_version 1.1;"
  echo "        proxy_set_header Host \$host;"
  echo "        proxy_set_header X-Real-IP \$remote_addr;"
  echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
  echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
  echo "        proxy_set_header X-Forwarded-Host \$host;"
  if [[ -n "${ROOT_PATH}" ]]; then
    echo "        proxy_set_header X-Forwarded-Prefix ${ROOT_PATH};"
  fi
  echo "        proxy_set_header Upgrade \$http_upgrade;"
  echo "        proxy_set_header Connection \"upgrade\";"
  echo "        proxy_redirect off;"
  echo "    }"
  echo "}"
} > "${NGINX_SITE}"

ln -sf "${NGINX_SITE}" "${NGINX_SITE_LINK}"
if [[ -e /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl reload nginx

if [[ "${REQUEST_CERT}" == "y" || "${REQUEST_CERT}" == "yes" ]]; then
  DOMAIN_ARGS=("-d" "${PRIMARY_DOMAIN}")
  for domain in "${EXTRA_DOMAINS_ARRAY[@]}"; do
    [[ -n "${domain}" ]] || continue
    DOMAIN_ARGS+=("-d" "${domain}")
  done
  certbot --nginx --non-interactive --agree-tos --redirect --email "${LETSENCRYPT_EMAIL}" "${DOMAIN_ARGS[@]}"
  echo "Certbot installed a systemd timer to renew certificates automatically."
else
  echo "You can request HTTPS certificates later with: certbot --nginx -d ${PRIMARY_DOMAIN}";
fi

echo
if [[ -n "${ROOT_PATH}" ]]; then
  echo "Lecture Tools is now available at https://${PRIMARY_DOMAIN}${ROOT_PATH}/"
else
  echo "Lecture Tools is now available at https://${PRIMARY_DOMAIN}/"
fi
