#!/usr/bin/env bash

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "[lecture-tools] error: This installer must be run as root (e.g. with sudo)." >&2
  exit 1
fi

log() {
  printf '[lecture-tools] %s\n' "$*"
}

fatal() {
  printf '[lecture-tools] error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fatal "Required command '$1' is not available in PATH."
  fi
}

trim_whitespace() {
  local value=$1
  while [[ -n $value && $value == [[:space:]]* ]]; do
    value=${value#?}
  done
  while [[ -n $value && $value == *[[:space:]] ]]; do
    value=${value%?}
  done
  printf '%s' "$value"
}

prompt_default() {
  local prompt default reply trimmed
  prompt=$1
  default=$2
  read -r -p "$prompt [$default]: " reply || true
  trimmed=$(trim_whitespace "${reply:-}")
  if [[ -z $trimmed ]]; then
    printf '%s' "$default"
  else
    printf '%s' "$trimmed"
  fi
}

prompt_yes_no() {
  local prompt default reply
  prompt=$1
  default=$2
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
  # shellcheck disable=SC1091
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

docker_repo_id() {
  # shellcheck disable=SC1091
  source /etc/os-release
  case ${ID,,} in
    linuxmint|elementary|pop)
      echo "ubuntu"
      ;;
    *)
      echo "$ID"
      ;;
  esac
}

docker_repo_codename() {
  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ -n ${VERSION_CODENAME:-} ]]; then
    echo "$VERSION_CODENAME"
  elif [[ -n ${UBUNTU_CODENAME:-} ]]; then
    echo "$UBUNTU_CODENAME"
  else
    fatal "Unable to determine distribution codename."
  fi
}

require_tools() {
  local packages=(ca-certificates curl gnupg lsb-release git)
  log "Ensuring base packages (${packages[*]}) are installed..."
  apt-get update >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}" >/dev/null
}

install_docker() {
  local docker_installed_by_script=0 compose_installed_by_script=0
  if ! command -v docker >/dev/null 2>&1; then
    log "Docker Engine not detected – installing..."
    install -m 0755 -d /etc/apt/keyrings
    local repo_id
    repo_id=$(docker_repo_id)
    if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
      curl -fsSL "https://download.docker.com/linux/${repo_id}/gpg" -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
    fi
    local arch codename
    arch=$(dpkg --print-architecture)
    codename=$(docker_repo_codename)
    echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${repo_id} $codename stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update >/dev/null
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
    docker_installed_by_script=1
    compose_installed_by_script=1
  else
    log "Docker Engine already installed."
    if docker compose version >/dev/null 2>&1; then
      log "Docker Compose plugin available."
    elif command -v docker-compose >/dev/null 2>&1; then
      log "docker-compose binary detected."
    else
      log "Docker Compose plugin missing – installing official plugin..."
      install -m 0755 -d /etc/apt/keyrings
      local repo_id
      repo_id=$(docker_repo_id)
      if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
        curl -fsSL "https://download.docker.com/linux/${repo_id}/gpg" -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
      fi
      local arch codename
      arch=$(dpkg --print-architecture)
      codename=$(docker_repo_codename)
      echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${repo_id} $codename stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update >/dev/null
      DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin >/dev/null
      compose_installed_by_script=1
    fi
  fi
  printf '%s' "$docker_installed_by_script:$compose_installed_by_script"
}

configure_firewall() {
  local port=$1
  if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -q "Status: active"; then
      if prompt_yes_no "UFW is active. Allow TCP port $port through the firewall?" "yes"; then
        ufw allow "$port"/tcp
      fi
    fi
  fi
}

create_service_user() {
  local user=$1
  if id "$user" >/dev/null 2>&1; then
    log "System user '$user' already exists."
  else
    log "Creating system user '$user'..."
    adduser --system --group --home "/var/lib/$user" "$user" >/dev/null
  fi
  if [[ $user != "root" ]]; then
    usermod -aG docker "$user"
  fi
}

