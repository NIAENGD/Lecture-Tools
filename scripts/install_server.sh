#!/usr/bin/env bash
set -euo pipefail

printf '[lecture-tools] The legacy web GUI has been removed while a new interface is developed.\n' >&2
printf '[lecture-tools] The automated installer is temporarily disabled.\n' >&2
exit 1

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

readonly FALLBACK_INSTALL_DIR="/opt/lecture-tools"
readonly FALLBACK_REPO="https://github.com/NIAENGD/Lecture-Tools.git"
readonly FALLBACK_BRANCH="main"
readonly FALLBACK_USER="lecturetools"
readonly FALLBACK_PORT="8000"
readonly FALLBACK_ROOT_PATH=""
readonly FALLBACK_DOMAIN=""
readonly FALLBACK_TLS_CERT=""
readonly FALLBACK_TLS_KEY=""
readonly FALLBACK_SERVICE_NAME="lecture-tools.service"
readonly FALLBACK_UNIT_PATH="/etc/systemd/system/lecture-tools.service"
readonly HELPER_PATH_DEFAULT="/usr/local/bin/lecturetool"

trim() {
  local value="$1"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  printf '%s' "$value"
}

normalize_root_path() {
  local value
  value="$(trim "${1:-}")"
  if [[ -z $value ]]; then
    printf ''
    return
  fi

  if [[ ${value:0:1} != '/' ]]; then
    value="/$value"
  fi

  # Strip trailing slashes while preserving the root-only case.
  while [[ ${#value} -gt 1 && ${value: -1} == '/' ]]; do
    value="${value%/}"
  done

  if [[ $value == '/' ]]; then
    printf ''
  else
    printf '%s' "$value"
  fi
}

prompt_default() {
  local prompt="$1" default="$2" reply trimmed
  if [[ -t 0 ]]; then
    read -r -p "$prompt [$default]: " reply || true
  elif [[ -e /dev/tty ]]; then
    printf '%s [%s]: ' "$prompt" "$default" > /dev/tty
    read -r reply < /dev/tty || true
  else
    reply=""
  fi
  trimmed=$(trim "${reply:-}")
  if [[ -z $trimmed ]]; then
    printf '%s' "$default"
  else
    printf '%s' "$trimmed"
  fi
}

prompt_yes_no() {
  local prompt="$1" default="$2" reply
  local have_tty=0
  if [[ -t 0 ]]; then
    have_tty=1
  elif [[ -e /dev/tty ]]; then
    have_tty=2
  fi

  while true; do
    if [[ $have_tty -eq 1 ]]; then
      read -r -p "$prompt [$default]: " reply || true
    elif [[ $have_tty -eq 2 ]]; then
      printf '%s [%s]: ' "$prompt" "$default" > /dev/tty
      read -r reply < /dev/tty || true
    else
      reply="$default"
    fi

    reply=${reply:-$default}
    case ${reply,,} in
      y|yes) return 0 ;;
      n|no) return 1 ;;
    esac

    if [[ $have_tty -eq 0 ]]; then
      case ${default,,} in
        y|yes) return 0 ;;
        *) return 1 ;;
      esac
    fi

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

