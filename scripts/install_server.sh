#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "[lecture-tools] error: This installer must be run as root (e.g. with sudo)." >&2
  exit 1
fi

log() {
  printf '[lecture-tools] %s\n' "$*"
}

warn() {
  printf '[lecture-tools] warning: %s\n' "$*" >&2
}

fatal() {
  printf '[lecture-tools] error: %s\n' "$*" >&2
  exit 1
}

trim() {
  local value="$1"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  printf '%s' "$value"
}

prompt_default() {
  local prompt="$1" default="$2" reply trimmed
  read -r -p "$prompt [$default]: " reply || true
  trimmed=$(trim "${reply:-}")
  if [[ -z $trimmed ]]; then
    printf '%s' "$default"
  else
    printf '%s' "$trimmed"
  fi
}

prompt_yes_no() {
  local prompt="$1" default="$2" reply
  while true; do
    read -r -p "$prompt [$default]: " reply || true
    reply=${reply:-$default}
    case ${reply,,} in
      y|yes) return 0 ;;
      n|no) return 1 ;;
   esac
    echo "Please answer yes or no (y/n)."
  done
}

ensure_debian() {
  if [[ ! -r /etc/os-release ]]; then
    fatal "Unable to determine operating system (missing /etc/os-release)."
  fi
  source /etc/os-release
  case ${ID,,} in
    debian|ubuntu|linuxmint|pop|elementary)
      return 0
      ;;
    *)
      fatal "This installer only supports Debian-based distributions."
      ;;
 esac
}

