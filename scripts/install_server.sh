#!/usr/bin/env bash
set -euo pipefail

cat <<'MSG'
This project now ships a Docker-first server deployment.

The previous bare-metal installer has been removed.
Use docker compose as documented in the README:
  docker compose up -d

The start.sh/start.bat helpers continue to provide the direct setup for personal machines.
MSG