purge_packages() {
  local packages=(python3.11 python3.11-venv python3-pip git ffmpeg libportaudio2 build-essential)
  local installed=()

  for pkg in "${packages[@]}"; do
    if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
      installed+=("$pkg")
    fi
  done

  if [[ ${#installed[@]} -eq 0 ]]; then
    log "No managed system packages are currently installed."
    return
  fi

  log "Purging managed system packages (${installed[*]})..."
  DEBIAN_FRONTEND=noninteractive apt-get purge -y "${installed[@]}" >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get autoremove -y >/dev/null
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
    local current_home
    current_home=$(getent passwd "$user" | cut -d: -f6)
    if [[ -n $current_home && $current_home != "$home_dir" ]]; then
      mkdir -p "$home_dir"
      warn "System user '$user' has home '$current_home'; updating to '$home_dir'."
      usermod -d "$home_dir" "$user"
    fi
  else
    log "Creating system user '$user' with home '$home_dir'..."
    adduser --system --group --home "$home_dir" --shell /bin/bash "$user" >/dev/null
  fi

  mkdir -p "$home_dir"
}

sanitize_service_user() {
  local candidate="$1" fallback="$2"
  local sanitized fallback_sanitized

  fallback_sanitized="${fallback,,}"
  fallback_sanitized="${fallback_sanitized//[^a-z0-9_-]/-}"
  while [[ -n $fallback_sanitized && $fallback_sanitized =~ ^[^a-z_] ]]; do
    fallback_sanitized="${fallback_sanitized#?}"
  done
  if [[ -z $fallback_sanitized || ! $fallback_sanitized =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    fallback_sanitized="lecturetools"
  fi

  sanitized="${candidate,,}"
  sanitized="${sanitized//[^a-z0-9_-]/-}"
  while [[ -n $sanitized && $sanitized =~ ^[^a-z_] ]]; do
    sanitized="${sanitized#?}"
  done
  while [[ $sanitized == *--* ]]; do
    sanitized="${sanitized//--/-}"
  done
  sanitized="${sanitized:-$fallback_sanitized}"

  if [[ ! $sanitized =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    sanitized="$fallback_sanitized"
  fi

  printf '%s' "$sanitized"
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
declare DOMAIN_DEFAULT="" TLS_CERT_DEFAULT="" TLS_KEY_DEFAULT="" SERVICE_NAME_DEFAULT="$FALLBACK_SERVICE_NAME" UNIT_PATH_DEFAULT="$FALLBACK_UNIT_PATH"
declare EXISTING_INSTALL_DIR="" EXISTING_SERVICE_USER="" EXISTING_SERVICE_GROUP=""
declare EXISTING_SERVICE_NAME="$FALLBACK_SERVICE_NAME" EXISTING_UNIT_PATH="$FALLBACK_UNIT_PATH"
declare -a EXISTING_TRACES=()
declare existing_installation_detected=0
PRIMARY_ACTION=""

load_existing_configuration() {
  if [[ -f $CONFIG_FILE ]]; then
    # shellcheck disable=SC1091
    source "$CONFIG_FILE"
    EXISTING_INSTALL_DIR="${INSTALL_DIR:-$EXISTING_INSTALL_DIR}"
    EXISTING_SERVICE_USER="${SERVICE_USER:-$EXISTING_SERVICE_USER}"
    EXISTING_SERVICE_GROUP="${SERVICE_GROUP:-$EXISTING_SERVICE_GROUP}"
    EXISTING_SERVICE_NAME="${SERVICE_NAME:-$EXISTING_SERVICE_NAME}"
    EXISTING_UNIT_PATH="${UNIT_PATH:-$EXISTING_UNIT_PATH}"
    INSTALL_DEFAULT="${INSTALL_DIR:-$INSTALL_DEFAULT}"
    REPO_DEFAULT="${GIT_REMOTE_URL:-$REPO_DEFAULT}"
    BRANCH_DEFAULT="${GIT_BRANCH:-$BRANCH_DEFAULT}"
    USER_DEFAULT="${SERVICE_USER:-$USER_DEFAULT}"
    PORT_DEFAULT="${HTTP_PORT:-$PORT_DEFAULT}"
    ROOT_PATH_DEFAULT="$(normalize_root_path "${ROOT_PATH:-$ROOT_PATH_DEFAULT}")"
    DOMAIN_DEFAULT="${PUBLIC_HOSTNAME:-$DOMAIN_DEFAULT}"
    TLS_CERT_DEFAULT="${TLS_CERTIFICATE_PATH:-$TLS_CERT_DEFAULT}"
    SERVICE_NAME_DEFAULT="${SERVICE_NAME:-$SERVICE_NAME_DEFAULT}"
    UNIT_PATH_DEFAULT="${UNIT_PATH:-$UNIT_PATH_DEFAULT}"
    TLS_KEY_DEFAULT="${TLS_PRIVATE_KEY_PATH:-$TLS_KEY_DEFAULT}"
  fi

  if [[ -z $EXISTING_SERVICE_NAME ]]; then
    EXISTING_SERVICE_NAME="$SERVICE_NAME_DEFAULT"
  fi
  if [[ -z $EXISTING_UNIT_PATH ]]; then
    EXISTING_UNIT_PATH="$UNIT_PATH_DEFAULT"
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
  if [[ $PRIMARY_ACTION == "clean-install" || $PRIMARY_ACTION == "purge" ]]; then
    log "Automatically removing legacy Docker deployment for the selected action."
    cleanup_legacy_docker
    return
  fi

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
  local python_exec="$working_dir/.venv/bin/python"
  local app_script="$working_dir/run.py"
  local exec_start working_dir_escaped

  printf -v exec_start '%q %q serve --host 0.0.0.0 --port %s' "$python_exec" "$app_script" "$port"
  printf -v working_dir_escaped '%q' "$working_dir"

  cat >"$unit_path" <<EOFUNIT
[Unit]
Description=Lecture Tools FastAPI server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$working_dir_escaped
ExecStart=$exec_start
Restart=on-failure
RestartSec=5
User=$service_user
Group=$service_group
EOFUNIT
  if [[ -n $root_path ]]; then
    printf 'Environment=%s=%q\n' "LECTURE_TOOLS_ROOT_PATH" "$root_path" >>"$unit_path"
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

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
if command -v readlink >/dev/null 2>&1; then
  HELPER_PATH="$(readlink -f "$SCRIPT_PATH" 2>/dev/null || true)"
fi
HELPER_PATH="${HELPER_PATH:-$SCRIPT_PATH}"

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
  nginx        Configure an Nginx reverse proxy (interactive wizard available)
  shell        Open an interactive shell as the service user
  purge        Completely remove the service, files, and user
  uninstall    Alias for purge
EOU
}

trim() {
  local value="$1"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  printf '%s' "$value"
}

prompt_default() {
  local prompt="$1" default="$2" reply trimmed
  if [[ -t 0 ]]; then
    read -r -p "$prompt [$default]: " reply || true
  elif [[ -e /dev/tty ]]; then
    printf '%s [%s]: ' "$prompt" "$default" > /dev/tty
    read -r reply < /dev/tty || true
  else
    reply=""
  fi
  trimmed=$(trim "${reply:-}")
  if [[ -z $trimmed ]]; then
    printf '%s' "$default"
  else
    printf '%s' "$trimmed"
  fi
}

prompt_yes_no() {
  local prompt="$1" default="$2" reply
  local have_tty=0
  if [[ -t 0 ]]; then
    have_tty=1
  elif [[ -e /dev/tty ]]; then
    have_tty=2
  fi

  while true; do
    if [[ $have_tty -eq 1 ]]; then
      read -r -p "$prompt [$default]: " reply || true
    elif [[ $have_tty -eq 2 ]]; then
      printf '%s [%s]: ' "$prompt" "$default" > /dev/tty
      read -r reply < /dev/tty || true
    else
      reply="$default"
    fi

    reply=${reply:-$default}
    case ${reply,,} in
      y|yes) return 0 ;;
      n|no) return 1 ;;
    esac

    if [[ $have_tty -eq 0 ]]; then
      case ${default,,} in
        y|yes) return 0 ;;
        *) return 1 ;;
      esac
    fi

    echo "Please answer yes or no (y/n)."
  done
}

prompt_menu() {
  local prompt="$1" default_choice="$2"
  shift 2
  local options=("$@")
  local choice
  local have_tty=0
  local prompt_device="/dev/stderr"

  if [[ -t 0 ]]; then
    have_tty=1
  elif [[ -e /dev/tty ]]; then
    have_tty=2
    prompt_device="/dev/tty"
  fi

  while true; do
    printf '%s\n' "$prompt" >"$prompt_device"
    for idx in "${!options[@]}"; do
      local number=$((idx + 1))
      if [[ $number -eq $default_choice ]]; then
        printf '  [%d] %s (default)\n' "$number" "${options[$idx]}" >"$prompt_device"
      else
        printf '  [%d] %s\n' "$number" "${options[$idx]}" >"$prompt_device"
      fi
    done

    if [[ $have_tty -eq 1 ]]; then
      read -r -p "Selection [$default_choice]: " choice || true
    elif [[ $have_tty -eq 2 ]]; then
      printf 'Selection [%s]: ' "$default_choice" > /dev/tty
      read -r choice < /dev/tty || true
    else
      printf 'No interactive terminal detected; selecting option %s by default.\n' "$default_choice" >"$prompt_device"
      choice="$default_choice"
    fi

    choice=$(trim "${choice:-}")
    if [[ -z $choice ]]; then
      choice="$default_choice"
    fi

    if [[ $choice =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      printf '%s' "$choice"
      return 0
    fi

    printf 'Please enter a number between 1 and %d.\n' "${#options[@]}" >"$prompt_device"
  done
}

select_primary_action() {
  local default_choice=1
  if [[ $existing_installation_detected -eq 1 ]]; then
    default_choice=2
  fi

  local selection
  selection=$(prompt_menu "Select an action" "$default_choice" \
    "Clean install (remove previous configuration and reinstall)" \
    "Update or repair the existing installation" \
    "Remove the installation and purge managed dependencies")

  case $selection in
    1)
      PRIMARY_ACTION="clean-install"
      ;;
    2)
      PRIMARY_ACTION="update"
      ;;
    3)
      PRIMARY_ACTION="purge"
      ;;
    *)
      fatal "Unexpected selection '$selection'"
      ;;
  esac
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

NGINX_SITE_AVAILABLE="/etc/nginx/sites-available/lecture-tools.conf"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/lecture-tools.conf"

ensure_nginx_installed() {
  if command -v nginx >/dev/null 2>&1; then
    return
  fi

  echo "[lecture-tools] Installing nginx..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx >/dev/null
}

ensure_certbot_installed() {
  if command -v certbot >/dev/null 2>&1; then
    return
  fi

  echo "[lecture-tools] Installing certbot..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y certbot >/dev/null
}

render_nginx_location_block() {
  local upstream="http://127.0.0.1:${HTTP_PORT:-8000}"
  local root_prefix="${ROOT_PATH:-}"
  local location_path="/"
  local proxy_target="$upstream"
  local redirect_block=""

  if [[ -n $root_prefix ]]; then
    if [[ ${root_prefix:0:1} != '/' ]]; then
      root_prefix="/$root_prefix"
    fi
    root_prefix="${root_prefix%/}"
    location_path="${root_prefix}/"
    proxy_target="${upstream}${root_prefix}/"
    printf -v redirect_block '    location = / {\n        return 302 %s/;\n    }\n' "$root_prefix"
  fi

  printf '    location %s {\n' "$location_path"
  printf '        proxy_pass %s;\n' "$proxy_target"
  printf '        proxy_set_header Host %s;\n' '$host'
  printf '        proxy_set_header X-Real-IP %s;\n' '$remote_addr'
  printf '        proxy_set_header X-Forwarded-For %s;\n' '$proxy_add_x_forwarded_for'
  printf '        proxy_set_header X-Forwarded-Proto %s;\n' '$scheme'
  printf '        proxy_set_header X-Forwarded-Host %s;\n' '$host'
  printf '        proxy_set_header X-Forwarded-Port %s;\n' '$server_port'
  printf '        proxy_http_version 1.1;\n'
  printf '        proxy_set_header Upgrade %s;\n' '$http_upgrade'
  printf '        proxy_set_header Connection "upgrade";\n'
  printf '        proxy_redirect off;\n'
  if [[ -n $root_prefix ]]; then
    printf '        proxy_set_header X-Script-Name %s;\n' "$root_prefix"
    printf '        proxy_set_header X-Forwarded-Prefix %s;\n' "$root_prefix"
  fi
  printf '    }\n'
  printf '%s' "$redirect_block"
}

activate_nginx_site() {
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  ln -sf "$NGINX_SITE_AVAILABLE" "$NGINX_SITE_ENABLED"
  if [[ -L /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
  fi
}

reload_nginx_service() {
  nginx -t
  if ! systemctl is-enabled --quiet nginx; then
    systemctl enable nginx >/dev/null 2>&1 || true
  fi
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl start nginx
  fi
}

remove_nginx_site() {
  local removed=0
  if [[ -f $NGINX_SITE_AVAILABLE ]]; then
    rm -f "$NGINX_SITE_AVAILABLE"
    removed=1
  fi
  if [[ -L $NGINX_SITE_ENABLED ]]; then
    rm -f "$NGINX_SITE_ENABLED"
    removed=1
  fi

  if [[ $removed -eq 1 ]]; then
    if command -v nginx >/dev/null 2>&1; then
      if nginx -t >/dev/null 2>&1; then
        systemctl reload nginx >/dev/null 2>&1 || systemctl restart nginx >/dev/null 2>&1 || true
      fi
    fi
  fi
}

reset_defaults_to_base() {
  INSTALL_DEFAULT=""
  REPO_DEFAULT=""
  BRANCH_DEFAULT=""
  USER_DEFAULT=""
  PORT_DEFAULT=""
  ROOT_PATH_DEFAULT=""
  DOMAIN_DEFAULT=""
  TLS_CERT_DEFAULT=""
  TLS_KEY_DEFAULT=""
  SERVICE_NAME_DEFAULT="$FALLBACK_SERVICE_NAME"
  UNIT_PATH_DEFAULT="$FALLBACK_UNIT_PATH"
  EXISTING_INSTALL_DIR=""
  EXISTING_SERVICE_USER=""
  EXISTING_SERVICE_GROUP=""
  EXISTING_SERVICE_NAME="$FALLBACK_SERVICE_NAME"
  EXISTING_UNIT_PATH="$FALLBACK_UNIT_PATH"
  EXISTING_TRACES=()
  existing_installation_detected=0
}

detect_existing_installation() {
  EXISTING_TRACES=()
  existing_installation_detected=0

  if [[ -f $CONFIG_FILE ]]; then
    EXISTING_TRACES+=("configuration file at $CONFIG_FILE")
  fi

  local service_name="$EXISTING_SERVICE_NAME"
  if [[ -z $service_name ]]; then
    service_name="$SERVICE_NAME_DEFAULT"
  fi
  if [[ -z $service_name ]]; then
    service_name="$FALLBACK_SERVICE_NAME"
  fi
  if [[ -n $service_name ]] && systemd_unit_exists "$service_name"; then
    EXISTING_TRACES+=("systemd service $service_name")
  fi

  local unit_path="$EXISTING_UNIT_PATH"
  if [[ -z $unit_path ]]; then
    unit_path="$UNIT_PATH_DEFAULT"
  fi
  if [[ -z $unit_path ]]; then
    unit_path="$FALLBACK_UNIT_PATH"
  fi
  if [[ -n $unit_path && -f $unit_path ]]; then
    EXISTING_TRACES+=("systemd unit file $unit_path")
  fi

  if [[ -n $EXISTING_INSTALL_DIR && -d $EXISTING_INSTALL_DIR ]]; then
    EXISTING_TRACES+=("application directory $EXISTING_INSTALL_DIR")
  fi

  if [[ -f $HELPER_PATH_DEFAULT ]]; then
    EXISTING_TRACES+=("helper CLI $HELPER_PATH_DEFAULT")
  fi

  if [[ -f $NGINX_SITE_AVAILABLE || -L $NGINX_SITE_ENABLED ]]; then
    EXISTING_TRACES+=("nginx site configuration")
  fi

  if (( ${#EXISTING_TRACES[@]} > 0 )); then
    existing_installation_detected=1
  fi
}

summarize_existing_installation() {
  if [[ $existing_installation_detected -eq 0 ]]; then
    return
  fi

  log "Detected existing Lecture Tools installation components:"
  for trace in "${EXISTING_TRACES[@]}"; do
    log "  - $trace"
  done
}

remove_existing_installation() {
  local purge_all="${1:-0}"
  local service_name="$EXISTING_SERVICE_NAME"
  if [[ -z $service_name ]]; then
    service_name="$SERVICE_NAME_DEFAULT"
  fi
  if [[ -z $service_name ]]; then
    service_name="$FALLBACK_SERVICE_NAME"
  fi

  if [[ -n $service_name ]] && systemd_unit_exists "$service_name"; then
    log "Stopping $service_name..."
    systemctl stop "$service_name" || true
    log "Disabling $service_name..."
    systemctl disable "$service_name" || true
  fi

  local unit_path="$EXISTING_UNIT_PATH"
  if [[ -z $unit_path ]]; then
    unit_path="$UNIT_PATH_DEFAULT"
  fi
  if [[ -z $unit_path ]]; then
    unit_path="$FALLBACK_UNIT_PATH"
  fi
  if [[ -n $unit_path && -f $unit_path ]]; then
    log "Removing unit file $unit_path..."
    rm -f "$unit_path"
  fi

  remove_nginx_site

  if [[ -f $HELPER_PATH_DEFAULT ]]; then
    log "Removing helper CLI $HELPER_PATH_DEFAULT..."
    rm -f "$HELPER_PATH_DEFAULT"
  fi

  if [[ -f $CONFIG_FILE ]]; then
    log "Deleting configuration file $CONFIG_FILE..."
    rm -f "$CONFIG_FILE"
  fi

  systemctl daemon-reload || true

  if [[ $purge_all -eq 1 ]]; then
    if [[ -n $EXISTING_INSTALL_DIR && -d $EXISTING_INSTALL_DIR ]]; then
      log "Removing installation directory $EXISTING_INSTALL_DIR..."
      rm -rf "$EXISTING_INSTALL_DIR"
    fi

    local user="$EXISTING_SERVICE_USER"
    local group="$EXISTING_SERVICE_GROUP"
    if [[ -z $group && -n $user ]]; then
      if id "$user" >/dev/null 2>&1; then
        group="$(id -gn "$user")"
      fi
    fi

    if [[ -n $user ]]; then
      if id "$user" >/dev/null 2>&1; then
        if [[ $user != "root" ]]; then
          log "Removing system user $user..."
          userdel "$user" || true
        else
          warn "Refusing to delete system user root."
        fi
      fi
    fi

    if [[ -n $group ]]; then
      if getent group "$group" >/dev/null 2>&1; then
        if [[ $group != "root" ]]; then
          log "Removing system group $group..."
          groupdel "$group" || true
        else
          warn "Refusing to delete system group root."
        fi
      fi
    fi
  else
    if [[ -n $EXISTING_INSTALL_DIR ]]; then
      log "Application files preserved in $EXISTING_INSTALL_DIR"
    fi
    if [[ -n $EXISTING_SERVICE_USER ]]; then
      log "System user $EXISTING_SERVICE_USER was preserved."
    fi
  fi

  EXISTING_TRACES=()
  existing_installation_detected=0
}

handle_existing_installation() {
  detect_existing_installation
  if [[ $existing_installation_detected -eq 0 ]]; then
    return
  fi

  log "Detected existing Lecture Tools installation artifacts:"
  for trace in "${EXISTING_TRACES[@]}"; do
    log "  - $trace"
  done

  local selection
  selection=$(prompt_menu "Select how to handle the existing installation" 1 \
    "Update and repair the existing installation" \
    "Remove the installation and exit" \
    "Remove everything and perform a clean install")

  case $selection in
    1)
      log "Proceeding with update and repair of the existing installation."
      ;;
    2)
      log "Removing existing installation components..."
      remove_existing_installation 0
      log "Existing installation removed. Exiting installer."
      exit 0
      ;;
    3)
      log "Preparing for a clean installation by removing existing components..."
      remove_existing_installation 1
      reset_defaults_to_base
      log "Clean installation will continue."
      ;;
    *)
      fatal "Unexpected selection '$selection'"
      ;;
  esac
}

configure_nginx_https() {
  require_root
  ensure_nginx_installed

  local domain="$1" cert_path="$2" key_path="$3" dollar='$'

  if [[ -z $domain ]]; then
    echo "[lecture-tools] error: A domain is required for HTTPS configuration." >&2
    exit 1
  fi
  if [[ -z $cert_path || ! -f $cert_path ]]; then
    echo "[lecture-tools] error: TLS certificate $cert_path is missing." >&2
    exit 1
  fi
  if [[ -z $key_path || ! -f $key_path ]]; then
    echo "[lecture-tools] error: TLS private key $key_path is missing." >&2
    exit 1
  fi

  local proxy_block
  proxy_block="$(render_nginx_location_block)"

  cat >"$NGINX_SITE_AVAILABLE" <<EOFNGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://${dollar}host${dollar}request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_timeout 10m;
    ssl_session_cache shared:SSL:10m;

${proxy_block}}
EOFNGINX

  chmod 0644 "$NGINX_SITE_AVAILABLE"
  activate_nginx_site
  reload_nginx_service
  echo "[lecture-tools] Nginx HTTPS reverse proxy configured for ${domain}."
}

configure_nginx_ip() {
  require_root
  ensure_nginx_installed

  local listen_port="$1"
  if [[ -z $listen_port ]]; then
    listen_port="80"
  fi
  if ! [[ $listen_port =~ ^[0-9]+$ ]]; then
    echo "[lecture-tools] error: Listen port must be numeric." >&2
    exit 1
  fi

  local proxy_block
  proxy_block="$(render_nginx_location_block)"

  cat >"$NGINX_SITE_AVAILABLE" <<EOFNGINX
server {
    listen ${listen_port};
    listen [::]:${listen_port};
    server_name _;

${proxy_block}}
EOFNGINX

  chmod 0644 "$NGINX_SITE_AVAILABLE"
  activate_nginx_site
  reload_nginx_service
  echo "[lecture-tools] Nginx HTTP reverse proxy configured on port ${listen_port}."
}

configure_nginx_http_domain() {
  require_root
  ensure_nginx_installed

  local domain="$1" listen_port="$2"
  if [[ -z $domain ]]; then
    echo "[lecture-tools] error: A domain is required for HTTP configuration." >&2
    exit 1
  fi
  if [[ -z $listen_port ]]; then
    listen_port="80"
  fi
  if ! [[ $listen_port =~ ^[0-9]+$ ]]; then
    echo "[lecture-tools] error: Listen port must be numeric." >&2
    exit 1
  fi

  local proxy_block
  proxy_block="$(render_nginx_location_block)"

  cat >"$NGINX_SITE_AVAILABLE" <<EOFNGINX
server {
    listen ${listen_port};
    listen [::]:${listen_port};
    server_name ${domain};

${proxy_block}}
EOFNGINX

  chmod 0644 "$NGINX_SITE_AVAILABLE"
  activate_nginx_site
  reload_nginx_service
  echo "[lecture-tools] Nginx HTTP reverse proxy configured for ${domain} on port ${listen_port}."
}

update_config_entry() {
  local key="$1" value="$2"
  python3 - "$CONFIG_FILE" "$key" "$value" <<'PY'
import os
import sys

path, key, value = sys.argv[1:]
value = value or ""
escaped = value.replace("\\", "\\\\").replace('"', '\\"')
lines = []
found = False

if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as handle:
        for line in handle:
            if line.startswith(f"{key}="):
                lines.append(f'{key}="{escaped}"\n')
                found = True
            else:
                lines.append(line)
else:
    lines = []

if not found:
    lines.append(f'{key}="{escaped}"\n')

with open(path, 'w', encoding='utf-8') as handle:
    handle.writelines(lines)
PY
  chmod 0600 "$CONFIG_FILE" || true
}

obtain_lets_encrypt_certificate() {
  local domain="$1" email="$2" share_email="$3" use_staging="$4"

  ensure_certbot_installed

  local nginx_was_active=0
  if systemctl is-active --quiet nginx; then
    nginx_was_active=1
    systemctl stop nginx || true
  fi

  local cmd=(certbot certonly --standalone --preferred-challenges http --agree-tos --non-interactive -d "$domain")
  if [[ -n $email ]]; then
    cmd+=(--email "$email")
    if [[ $share_email -eq 1 ]]; then
      cmd+=(--eff-email)
    else
      cmd+=(--no-eff-email)
    fi
  else
    cmd+=(--register-unsafely-without-email)
  fi
  if [[ $use_staging -eq 1 ]]; then
    cmd+=(--staging)
  fi

  echo "[lecture-tools] Requesting Let's Encrypt certificate for ${domain}..."
  if ! "${cmd[@]}"; then
    echo "[lecture-tools] error: Certbot was unable to obtain a certificate for ${domain}." >&2
    if [[ $nginx_was_active -eq 1 ]]; then
      systemctl start nginx || true
    fi
    return 1
  fi

  if [[ $nginx_was_active -eq 1 ]]; then
    systemctl start nginx || true
  fi

  return 0
}

guided_nginx_https() {
  local domain cert_path key_path email share_email use_staging

  while true; do
    domain=$(prompt_default "Domain for HTTPS (e.g. example.com)" "${PUBLIC_HOSTNAME:-}")
    domain=$(trim "$domain")
    if [[ -n $domain ]]; then
      break
    fi
    echo "A domain is required to configure HTTPS."
  done

  local default_use_existing="no"
  if [[ -n ${TLS_CERTIFICATE_PATH:-} && -n ${TLS_PRIVATE_KEY_PATH:-} ]]; then
    default_use_existing="yes"
  fi

  if prompt_yes_no "Use existing TLS certificate files for ${domain}?" "$default_use_existing"; then
    cert_path=$(prompt_default "Path to the TLS certificate" "${TLS_CERTIFICATE_PATH:-/etc/letsencrypt/live/${domain}/fullchain.pem}")
    cert_path=$(trim "$cert_path")
    key_path=$(prompt_default "Path to the TLS private key" "${TLS_PRIVATE_KEY_PATH:-/etc/letsencrypt/live/${domain}/privkey.pem}")
    key_path=$(trim "$key_path")
  else
    echo "Let's obtain a new Let's Encrypt certificate. Ensure DNS for ${domain} points to this server and that ports 80/443 are open."
    email=$(prompt_default "Email for Let's Encrypt expiry notices (leave blank to skip)" "")
    email=$(trim "$email")
    if [[ -n $email ]]; then
      if prompt_yes_no "Share your email with the Electronic Frontier Foundation?" "no"; then
        share_email=1
      else
        share_email=0
      fi
    else
      share_email=0
    fi
    if prompt_yes_no "Use Let's Encrypt staging environment (recommended for testing)?" "no"; then
      use_staging=1
    else
      use_staging=0
    fi

    if ! obtain_lets_encrypt_certificate "$domain" "$email" "${share_email:-0}" "${use_staging:-0}"; then
      echo "[lecture-tools] Aborting HTTPS configuration due to certificate issuance failure." >&2
      return 1
    fi

    cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
    key_path="/etc/letsencrypt/live/${domain}/privkey.pem"
  fi

  if [[ ! -f $cert_path ]]; then
    echo "[lecture-tools] error: TLS certificate $cert_path is missing." >&2
    return 1
  fi
  if [[ ! -f $key_path ]]; then
    echo "[lecture-tools] error: TLS private key $key_path is missing." >&2
    return 1
  fi

  configure_nginx_https "$domain" "$cert_path" "$key_path"

  PUBLIC_HOSTNAME="$domain"
  TLS_CERTIFICATE_PATH="$cert_path"
  TLS_PRIVATE_KEY_PATH="$key_path"
  update_config_entry "PUBLIC_HOSTNAME" "$PUBLIC_HOSTNAME"
  update_config_entry "TLS_CERTIFICATE_PATH" "$TLS_CERTIFICATE_PATH"
  update_config_entry "TLS_PRIVATE_KEY_PATH" "$TLS_PRIVATE_KEY_PATH"
  echo "[lecture-tools] Stored HTTPS settings in $CONFIG_FILE."
}

guided_nginx_setup() {
  local selection listen_port domain

  selection=$(prompt_menu "How should Nginx proxy Lecture Tools?" 3 \
    "Serve HTTP on the server IP (no TLS)" \
    "Serve HTTP for a domain name (no TLS)" \
    "Set up HTTPS with Let's Encrypt or existing certificates")

  case $selection in
    1)
      listen_port=$(prompt_default "HTTP listen port" "80")
      listen_port=$(trim "$listen_port")
      configure_nginx_ip "$listen_port"
      ;;
    2)
      domain=$(prompt_default "Domain for HTTP (e.g. example.com)" "${PUBLIC_HOSTNAME:-}")
      domain=$(trim "$domain")
      if [[ -z $domain ]]; then
        echo "[lecture-tools] error: A domain is required for this option." >&2
        return 1
      fi
      listen_port=$(prompt_default "HTTP listen port" "80")
      listen_port=$(trim "$listen_port")
      configure_nginx_http_domain "$domain" "$listen_port"
      PUBLIC_HOSTNAME="$domain"
      TLS_CERTIFICATE_PATH=""
      TLS_PRIVATE_KEY_PATH=""
      update_config_entry "PUBLIC_HOSTNAME" "$PUBLIC_HOSTNAME"
      update_config_entry "TLS_CERTIFICATE_PATH" ""
      update_config_entry "TLS_PRIVATE_KEY_PATH" ""
      echo "[lecture-tools] Stored HTTP domain settings in $CONFIG_FILE."
      ;;
    3)
      guided_nginx_https
      ;;
  esac
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

purge_installation() {
  require_root

  echo "[lecture-tools] WARNING: This will stop the service and permanently delete files, configuration, and the service user."
  read -r -p "Proceed with complete removal? [no]: " response || response="no"
  response=${response:-no}
  case ${response,,} in
    y|yes) ;;
    *)
      echo "[lecture-tools] Aborted complete removal."
      exit 0
      ;;
  esac

  if systemctl list-unit-files | grep -q "^${SERVICE_NAME}"; then
    systemctl stop "$SERVICE_NAME" || true
    systemctl disable "$SERVICE_NAME" || true
  fi

  if [[ -f $UNIT_PATH ]]; then
    rm -f "$UNIT_PATH"
  fi

  if [[ -f $CONFIG_FILE ]]; then
    rm -f "$CONFIG_FILE"
  fi

  if [[ -n ${INSTALL_DIR:-} && -d $INSTALL_DIR ]]; then
    rm -rf "$INSTALL_DIR"
  fi

  if [[ -n ${HELPER_PATH:-} && -f $HELPER_PATH ]]; then
    rm -f "$HELPER_PATH"
  fi

  remove_nginx_site

  if [[ -n ${SERVICE_USER:-} ]]; then
    if id "$SERVICE_USER" >/dev/null 2>&1; then
      userdel --remove "$SERVICE_USER" || true
    fi
  fi

  if [[ -n ${SERVICE_GROUP:-} ]]; then
    if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
      groupdel "$SERVICE_GROUP" || true
    fi
  fi

  systemctl daemon-reload || true

  echo "[lecture-tools] Complete removal finished."
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
  nginx)
    shift || true
    subcommand="${1:-}"
    case $subcommand in
      ""|guided|wizard|setup)
        guided_nginx_setup
        ;;
      https)
        shift || true
        domain="${1:-${PUBLIC_HOSTNAME:-}}"
        cert_path="${2:-${TLS_CERTIFICATE_PATH:-}}"
        key_path="${3:-${TLS_PRIVATE_KEY_PATH:-}}"
        configure_nginx_https "$domain" "$cert_path" "$key_path"
        ;;
      ip|http)
        shift || true
        listen_port="${1:-80}"
        configure_nginx_ip "$listen_port"
        ;;
      *)
        echo "Usage: lecturetool nginx [guided|https|http|ip] [options]" >&2
        echo "  guided                      Launch the interactive proxy configuration wizard (default)." >&2
        echo "  https [domain] [cert] [key] Configure HTTPS reverse proxy using the stored or provided values." >&2
        echo "  http [domain] [port]        Configure HTTP reverse proxy for a domain (default port 80)." >&2
        echo "  ip [port]                   Configure HTTP reverse proxy listening on the given port (default 80)." >&2
        exit 1
        ;;
    esac
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

    helper_source="$INSTALL_DIR/scripts/install_server.sh"
    if [[ -f $helper_source ]]; then
      echo "[lecture-tools] Refreshing helper CLI..."
      if bash "$helper_source" --render-helper "$HELPER_PATH"; then
        chmod 0755 "$HELPER_PATH"
        echo "[lecture-tools] Helper CLI refreshed."
      else
        echo "[lecture-tools] warning: Failed to refresh helper CLI from $helper_source." >&2
      fi
    else
      echo "[lecture-tools] warning: Cannot refresh helper CLI (missing $helper_source)." >&2
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
  purge|uninstall)
    purge_installation
    exit 0
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