ensure_packages() {
  local packages=(python3.11 python3.11-venv python3-pip git ffmpeg libportaudio2 build-essential)
  local missing_packages=()

  for pkg in "${packages[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
      missing_packages+=("$pkg")
    fi
  done

  if [[ ${#missing_packages[@]} -eq 0 ]]; then
    log "All required system packages already present."
    return
  fi

  log "Installing system dependencies (${missing_packages[*]})..."
  apt-get update >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing_packages[@]}" >/dev/null
}

select_python() {
  if command -v python3.11 >/dev/null 2>&1; then
    command -v python3.11
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  else
    fatal "Python 3 is not available on this system."
  fi
}

create_service_user() {
  local user="$1" home_dir="$2"
  if id "$user" >/dev/null 2>&1; then
    log "System user '$user' already exists."
  else
    log "Creating system user '$user'..."
    adduser --system --group --home "$home_dir" --shell /bin/bash "$user" >/dev/null
  fi
}

systemd_unit_exists() {
  local unit="$1"
  if systemctl list-unit-files "$unit" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

CONFIG_FILE="/etc/lecture-tools.conf"
LEGACY_CONFIG_FILE="/etc/lecturetool.conf"
LEGACY_UNIT_PATH="/etc/systemd/system/lecturetools.service"
LEGACY_HELPER="/usr/local/bin/lecturetool"

declare INSTALL_DEFAULT="" REPO_DEFAULT="" BRANCH_DEFAULT="" USER_DEFAULT="" PORT_DEFAULT="" ROOT_PATH_DEFAULT=""
declare DOMAIN_DEFAULT="" TLS_CERT_DEFAULT="" TLS_KEY_DEFAULT="" SERVICE_NAME_DEFAULT="lecture-tools.service" UNIT_PATH_DEFAULT="/etc/systemd/system/lecture-tools.service"

load_existing_configuration() {
  if [[ -f $CONFIG_FILE ]]; then
    # shellcheck disable=SC1091
    source "$CONFIG_FILE"
    INSTALL_DEFAULT="${INSTALL_DIR:-$INSTALL_DEFAULT}"
    REPO_DEFAULT="${GIT_REMOTE_URL:-$REPO_DEFAULT}"
    BRANCH_DEFAULT="${GIT_BRANCH:-$BRANCH_DEFAULT}"
    USER_DEFAULT="${SERVICE_USER:-$USER_DEFAULT}"
    PORT_DEFAULT="${HTTP_PORT:-$PORT_DEFAULT}"
    ROOT_PATH_DEFAULT="${ROOT_PATH:-$ROOT_PATH_DEFAULT}"
    DOMAIN_DEFAULT="${PUBLIC_HOSTNAME:-$DOMAIN_DEFAULT}"
    TLS_CERT_DEFAULT="${TLS_CERTIFICATE_PATH:-$TLS_CERT_DEFAULT}"
    SERVICE_NAME_DEFAULT="${SERVICE_NAME:-$SERVICE_NAME_DEFAULT}"
    UNIT_PATH_DEFAULT="${UNIT_PATH:-$UNIT_PATH_DEFAULT}"
    TLS_KEY_DEFAULT="${TLS_PRIVATE_KEY_PATH:-$TLS_KEY_DEFAULT}"
  fi
}

legacy_install_dir=""
legacy_service_user=""
legacy_compose_cmd=""
legacy_project_name=""
legacy_docker_flag=""

load_legacy_configuration() {
  if [[ -f $LEGACY_CONFIG_FILE ]]; then
    # shellcheck disable=SC1091
    source "$LEGACY_CONFIG_FILE"
    legacy_install_dir="${INSTALL_DIR:-}"
    legacy_service_user="${SERVICE_USER:-}"
    legacy_compose_cmd="${COMPOSE_CMD:-}"
    legacy_project_name="${PROJECT_NAME:-lecturetools}"
    legacy_docker_flag="${DOCKER_INSTALLED:-}"
  fi
}

cleanup_legacy_docker() {
  log "Cleaning up legacy Docker-based deployment..."

  if systemd_unit_exists "lecturetools.service"; then
    systemctl stop lecturetools.service || true
    systemctl disable lecturetools.service || true
    rm -f "$LEGACY_UNIT_PATH"
  fi

  if [[ -n $legacy_compose_cmd && -n $legacy_install_dir ]]; then
    if command -v docker >/dev/null 2>&1; then
      pushd "$legacy_install_dir" >/dev/null 2>&1 || true
      $legacy_compose_cmd down >/dev/null 2>&1 || true
      popd >/dev/null 2>&1 || true
    fi
  fi

  if [[ -f $LEGACY_CONFIG_FILE ]]; then
    rm -f "$LEGACY_CONFIG_FILE"
  fi

  if [[ -f $LEGACY_HELPER ]]; then
    rm -f "$LEGACY_HELPER"
  fi

  systemctl daemon-reload
  if [[ -n $legacy_install_dir ]]; then
    log "Legacy Docker application files remain in $legacy_install_dir"
  fi
  if [[ -n $legacy_service_user ]]; then
    log "Legacy service user $legacy_service_user was preserved. Remove manually if no longer needed."
  fi
  log "Legacy Docker deployment cleanup complete."
}

detect_legacy_docker() {
  load_legacy_configuration

  local legacy_detected=0
  if [[ -n $legacy_install_dir ]]; then
    legacy_detected=1
  fi
  if systemd_unit_exists "lecturetools.service"; then
    legacy_detected=1
  fi
  if [[ -f $LEGACY_HELPER && ! -f $CONFIG_FILE ]]; then
    legacy_detected=1
  fi

  if [[ $legacy_detected -eq 0 ]]; then
    return
  fi

  log "Detected remnants of the previous Docker-based deployment."
  if prompt_yes_no "Remove the legacy Docker setup before continuing?" "yes"; then
    cleanup_legacy_docker
  else
    warn "Continuing without removing Docker components may result in port conflicts or duplicated services."
  fi
}

detected_cert_path=""
detected_key_path=""

detect_existing_certificate() {
  local domain="$1"
  detected_cert_path=""
  detected_key_path=""
  if [[ -z $domain ]]; then
    return
  fi
  local letsencrypt_dir="/etc/letsencrypt/live/$domain"
  if [[ -d $letsencrypt_dir ]]; then
    if [[ -f "$letsencrypt_dir/fullchain.pem" ]]; then
      detected_cert_path="$letsencrypt_dir/fullchain.pem"
    fi
    if [[ -f "$letsencrypt_dir/privkey.pem" ]]; then
      detected_key_path="$letsencrypt_dir/privkey.pem"
    fi
    return
  fi
  local cert_path="/etc/ssl/certs/${domain}.crt"
  local key_path="/etc/ssl/private/${domain}.key"
  if [[ -f $cert_path ]]; then
    detected_cert_path="$cert_path"
    if [[ -f $key_path ]]; then
      detected_key_path="$key_path"
    fi
  fi
}

configure_firewall() {
  local port="$1"
  if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -q "Status: active"; then
      if prompt_yes_no "UFW is active. Allow TCP port $port through the firewall?" "yes"; then
        ufw allow "$port"/tcp
      fi
    fi
  fi
}

write_systemd_unit() {
  local unit_path="$1" working_dir="$2" service_user="$3" service_group="$4" port="$5" root_path="$6"
  cat >"$unit_path" <<EOFUNIT
[Unit]
Description=Lecture Tools FastAPI server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$working_dir
ExecStart=$working_dir/.venv/bin/python run.py serve --host 0.0.0.0 --port $port
Restart=on-failure
RestartSec=5
User=$service_user
Group=$service_group
EOFUNIT
  if [[ -n $root_path ]]; then
    printf 'Environment=LECTURE_TOOLS_ROOT_PATH=%s\n' "$root_path" >>"$unit_path"
  fi
  cat >>"$unit_path" <<'EOFUNIT'
[Install]
WantedBy=multi-user.target
EOFUNIT
}

write_helper_script() {
  local helper_path="$1"
  cat >"$helper_path" <<'EOFHELP'
#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="/etc/lecture-tools.conf"
if [[ ! -f $CONFIG_FILE ]]; then
  echo "[lecture-tools] error: Missing $CONFIG_FILE." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG_FILE"

usage() {
  cat <<'EOU'
Usage: lecturetool <command>
Commands:
  start        Start the Lecture Tools service
  stop         Stop the service
  restart      Restart the service
  reload       Reload the service unit and restart the app
  status       Show service status
  enable       Enable the service at boot
  disable      Disable automatic startup
  logs         Follow systemd logs
  tail         Alias for logs
  update       Pull latest code and reinstall dependencies
  upgrade      Alias for update
  info         Show installation summary
  config       Output the persisted configuration file
  doctor       Run basic health checks
  shell        Open an interactive shell as the service user
EOU
}

require_root() {
  if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "[lecture-tools] error: Please run this command with sudo or as root." >&2
    exit 1
  fi
}

run_as_service_user() {
  local command="$1"
  shift
  runuser -u "$SERVICE_USER" -- "$command" "$@"
}

print_info() {
  cat <<EOFINFO
Service name : ${SERVICE_NAME}
Unit file    : ${UNIT_PATH}
User / group : ${SERVICE_USER}:${SERVICE_GROUP}
Install dir  : ${INSTALL_DIR}
Virtualenv   : ${VENV_PY}
Git branch   : ${GIT_BRANCH} (remote ${GIT_REMOTE:-origin})
HTTP port    : ${HTTP_PORT:-8000}
Root path    : ${ROOT_PATH:-/}
Public host  : ${PUBLIC_HOSTNAME:-<not set>}
TLS cert     : ${TLS_CERTIFICATE_PATH:-<not set>}
TLS key      : ${TLS_PRIVATE_KEY_PATH:-<not set>}
EOFINFO
}

run_doctor() {
  print_info
  echo ""
  echo "[lecture-tools] Checking service status..."
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "[lecture-tools] Service is active."
  else
    systemctl status --no-pager "$SERVICE_NAME" || true
  fi

  if command -v ss >/dev/null 2>&1; then
    echo "[lecture-tools] Listening sockets for port ${HTTP_PORT:-8000}:"
    ss -tulpn | grep -E ":${HTTP_PORT:-8000}\b" || echo "[lecture-tools] warning: No listener detected on port ${HTTP_PORT:-8000}."
  fi

  if [[ -n ${TLS_CERTIFICATE_PATH:-} ]]; then
    if [[ -f $TLS_CERTIFICATE_PATH ]]; then
      echo "[lecture-tools] TLS certificate present at $TLS_CERTIFICATE_PATH"
    else
      echo "[lecture-tools] warning: TLS certificate $TLS_CERTIFICATE_PATH is missing." >&2
    fi
  fi
  if [[ -n ${TLS_PRIVATE_KEY_PATH:-} ]]; then
    if [[ -f $TLS_PRIVATE_KEY_PATH ]]; then
      echo "[lecture-tools] TLS private key present at $TLS_PRIVATE_KEY_PATH"
    else
      echo "[lecture-tools] warning: TLS private key $TLS_PRIVATE_KEY_PATH is missing." >&2
    fi
  fi
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

case $1 in
  start)
    require_root
    systemctl start "$SERVICE_NAME"
    ;;
  stop)
    require_root
    systemctl stop "$SERVICE_NAME"
    ;;
  restart)
    require_root
    systemctl restart "$SERVICE_NAME"
    ;;
  reload)
    require_root
    systemctl daemon-reload
    systemctl restart "$SERVICE_NAME"
    ;;
  status)
    systemctl status --no-pager "$SERVICE_NAME"
    ;;
  enable)
    require_root
    systemctl enable "$SERVICE_NAME"
    ;;
  disable)
    require_root
    systemctl disable "$SERVICE_NAME"
    ;;
  logs|tail)
    require_root
    journalctl -u "$SERVICE_NAME" -f
    ;;
  update)
    require_root
    systemctl stop "$SERVICE_NAME" || true
    if [[ -n ${GIT_REMOTE_URL:-} ]]; then
      run_as_service_user git -C "$INSTALL_DIR" remote set-url "$GIT_REMOTE" "$GIT_REMOTE_URL"
    fi
    run_as_service_user git -C "$INSTALL_DIR" fetch --all --prune
    run_as_service_user git -C "$INSTALL_DIR" reset --hard "$GIT_REFERENCE"
    run_as_service_user git -C "$INSTALL_DIR" pull --ff-only "$GIT_REMOTE" "$GIT_BRANCH"
    run_as_service_user "$VENV_PY" -m pip install --upgrade pip
    if [[ -f "$INSTALL_DIR/requirements-dev.txt" ]]; then
      run_as_service_user "$VENV_PY" -m pip install -r "$INSTALL_DIR/requirements-dev.txt"
    elif [[ -f "$INSTALL_DIR/requirements.txt" ]]; then
      run_as_service_user "$VENV_PY" -m pip install -r "$INSTALL_DIR/requirements.txt"
    fi
    systemctl start "$SERVICE_NAME"
    ;;
  upgrade)
    shift
    set -- update "$@"
    "$0" "$@"
    exit 0
    ;;
  info)
    print_info
    ;;
  config)
    cat "$CONFIG_FILE"
    ;;
  doctor)
    run_doctor
    ;;
  shell)
    require_root
    shell_bin="${SHELL:-/bin/bash}"
    runuser -u "$SERVICE_USER" -- "$shell_bin"
    ;;
  *)
    usage
    exit 1
    ;;
