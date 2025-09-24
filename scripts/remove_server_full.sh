#!/usr/bin/env bash
set -euo pipefail

cat <<'MSG' >&2
Docker deployments are removed with:
  docker compose down

Delete the storage/ and assets/ directories manually if you also want
to discard persistent lecture data.
MSG