prompt_menu() {
  local prompt="$1" default_choice="$2"
  shift 2
  local options=("$@")
  local choice
  local have_tty=0
  local prompt_device="/dev/stderr"

  if [[ -t 0 ]]; then
    have_tty=1
  elif [[ -e /dev/tty ]]; then
    have_tty=2
    prompt_device="/dev/tty"
  fi

  while true; do
    printf '%s\n' "$prompt" >"$prompt_device"
    for idx in "${!options[@]}"; do
      local number=$((idx + 1))
      if [[ $number -eq $default_choice ]]; then
        printf '  [%d] %s (default)\n' "$number" "${options[$idx]}" >"$prompt_device"
      else
        printf '  [%d] %s\n' "$number" "${options[$idx]}" >"$prompt_device"
      fi
    done

    if [[ $have_tty -eq 1 ]]; then
      read -r -p "Selection [$default_choice]: " choice || true
    elif [[ $have_tty -eq 2 ]]; then
      printf 'Selection [%s]: ' "$default_choice" > /dev/tty
      read -r choice < /dev/tty || true
    else
      printf 'No interactive terminal detected; selecting option %s by default.\n' "$default_choice" >"$prompt_device"
      choice="$default_choice"
    fi

    choice=$(trim "${choice:-}")
    if [[ -z $choice ]]; then
      choice="$default_choice"
    fi

    if [[ $choice =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      printf '%s' "$choice"
      return 0
    fi

    printf 'Please enter a number between 1 and %d.\n' "${#options[@]}" >"$prompt_device"
  done
}

select_primary_action() {
  local default_choice=1
  if [[ $existing_installation_detected -eq 1 ]]; then
    default_choice=2
  fi

  local selection
  selection=$(prompt_menu "Select an action" "$default_choice" \
    "Clean install (remove previous configuration and reinstall)" \
    "Update or repair the existing installation" \
    "Remove the installation and purge managed dependencies")

  case $selection in
    1)
      PRIMARY_ACTION="clean-install"
      ;;
    2)
      PRIMARY_ACTION="update"
      ;;
    3)
      PRIMARY_ACTION="purge"
      ;;
    *)
      fatal "Unexpected selection '$selection'"
      ;;
  esac
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