esac
EOFHELP
}

ensure_debian
load_existing_configuration
detect_legacy_docker
ensure_packages

DEFAULT_INSTALL_DIR="${INSTALL_DEFAULT:-/opt/lecture-tools}"
DEFAULT_REPO="${REPO_DEFAULT:-https://github.com/NIAENGD/Lecture-Tools.git}"
DEFAULT_BRANCH="${BRANCH_DEFAULT:-main}"
DEFAULT_USER="${USER_DEFAULT:-lecturetools}"
DEFAULT_PORT="${PORT_DEFAULT:-8000}"
DEFAULT_ROOT_PATH="${ROOT_PATH_DEFAULT:-}"
DEFAULT_DOMAIN="${DOMAIN_DEFAULT:-}"
DEFAULT_TLS_CERT="${TLS_CERT_DEFAULT:-}"
DEFAULT_TLS_KEY="${TLS_KEY_DEFAULT:-}"

install_dir=$(prompt_default "Application directory (git clone target)" "$DEFAULT_INSTALL_DIR")
install_dir=$(trim "$install_dir")
repo_url=$(prompt_default "Git repository" "$DEFAULT_REPO")
repo_url=$(trim "$repo_url")
branch=$(prompt_default "Branch or tag" "$DEFAULT_BRANCH")
branch=$(trim "$branch")
service_user=$(prompt_default "System user" "$DEFAULT_USER")
service_user=$(trim "$service_user")
port=$(prompt_default "HTTP port" "$DEFAULT_PORT")
port=$(trim "$port")
root_path=$(prompt_default "Root path (leave blank for /)" "$DEFAULT_ROOT_PATH")
root_path=$(trim "$root_path")
domain=$(prompt_default "Public domain (leave blank if behind a load balancer or IP only)" "$DEFAULT_DOMAIN")
domain=$(trim "$domain")

