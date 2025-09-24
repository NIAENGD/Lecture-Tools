#!/usr/bin/env bash

set -euo pipefail

REPO_URL=${LECTURE_TOOLS_REPO:-"https://github.com/NIAENGD/Lecture-Tools.git"}
INSTALL_DIR=${LECTURE_TOOLS_INSTALL_DIR:-"${HOME}/lecture-tools"}
PROJECT_NAME=${LECTURE_TOOLS_PROJECT_NAME:-"lecture-tools"}

log() {
  printf "[lecture-tools] %s\n" "$*"
}

fatal() {
  printf "[lecture-tools] error: %s\n" "$*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fatal "Required command '$1' is not available in PATH."
  fi
}

log "Checking prerequisites..."
require_cmd git
require_cmd docker

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  fatal "Docker Compose plugin is required. Please install Docker Compose v2."
fi

WORKDIR=$(mktemp -d)
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

log "Cloning ${REPO_URL}..."
git clone --depth=1 "$REPO_URL" "$WORKDIR/repo" >/dev/null 2>&1 || fatal "Failed to clone repository."

log "Preparing installation directory at ${INSTALL_DIR}..."
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -a "$WORKDIR/repo/." "$INSTALL_DIR/"
rm -rf "$INSTALL_DIR/.git"

log "Ensuring persistent storage directories exist..."
mkdir -p "$INSTALL_DIR/storage" "$INSTALL_DIR/assets"

pushd "$INSTALL_DIR" >/dev/null || fatal "Unable to enter ${INSTALL_DIR}."

log "Pulling container dependencies..."
"${COMPOSE_CMD[@]}" pull || fatal "Docker compose pull failed."

log "Starting ${PROJECT_NAME} stack..."
"${COMPOSE_CMD[@]}" up -d --build || fatal "Docker compose up failed."

popd >/dev/null || true

log "Installation complete!"
log "The service will be reachable on http://localhost:8000 once the container is ready."
log "To update in the future, re-run this script; it will fetch the latest version and restart the stack."