NGINX_SITE_AVAILABLE="/etc/nginx/sites-available/lecture-tools.conf"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/lecture-tools.conf"

ensure_nginx_installed() {
  if command -v nginx >/dev/null 2>&1; then
    return
  fi

  echo "[lecture-tools] Installing nginx..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx >/dev/null
}

ensure_certbot_installed() {
  if command -v certbot >/dev/null 2>&1; then
    return
  fi

  echo "[lecture-tools] Installing certbot..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y certbot >/dev/null
}

render_nginx_location_block() {
  local upstream="http://127.0.0.1:${HTTP_PORT:-8000}"
  local root_prefix="${ROOT_PATH:-}"
  local location_path="/"
  local proxy_target="$upstream"
  local redirect_block=""

  if [[ -n $root_prefix ]]; then
    if [[ ${root_prefix:0:1} != '/' ]]; then
      root_prefix="/$root_prefix"
    fi
    root_prefix="${root_prefix%/}"
    location_path="${root_prefix}/"
    proxy_target="${upstream}${root_prefix}/"
    printf -v redirect_block '    location = / {\n        return 302 %s/;\n    }\n' "$root_prefix"
  fi

  printf '    location %s {\n' "$location_path"
  printf '        proxy_pass %s;\n' "$proxy_target"
  printf '        proxy_set_header Host %s;\n' '$host'
  printf '        proxy_set_header X-Real-IP %s;\n' '$remote_addr'
  printf '        proxy_set_header X-Forwarded-For %s;\n' '$proxy_add_x_forwarded_for'
  printf '        proxy_set_header X-Forwarded-Proto %s;\n' '$scheme'
  printf '        proxy_set_header X-Forwarded-Host %s;\n' '$host'
  printf '        proxy_set_header X-Forwarded-Port %s;\n' '$server_port'
  printf '        proxy_http_version 1.1;\n'
  printf '        proxy_set_header Upgrade %s;\n' '$http_upgrade'
  printf '        proxy_set_header Connection "upgrade";\n'
  printf '        proxy_redirect off;\n'
  if [[ -n $root_prefix ]]; then
    printf '        proxy_set_header X-Script-Name %s;\n' "$root_prefix"
    printf '        proxy_set_header X-Forwarded-Prefix %s;\n' "$root_prefix"
  fi
  printf '    }\n'
  printf '%s' "$redirect_block"
}