detect_existing_certificate "$domain"

tls_cert_path="$DEFAULT_TLS_CERT"
tls_key_path="$DEFAULT_TLS_KEY"
if [[ -n $detected_cert_path ]]; then
  log "Detected existing TLS certificate for $domain at $detected_cert_path"
  tls_cert_path="$detected_cert_path"
fi
if [[ -n $detected_key_path ]]; then
  log "Detected existing TLS private key for $domain at $detected_key_path"
  tls_key_path="$detected_key_path"
fi

if [[ -n $domain && -z $tls_cert_path ]]; then
  tls_cert_path=$(prompt_default "TLS certificate path for $domain (leave blank to skip)" "")
  tls_cert_path=$(trim "$tls_cert_path")
fi

if [[ -n $domain && -z $tls_key_path ]]; then
  tls_key_path=$(prompt_default "TLS private key path for $domain (leave blank to skip)" "")
  tls_key_path=$(trim "$tls_key_path")
fi

if [[ -z $install_dir ]]; then
  fatal "Installation directory cannot be empty."
fi
if [[ $install_dir == "/" ]]; then
  fatal "Installation directory cannot be the filesystem root."
fi
if [[ $install_dir == *" "* ]]; then
  fatal "Installation directory must not include spaces."
fi
if [[ -z $service_user ]]; then
  fatal "System user cannot be empty."