write_compose_override() {
  local install_dir=$1 data_dir=$2 port=$3 root_path=$4
  mkdir -p "$data_dir/assets" "$data_dir/storage"
  cat >"$install_dir/docker-compose.override.yml" <<EOF
services:
  lecturetools:
    ports:
      - "$port:8000"
    volumes:
      - "$data_dir/storage:/app/storage"
      - "$data_dir/assets:/app/assets"
    environment:
      - LECTURE_TOOLS_ROOT_PATH=$root_path
EOF
}

write_env_file() {
  local install_dir=$1 project_name=$2
  cat >"$install_dir/.env" <<EOF
COMPOSE_PROJECT_NAME=$project_name
EOF
}

write_systemd_unit() {
  local unit=$1 install_dir=$2 compose_cmd=$3 project_name=$4 user=$5
  cat >"/etc/systemd/system/$unit" <<EOF
[Unit]
Description=Lecture Tools container stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$install_dir
User=$user
Group=$user
ExecStart=$compose_cmd -p $project_name up -d --remove-orphans
ExecStop=$compose_cmd -p $project_name down --remove-orphans
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
}

write_cli_wrapper() {
  cat >/usr/local/bin/lecturetool <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
CONFIG_FILE=/etc/lecturetool.conf
if [[ ! -f $CONFIG_FILE ]]; then
  echo "[lecturetool] error: configuration $CONFIG_FILE not found." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG_FILE"
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "[lecturetool] error: please run this command as root (e.g. sudo lecturetool -start)." >&2
  exit 1
fi
COMPOSE_CMD=${COMPOSE_CMD:-docker compose}
SERVICE_UNIT=${SERVICE_UNIT:-lecturetools.service}
INSTALL_DIR=${INSTALL_DIR:-/opt/lecture-tools}
PROJECT_NAME=${PROJECT_NAME:-lecturetools}
DATA_DIR=${DATA_DIR:-$INSTALL_DIR}
SERVICE_USER=${SERVICE_USER:-root}
HTTP_PORT=${HTTP_PORT:-8000}
ROOT_PATH=${ROOT_PATH:-}
DOCKER_INSTALLED=${DOCKER_INSTALLED:-0}
COMPOSE_PLUGIN_INSTALLED=${COMPOSE_PLUGIN_INSTALLED:-0}
SELF_PATH=${SELF_PATH:-/usr/local/bin/lecturetool}

compose() {
  pushd "$INSTALL_DIR" >/dev/null
  set +e
  if [[ $COMPOSE_CMD == "docker-compose" ]]; then
    docker-compose -p "$PROJECT_NAME" "$@"
  else
    docker compose -p "$PROJECT_NAME" "$@"
  fi
  local status=$?
  set -e
  popd >/dev/null
  return $status
}

case "${1:-}" in
  -enable)
    systemctl daemon-reload
    systemctl enable "$SERVICE_UNIT"
    echo "lecture-tools service enabled at boot."
    ;;
  -disable)
    systemctl disable "$SERVICE_UNIT"
    systemctl daemon-reload
    echo "lecture-tools service disabled at boot."
    ;;
  -start)
    systemctl daemon-reload
    systemctl start "$SERVICE_UNIT"
    systemctl status --no-pager "$SERVICE_UNIT"
    ;;
  -stop)
    systemctl stop "$SERVICE_UNIT"
    ;;
  -status)
    systemctl status --no-pager "$SERVICE_UNIT" || true
    compose ps
    ;;
  -update)
    systemctl stop "$SERVICE_UNIT" || true
    pushd "$INSTALL_DIR" >/dev/null
    if [[ -d .git ]]; then
      git fetch --all --prune
      git reset --hard "origin/${GIT_BRANCH:-main}"
    fi
    compose pull
    compose build --pull
    compose up -d --remove-orphans
    popd >/dev/null
    systemctl start "$SERVICE_UNIT"
    systemctl status --no-pager "$SERVICE_UNIT"
    ;;
  -remove)
    read -r -p "This will stop Lecture Tools, delete its data and uninstall Docker. Continue? [y/N]: " confirm
    case ${confirm,,} in
      y|yes)
        systemctl stop "$SERVICE_UNIT" || true
        systemctl disable "$SERVICE_UNIT" || true
        compose down --volumes --remove-orphans || true
        rm -f "/etc/systemd/system/$SERVICE_UNIT"
        systemctl daemon-reload
        rm -rf "$INSTALL_DIR" "$DATA_DIR" "/etc/lecturetool.conf"
        if [[ $DOCKER_INSTALLED -eq 1 ]]; then
          apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || true
          rm -f /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.gpg
          apt-get autoremove -y || true
        elif [[ $COMPOSE_PLUGIN_INSTALLED -eq 1 ]]; then
          apt-get purge -y docker-compose-plugin || true
        fi
        rm -f "$SELF_PATH"
        echo "Lecture Tools and Docker have been removed."
        ;;
      *)
        echo "Aborted."
        ;;
    esac
    ;;
  *)
    cat <<USAGE