activate_nginx_site() {
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  ln -sf "$NGINX_SITE_AVAILABLE" "$NGINX_SITE_ENABLED"
  if [[ -L /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
  fi
}

reload_nginx_service() {
  nginx -t
  if ! systemctl is-enabled --quiet nginx; then
    systemctl enable nginx >/dev/null 2>&1 || true
  fi
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl start nginx
  fi
}

remove_nginx_site() {
  local removed=0
  if [[ -f $NGINX_SITE_AVAILABLE ]]; then
    rm -f "$NGINX_SITE_AVAILABLE"
    removed=1
  fi
  if [[ -L $NGINX_SITE_ENABLED ]]; then
    rm -f "$NGINX_SITE_ENABLED"
    removed=1
  fi

  if [[ $removed -eq 1 ]]; then
    if command -v nginx >/dev/null 2>&1; then
      if nginx -t >/dev/null 2>&1; then
        systemctl reload nginx >/dev/null 2>&1 || systemctl restart nginx >/dev/null 2>&1 || true
      fi
    fi
  fi
}

reset_defaults_to_base() {
  INSTALL_DEFAULT=""
  REPO_DEFAULT=""
  BRANCH_DEFAULT=""
  USER_DEFAULT=""
  PORT_DEFAULT=""
  ROOT_PATH_DEFAULT=""
  DOMAIN_DEFAULT=""
  TLS_CERT_DEFAULT=""
  TLS_KEY_DEFAULT=""
  SERVICE_NAME_DEFAULT="$FALLBACK_SERVICE_NAME"
  UNIT_PATH_DEFAULT="$FALLBACK_UNIT_PATH"
  EXISTING_INSTALL_DIR=""
  EXISTING_SERVICE_USER=""
  EXISTING_SERVICE_GROUP=""
  EXISTING_SERVICE_NAME="$FALLBACK_SERVICE_NAME"
  EXISTING_UNIT_PATH="$FALLBACK_UNIT_PATH"
  EXISTING_TRACES=()
  existing_installation_detected=0
}

detect_existing_installation() {
  EXISTING_TRACES=()
  existing_installation_detected=0

  if [[ -f $CONFIG_FILE ]]; then
    EXISTING_TRACES+=("configuration file at $CONFIG_FILE")
  fi

  local service_name="$EXISTING_SERVICE_NAME"
  if [[ -z $service_name ]]; then
    service_name="$SERVICE_NAME_DEFAULT"
  fi
  if [[ -z $service_name ]]; then
    service_name="$FALLBACK_SERVICE_NAME"
  fi
  if [[ -n $service_name ]] && systemd_unit_exists "$service_name"; then
    EXISTING_TRACES+=("systemd service $service_name")
  fi

  local unit_path="$EXISTING_UNIT_PATH"
  if [[ -z $unit_path ]]; then
    unit_path="$UNIT_PATH_DEFAULT"
  fi
  if [[ -z $unit_path ]]; then
    unit_path="$FALLBACK_UNIT_PATH"
  fi
  if [[ -n $unit_path && -f $unit_path ]]; then
    EXISTING_TRACES+=("systemd unit file $unit_path")
  fi

  if [[ -n $EXISTING_INSTALL_DIR && -d $EXISTING_INSTALL_DIR ]]; then
    EXISTING_TRACES+=("application directory $EXISTING_INSTALL_DIR")
  fi

  if [[ -f $HELPER_PATH_DEFAULT ]]; then
    EXISTING_TRACES+=("helper CLI $HELPER_PATH_DEFAULT")
  fi

  if [[ -f $NGINX_SITE_AVAILABLE || -L $NGINX_SITE_ENABLED ]]; then
    EXISTING_TRACES+=("nginx site configuration")
  fi

  if (( ${#EXISTING_TRACES[@]} > 0 )); then
    existing_installation_detected=1
  fi
}

summarize_existing_installation() {
  if [[ $existing_installation_detected -eq 0 ]]; then
    return
  fi

  log "Detected existing Lecture Tools installation components:"
  for trace in "${EXISTING_TRACES[@]}"; do
    log "  - $trace"
  done
}

remove_existing_installation() {
  local purge_all="${1:-0}"
  local service_name="$EXISTING_SERVICE_NAME"
  if [[ -z $service_name ]]; then
    service_name="$SERVICE_NAME_DEFAULT"
  fi
  if [[ -z $service_name ]]; then
    service_name="$FALLBACK_SERVICE_NAME"
  fi

  if [[ -n $service_name ]] && systemd_unit_exists "$service_name"; then
    log "Stopping $service_name..."
    systemctl stop "$service_name" || true
    log "Disabling $service_name..."
    systemctl disable "$service_name" || true
  fi

  local unit_path="$EXISTING_UNIT_PATH"
  if [[ -z $unit_path ]]; then
    unit_path="$UNIT_PATH_DEFAULT"
  fi
  if [[ -z $unit_path ]]; then
    unit_path="$FALLBACK_UNIT_PATH"
  fi
  if [[ -n $unit_path && -f $unit_path ]]; then
    log "Removing unit file $unit_path..."
    rm -f "$unit_path"
  fi

  remove_nginx_site

  if [[ -f $HELPER_PATH_DEFAULT ]]; then
    log "Removing helper CLI $HELPER_PATH_DEFAULT..."
    rm -f "$HELPER_PATH_DEFAULT"
  fi

  if [[ -f $CONFIG_FILE ]]; then
    log "Deleting configuration file $CONFIG_FILE..."
    rm -f "$CONFIG_FILE"
  fi

  systemctl daemon-reload || true

  if [[ $purge_all -eq 1 ]]; then
    if [[ -n $EXISTING_INSTALL_DIR && -d $EXISTING_INSTALL_DIR ]]; then
      log "Removing installation directory $EXISTING_INSTALL_DIR..."
      rm -rf "$EXISTING_INSTALL_DIR"
    fi

    local user="$EXISTING_SERVICE_USER"
    local group="$EXISTING_SERVICE_GROUP"
    if [[ -z $group && -n $user ]]; then
      if id "$user" >/dev/null 2>&1; then
        group="$(id -gn "$user")"
      fi
    fi

    if [[ -n $user ]]; then
      if id "$user" >/dev/null 2>&1; then
        if [[ $user != "root" ]]; then
          log "Removing system user $user..."
          userdel "$user" || true
        else
          warn "Refusing to delete system user root."
        fi
      fi
    fi

    if [[ -n $group ]]; then
      if getent group "$group" >/dev/null 2>&1; then
        if [[ $group != "root" ]]; then
          log "Removing system group $group..."
          groupdel "$group" || true
        else
          warn "Refusing to delete system group root."
        fi
      fi
    fi
  else
    if [[ -n $EXISTING_INSTALL_DIR ]]; then
      log "Application files preserved in $EXISTING_INSTALL_DIR"
    fi
    if [[ -n $EXISTING_SERVICE_USER ]]; then
      log "System user $EXISTING_SERVICE_USER was preserved."
    fi
  fi

  EXISTING_TRACES=()
  existing_installation_detected=0
}

handle_existing_installation() {
  detect_existing_installation
  if [[ $existing_installation_detected -eq 0 ]]; then
    return
  fi

  log "Detected existing Lecture Tools installation artifacts:"
  for trace in "${EXISTING_TRACES[@]}"; do
    log "  - $trace"
  done

  local selection
  selection=$(prompt_menu "Select how to handle the existing installation" 1 \
    "Update and repair the existing installation" \
    "Remove the installation and exit" \
    "Remove everything and perform a clean install")

  case $selection in
    1)
      log "Proceeding with update and repair of the existing installation."
      ;;
    2)
      log "Removing existing installation components..."
      remove_existing_installation 0
      log "Existing installation removed. Exiting installer."
      exit 0
      ;;
    3)
      log "Preparing for a clean installation by removing existing components..."
      remove_existing_installation 1
      reset_defaults_to_base
      log "Clean installation will continue."
      ;;
    *)
      fatal "Unexpected selection '$selection'"
      ;;
  esac
}

configure_nginx_https() {
  require_root
  ensure_nginx_installed

  local domain="$1" cert_path="$2" key_path="$3" dollar='$'

  if [[ -z $domain ]]; then
    echo "[lecture-tools] error: A domain is required for HTTPS configuration." >&2
    exit 1
  fi
  if [[ -z $cert_path || ! -f $cert_path ]]; then
    echo "[lecture-tools] error: TLS certificate $cert_path is missing." >&2
    exit 1
  fi
  if [[ -z $key_path || ! -f $key_path ]]; then
    echo "[lecture-tools] error: TLS private key $key_path is missing." >&2
    exit 1
  fi

  local proxy_block
  proxy_block="$(render_nginx_location_block)"

  cat >"$NGINX_SITE_AVAILABLE" <<EOFNGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://${dollar}host${dollar}request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_timeout 10m;
    ssl_session_cache shared:SSL:10m;

${proxy_block}}
EOFNGINX

  chmod 0644 "$NGINX_SITE_AVAILABLE"
  activate_nginx_site
  reload_nginx_service
  echo "[lecture-tools] Nginx HTTPS reverse proxy configured for ${domain}."
}