fi
if [[ ! $service_user =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  fatal "System user must start with a letter or underscore and contain only lowercase letters, numbers, underscores or hyphens."
fi
if [[ -z $repo_url ]]; then
  fatal "Repository URL cannot be empty."
fi
if [[ -z $branch ]]; then
  fatal "Branch cannot be empty."
fi

install_parent=$(dirname "$install_dir")
mkdir -p "$install_parent"

create_service_user "$service_user" "$install_parent"
service_group=$(id -gn "$service_user")

mkdir -p "$install_dir"
chown -R "$service_user:$service_group" "$install_dir"

if [[ -d "$install_dir/.git" ]]; then
  log "Existing repository detected in $install_dir – updating..."
  runuser -u "$service_user" -- git -C "$install_dir" remote set-url origin "$repo_url"
  runuser -u "$service_user" -- git -C "$install_dir" fetch --all --prune
  runuser -u "$service_user" -- git -C "$install_dir" checkout "$branch"
  runuser -u "$service_user" -- git -C "$install_dir" reset --hard "origin/$branch"
else
  if [[ -n $(ls -A "$install_dir" 2>/dev/null) ]]; then
    if prompt_yes_no "Directory $install_dir is not empty. Replace its contents?" "no"; then
      rm -rf "$install_dir"
      mkdir -p "$install_dir"
      chown -R "$service_user:$service_group" "$install_dir"
    else
      fatal "Installation aborted due to non-empty directory."
    fi
  fi
  log "Cloning repository into $install_dir..."
  runuser -u "$service_user" -- git clone "$repo_url" "$install_dir"
  runuser -u "$service_user" -- git -C "$install_dir" checkout "$branch"
fi

python_bin=$(select_python)
log "Creating virtual environment with $python_bin..."
runuser -u "$service_user" -- "$python_bin" -m venv "$install_dir/.venv"
venv_py="$install_dir/.venv/bin/python"

log "Installing Python dependencies..."
runuser -u "$service_user" -- "$venv_py" -m pip install --upgrade pip
if [[ -f "$install_dir/requirements-dev.txt" ]]; then
  runuser -u "$service_user" -- "$venv_py" -m pip install -r "$install_dir/requirements-dev.txt"
elif [[ -f "$install_dir/requirements.txt" ]]; then
  runuser -u "$service_user" -- "$venv_py" -m pip install -r "$install_dir/requirements.txt"
else
  log "No requirements file found – skipping dependency installation."
fi

unit_path="$UNIT_PATH_DEFAULT"
if [[ -z $unit_path ]]; then
  unit_path="/etc/systemd/system/${SERVICE_NAME_DEFAULT}"
fi
service_name="$SERVICE_NAME_DEFAULT"
if [[ -z $service_name ]]; then
  service_name="lecture-tools.service"
fi

log "Writing systemd unit to $unit_path..."
if systemd_unit_exists "$service_name"; then
  log "Stopping existing $service_name service prior to updating the unit..."
  systemctl stop "$service_name" || true
fi
write_systemd_unit "$unit_path" "$install_dir" "$service_user" "$service_group" "$port" "$root_path"

log "Persisting deployment metadata to $CONFIG_FILE..."
cat >"$CONFIG_FILE" <<EOFCONF
CONFIG_VERSION="2"
INSTALL_DIR="$install_dir"
SERVICE_USER="$service_user"
SERVICE_GROUP="$service_group"
UNIT_PATH="$unit_path"
SERVICE_NAME="$service_name"
VENV_PY="$venv_py"
GIT_REMOTE="origin"
GIT_REMOTE_URL="$repo_url"
GIT_BRANCH="$branch"
GIT_REFERENCE="origin/$branch"
HTTP_PORT="$port"
ROOT_PATH="$root_path"
PUBLIC_HOSTNAME="$domain"
TLS_CERTIFICATE_PATH="$tls_cert_path"
TLS_PRIVATE_KEY_PATH="$tls_key_path"
EOFCONF
chmod 0600 "$CONFIG_FILE"

helper_path="/usr/local/bin/lecturetool"
log "Installing helper CLI at $helper_path..."
write_helper_script "$helper_path"
chmod 0755 "$helper_path"

systemctl daemon-reload
if prompt_yes_no "Enable and start the Lecture Tools service now?" "yes"; then
  systemctl enable --now "$service_name"
else
  log "Service installed but not started. Enable later with: sudo systemctl enable --now $service_name"
fi

configure_firewall "$port"

if [[ -n $domain ]]; then
  if [[ -n $tls_cert_path ]]; then
    log "HTTPS support recorded using certificate $tls_cert_path"
  else
    warn "Domain provided without certificate. Configure HTTPS termination manually and update $CONFIG_FILE when ready."
  fi
fi

log "Installation complete. Use 'sudo lecturetool status' to inspect the service."