lecturetool - Manage the Lecture Tools Docker deployment

Usage: lecturetool [option]

Options:
  -enable   Enable the systemd service at boot
  -disable  Disable the systemd service
  -start    Start the Lecture Tools service
  -stop     Stop the Lecture Tools service
  -update   Fetch latest code and restart the service
  -status   Show the current status of the service
  -remove   Remove Lecture Tools, its data and Docker
USAGE
    exit 1
    ;;
esac
EOF
  chmod +x /usr/local/bin/lecturetool
}

write_config() {
  local path=$1
  shift
  : >"$path"
  while [[ $# -gt 0 ]]; do
    local key=$1
    local value=$2
    shift 2
    printf '%s=%q\n' "$key" "$value" >>"$path"
  done
}

main() {
  ensure_debian
  require_cmd systemctl
  require_tools
  local docker_flags
  docker_flags=$(install_docker)
  local docker_installed_by_script compose_installed_by_script
  docker_installed_by_script=${docker_flags%%:*}
  compose_installed_by_script=${docker_flags##*:}

  log "Configuring Lecture Tools installation..."

  local repo_url install_dir data_dir project_name http_port root_path service_user enable_service git_branch
  repo_url=$(prompt_default "Git repository" "https://github.com/NIAENGD/Lecture-Tools.git")
  install_dir=$(prompt_default "Application install directory" "/opt/lecture-tools")
  data_dir=$(prompt_default "Persistent data directory" "/var/lib/lecture-tools")
  project_name=$(prompt_default "Docker Compose project name" "lecturetools")
  http_port=$(prompt_default "Public HTTP port" "8000")
  if [[ ! $http_port =~ ^[0-9]+$ ]] || ((http_port < 1 || http_port > 65535)); then
    fatal "HTTP port must be a number between 1 and 65535."
  fi
  root_path=$(prompt_default "Application root path (leave blank for /)" "")
  if [[ $root_path == "/" ]]; then
    root_path=""
  elif [[ -n $root_path ]]; then
    [[ $root_path != /* ]] && root_path="/$root_path"
    root_path=${root_path%/}
  fi
  service_user=$(prompt_default "System user that will own the deployment" "lecturetools")
  git_branch=$(prompt_default "Git branch to track" "main")
  local enable_boot="no"
  if prompt_yes_no "Enable Lecture Tools to start automatically on boot?" "yes"; then
    enable_boot="yes"
  fi

  if [[ $install_dir == *" "* || $data_dir == *" "* ]]; then
    fatal "Installation and data directories must not contain spaces."
  fi
  if [[ ! $project_name =~ ^[a-zA-Z0-9_-]+$ ]]; then
    fatal "Project name may only include letters, numbers, underscores and hyphens."
  fi
  if [[ -z $service_user ]]; then
    fatal "Service user cannot be empty."
  fi
  if [[ ! $service_user =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    fatal "Service user must start with a letter or underscore and contain only lowercase letters, numbers, underscores or hyphens."
  fi
  if [[ -z $repo_url ]]; then
    fatal "Repository URL cannot be empty."
  fi
  if [[ -z $git_branch ]]; then
    fatal "Git branch cannot be empty."
  fi

  if [[ $install_dir == "/" || $data_dir == "/" ]]; then
    fatal "Installation or data directory cannot be the filesystem root."
  fi

  if [[ -d $install_dir && ! -d $install_dir/.git && -n $(ls -A "$install_dir" 2>/dev/null) ]]; then
    if prompt_yes_no "Directory $install_dir already exists and is not a git clone. Replace its contents?" "no"; then
      rm -rf "$install_dir"
    else
      fatal "Installation aborted by user."
    fi
  fi

  log "Preparing directories..."
  mkdir -p "$data_dir"

  log "Creating or updating service user..."
  create_service_user "$service_user"

  log "Cloning repository ($repo_url)..."
  if [[ -d $install_dir/.git ]]; then
    pushd "$install_dir" >/dev/null
    git remote set-url origin "$repo_url"
    git fetch --all --prune || fatal "Failed to fetch updates from $repo_url."
    git checkout "$git_branch" || fatal "Failed to checkout branch $git_branch."
    git reset --hard "origin/$git_branch" || fatal "Failed to reset to origin/$git_branch."
    popd >/dev/null
  else
    rm -rf "$install_dir"
    git clone --branch "$git_branch" "$repo_url" "$install_dir" >/dev/null || fatal "Failed to clone repository."
  fi

  log "Writing configuration files..."
  write_compose_override "$install_dir" "$data_dir" "$http_port" "$root_path"
  write_env_file "$install_dir" "$project_name"
  chown -R "$service_user":"$service_user" "$install_dir"
  chown -R "$service_user":"$service_user" "$data_dir"

  local compose_cmd
  if docker compose version >/dev/null 2>&1; then
    compose_cmd="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    compose_cmd="docker-compose"
  else
    fatal "Docker Compose is required but was not found."
  fi

  log "Creating systemd service..."
  write_systemd_unit "lecturetools.service" "$install_dir" "$compose_cmd" "$project_name" "$service_user"
  systemctl daemon-reload

  if [[ $enable_boot == "yes" ]]; then
    log "Enabling service at boot..."
    systemctl enable lecturetools.service
  fi

  log "Starting Lecture Tools..."
  systemctl start lecturetools.service
  systemctl status --no-pager lecturetools.service || true

  configure_firewall "$http_port"

  log "Persisting deployment metadata..."
  write_config /etc/lecturetool.conf \
    INSTALL_DIR "$install_dir" \
    DATA_DIR "$data_dir" \
    PROJECT_NAME "$project_name" \
    COMPOSE_CMD "$compose_cmd" \
    SERVICE_USER "$service_user" \
    HTTP_PORT "$http_port" \
    ROOT_PATH "$root_path" \
    SERVICE_UNIT "lecturetools.service" \
    DOCKER_INSTALLED "$docker_installed_by_script" \
    COMPOSE_PLUGIN_INSTALLED "$compose_installed_by_script" \
    GIT_BRANCH "$git_branch" \
    REPO_URL "$repo_url" \
    SELF_PATH "/usr/local/bin/lecturetool"
  chmod 600 /etc/lecturetool.conf

  log "Installing lecturetool management CLI..."
  write_cli_wrapper

  log "Installation complete. Use 'lecturetool -status' to check the service or run 'lecturetool' for usage details."
  log "Access Lecture Tools on port $http_port once the containers are ready."
}

main "$@"