configure_nginx_ip() {
  require_root
  ensure_nginx_installed

  local listen_port="$1"
  if [[ -z $listen_port ]]; then
    listen_port="80"
  fi
  if ! [[ $listen_port =~ ^[0-9]+$ ]]; then
    echo "[lecture-tools] error: Listen port must be numeric." >&2
    exit 1
  fi

  local proxy_block
  proxy_block="$(render_nginx_location_block)"

  cat >"$NGINX_SITE_AVAILABLE" <<EOFNGINX
server {
    listen ${listen_port};
    listen [::]:${listen_port};
    server_name _;

${proxy_block}}
EOFNGINX

  chmod 0644 "$NGINX_SITE_AVAILABLE"
  activate_nginx_site
  reload_nginx_service
  echo "[lecture-tools] Nginx HTTP reverse proxy configured on port ${listen_port}."
}

configure_nginx_http_domain() {
  require_root
  ensure_nginx_installed

  local domain="$1" listen_port="$2"
  if [[ -z $domain ]]; then
    echo "[lecture-tools] error: A domain is required for HTTP configuration." >&2
    exit 1
  fi
  if [[ -z $listen_port ]]; then
    listen_port="80"
  fi
  if ! [[ $listen_port =~ ^[0-9]+$ ]]; then
    echo "[lecture-tools] error: Listen port must be numeric." >&2
    exit 1
  fi

  local proxy_block
  proxy_block="$(render_nginx_location_block)"

  cat >"$NGINX_SITE_AVAILABLE" <<EOFNGINX
server {
    listen ${listen_port};
    listen [::]:${listen_port};
    server_name ${domain};

${proxy_block}}
EOFNGINX

  chmod 0644 "$NGINX_SITE_AVAILABLE"
  activate_nginx_site
  reload_nginx_service
  echo "[lecture-tools] Nginx HTTP reverse proxy configured for ${domain} on port ${listen_port}."
}

update_config_entry() {
  local key="$1" value="$2"
  python3 - "$CONFIG_FILE" "$key" "$value" <<'PY'
import os
import sys

path, key, value = sys.argv[1:]
value = value or ""
escaped = value.replace("\\", "\\\\").replace('"', '\\"')
lines = []
found = False

if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as handle:
        for line in handle:
            if line.startswith(f"{key}="):
                lines.append(f'{key}="{escaped}"\n')
                found = True
            else:
                lines.append(line)
else:
    lines = []

if not found:
    lines.append(f'{key}="{escaped}"\n')

with open(path, 'w', encoding='utf-8') as handle:
    handle.writelines(lines)
PY
  chmod 0600 "$CONFIG_FILE" || true
}

obtain_lets_encrypt_certificate() {
  local domain="$1" email="$2" share_email="$3" use_staging="$4"

  ensure_certbot_installed

  local nginx_was_active=0
  if systemctl is-active --quiet nginx; then
    nginx_was_active=1
    systemctl stop nginx || true
  fi

  local cmd=(certbot certonly --standalone --preferred-challenges http --agree-tos --non-interactive -d "$domain")
  if [[ -n $email ]]; then
    cmd+=(--email "$email")
    if [[ $share_email -eq 1 ]]; then
      cmd+=(--eff-email)
    else
      cmd+=(--no-eff-email)
    fi
  else
    cmd+=(--register-unsafely-without-email)
  fi
  if [[ $use_staging -eq 1 ]]; then
    cmd+=(--staging)
  fi

  echo "[lecture-tools] Requesting Let's Encrypt certificate for ${domain}..."
  if ! "${cmd[@]}"; then
    echo "[lecture-tools] error: Certbot was unable to obtain a certificate for ${domain}." >&2
    if [[ $nginx_was_active -eq 1 ]]; then
      systemctl start nginx || true
    fi
    return 1
  fi

  if [[ $nginx_was_active -eq 1 ]]; then
    systemctl start nginx || true
  fi

  return 0
}

guided_nginx_https() {
  local domain cert_path key_path email share_email use_staging

  while true; do
    domain=$(prompt_default "Domain for HTTPS (e.g. example.com)" "${PUBLIC_HOSTNAME:-}")
    domain=$(trim "$domain")
    if [[ -n $domain ]]; then
      break
    fi
    echo "A domain is required to configure HTTPS."
  done

  local default_use_existing="no"
  if [[ -n ${TLS_CERTIFICATE_PATH:-} && -n ${TLS_PRIVATE_KEY_PATH:-} ]]; then
    default_use_existing="yes"
  fi

  if prompt_yes_no "Use existing TLS certificate files for ${domain}?" "$default_use_existing"; then
    cert_path=$(prompt_default "Path to the TLS certificate" "${TLS_CERTIFICATE_PATH:-/etc/letsencrypt/live/${domain}/fullchain.pem}")
    cert_path=$(trim "$cert_path")
    key_path=$(prompt_default "Path to the TLS private key" "${TLS_PRIVATE_KEY_PATH:-/etc/letsencrypt/live/${domain}/privkey.pem}")
    key_path=$(trim "$key_path")
  else
    echo "Let's obtain a new Let's Encrypt certificate. Ensure DNS for ${domain} points to this server and that ports 80/443 are open."
    email=$(prompt_default "Email for Let's Encrypt expiry notices (leave blank to skip)" "")
    email=$(trim "$email")
    if [[ -n $email ]]; then
      if prompt_yes_no "Share your email with the Electronic Frontier Foundation?" "no"; then
        share_email=1
      else
        share_email=0
      fi
    else
      share_email=0
    fi
    if prompt_yes_no "Use Let's Encrypt staging environment (recommended for testing)?" "no"; then
      use_staging=1
    else
      use_staging=0
    fi

    if ! obtain_lets_encrypt_certificate "$domain" "$email" "${share_email:-0}" "${use_staging:-0}"; then
      echo "[lecture-tools] Aborting HTTPS configuration due to certificate issuance failure." >&2
      return 1
    fi

    cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
    key_path="/etc/letsencrypt/live/${domain}/privkey.pem"
  fi

  if [[ ! -f $cert_path ]]; then
    echo "[lecture-tools] error: TLS certificate $cert_path is missing." >&2
    return 1
  fi
  if [[ ! -f $key_path ]]; then
    echo "[lecture-tools] error: TLS private key $key_path is missing." >&2
    return 1
  fi

  configure_nginx_https "$domain" "$cert_path" "$key_path"

  PUBLIC_HOSTNAME="$domain"
  TLS_CERTIFICATE_PATH="$cert_path"
  TLS_PRIVATE_KEY_PATH="$key_path"
  update_config_entry "PUBLIC_HOSTNAME" "$PUBLIC_HOSTNAME"
  update_config_entry "TLS_CERTIFICATE_PATH" "$TLS_CERTIFICATE_PATH"
  update_config_entry "TLS_PRIVATE_KEY_PATH" "$TLS_PRIVATE_KEY_PATH"
  echo "[lecture-tools] Stored HTTPS settings in $CONFIG_FILE."
}

guided_nginx_setup() {
  local selection listen_port domain

  selection=$(prompt_menu "How should Nginx proxy Lecture Tools?" 3 \
    "Serve HTTP on the server IP (no TLS)" \
    "Serve HTTP for a domain name (no TLS)" \
    "Set up HTTPS with Let's Encrypt or existing certificates")

  case $selection in
    1)
      listen_port=$(prompt_default "HTTP listen port" "80")
      listen_port=$(trim "$listen_port")
      configure_nginx_ip "$listen_port"
      ;;
    2)
      domain=$(prompt_default "Domain for HTTP (e.g. example.com)" "${PUBLIC_HOSTNAME:-}")
      domain=$(trim "$domain")
      if [[ -z $domain ]]; then
        echo "[lecture-tools] error: A domain is required for this option." >&2
        return 1
      fi
      listen_port=$(prompt_default "HTTP listen port" "80")
      listen_port=$(trim "$listen_port")
      configure_nginx_http_domain "$domain" "$listen_port"
      PUBLIC_HOSTNAME="$domain"
      TLS_CERTIFICATE_PATH=""
      TLS_PRIVATE_KEY_PATH=""
      update_config_entry "PUBLIC_HOSTNAME" "$PUBLIC_HOSTNAME"
      update_config_entry "TLS_CERTIFICATE_PATH" ""
      update_config_entry "TLS_PRIVATE_KEY_PATH" ""
      echo "[lecture-tools] Stored HTTP domain settings in $CONFIG_FILE."
      ;;
    3)
      guided_nginx_https
      ;;
  esac
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

purge_installation() {
  require_root

  echo "[lecture-tools] WARNING: This will stop the service and permanently delete files, configuration, and the service user."
  read -r -p "Proceed with complete removal? [no]: " response || response="no"
  response=${response:-no}
  case ${response,,} in
    y|yes) ;;
    *)
      echo "[lecture-tools] Aborted complete removal."
      exit 0
      ;;
  esac

  if systemctl list-unit-files | grep -q "^${SERVICE_NAME}"; then
    systemctl stop "$SERVICE_NAME" || true
    systemctl disable "$SERVICE_NAME" || true
  fi

  if [[ -f $UNIT_PATH ]]; then
    rm -f "$UNIT_PATH"
  fi

  if [[ -f $CONFIG_FILE ]]; then
    rm -f "$CONFIG_FILE"
  fi

  if [[ -n ${INSTALL_DIR:-} && -d $INSTALL_DIR ]]; then
    rm -rf "$INSTALL_DIR"
  fi

  if [[ -n ${HELPER_PATH:-} && -f $HELPER_PATH ]]; then
    rm -f "$HELPER_PATH"
  fi

  remove_nginx_site

  if [[ -n ${SERVICE_USER:-} ]]; then
    if id "$SERVICE_USER" >/dev/null 2>&1; then
      userdel --remove "$SERVICE_USER" || true
    fi
  fi

  if [[ -n ${SERVICE_GROUP:-} ]]; then
    if getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
      groupdel "$SERVICE_GROUP" || true
    fi
  fi

  systemctl daemon-reload || true

  echo "[lecture-tools] Complete removal finished."
}


main() {
  if [[ ${1:-} == "--render-helper" ]]; then
    shift || true
    output_path="${1:-/dev/stdout}"
    write_helper_script "$output_path"
    exit 0
  fi

  ensure_debian
  load_existing_configuration
  detect_existing_installation
  summarize_existing_installation
  select_primary_action

  case $PRIMARY_ACTION in
    clean-install)
      if [[ $existing_installation_detected -eq 1 ]]; then
        log "Removing existing installation before performing a clean install..."
        remove_existing_installation 1
        reset_defaults_to_base
      else
        log "No previous installation found. Proceeding with a fresh setup."
      fi
      ;;
    update)
      if [[ $existing_installation_detected -eq 0 ]]; then
        log "No previous installation detected. Proceeding with a new installation."
      fi
      ;;
    purge)
      detect_legacy_docker
      if [[ $existing_installation_detected -eq 1 ]]; then
        log "Removing existing installation components..."
        remove_existing_installation 1
      fi
      purge_packages
      log "Managed dependencies purged."
      log "Server environment fully removed."
      exit 0
      ;;
    *)
      fatal "Unrecognized primary action '$PRIMARY_ACTION'"
      ;;
  esac

  detect_legacy_docker
  ensure_packages

  DEFAULT_INSTALL_DIR="${INSTALL_DEFAULT:-$FALLBACK_INSTALL_DIR}"
  DEFAULT_REPO="${REPO_DEFAULT:-$FALLBACK_REPO}"
  DEFAULT_BRANCH="${BRANCH_DEFAULT:-$FALLBACK_BRANCH}"
  DEFAULT_USER="${USER_DEFAULT:-$FALLBACK_USER}"
  DEFAULT_PORT="${PORT_DEFAULT:-$FALLBACK_PORT}"
  DEFAULT_ROOT_PATH="${ROOT_PATH_DEFAULT:-$FALLBACK_ROOT_PATH}"
  DEFAULT_DOMAIN="${DOMAIN_DEFAULT:-$FALLBACK_DOMAIN}"
  DEFAULT_TLS_CERT="${TLS_CERT_DEFAULT:-$FALLBACK_TLS_CERT}"
  DEFAULT_TLS_KEY="${TLS_KEY_DEFAULT:-$FALLBACK_TLS_KEY}"

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
  root_path=$(normalize_root_path "$root_path")
  domain=$(prompt_default "Public domain (leave blank if behind a load balancer or IP only)" "$DEFAULT_DOMAIN")
  domain=$(trim "$domain")

  HTTP_PORT="$port"
  ROOT_PATH="$root_path"
  PUBLIC_HOSTNAME="$domain"

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

  TLS_CERTIFICATE_PATH="$tls_cert_path"
  TLS_PRIVATE_KEY_PATH="$tls_key_path"

  if [[ -z $install_dir ]]; then
    fatal "Installation directory cannot be empty."
  fi
  if [[ $install_dir == "/" ]]; then
    fatal "Installation directory cannot be the filesystem root."
  fi
  if [[ $install_dir == *" "* ]]; then
    warn "Installation directory contains spaces; generated systemd unit will escape them."
  fi
  if [[ -z $service_user ]]; then
    fatal "System user cannot be empty."
  fi
  if [[ ! $service_user =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    sanitized_service_user=$(sanitize_service_user "$service_user" "$DEFAULT_USER")
    if [[ $sanitized_service_user != "$service_user" ]]; then
      warn "System user '$service_user' is invalid; using '$sanitized_service_user' instead."
    fi
    service_user="$sanitized_service_user"
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

  create_service_user "$service_user" "$install_dir"
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

  proxy_default="no"
  if [[ -n $domain ]]; then
    proxy_default="yes"
  fi

  if prompt_yes_no "Configure an Nginx reverse proxy now?" "$proxy_default"; then
    guided_nginx_setup
    if [[ -f $CONFIG_FILE ]]; then
      # shellcheck disable=SC1091
      source "$CONFIG_FILE"
      domain="${PUBLIC_HOSTNAME:-$domain}"
      tls_cert_path="${TLS_CERTIFICATE_PATH:-$tls_cert_path}"
      tls_key_path="${TLS_PRIVATE_KEY_PATH:-$tls_key_path}"
    fi
  else
    log "Skip configuring Nginx. You can run 'sudo lecturetool nginx guided' later."
  fi

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
}


main "$@"
