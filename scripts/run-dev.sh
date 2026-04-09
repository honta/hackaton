#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COREPACK_HOME="${COREPACK_HOME:-/tmp/corepack}"
PNPM_CMD=(corepack pnpm)
EXT_PID=""

cd "$ROOT_DIR"

log() {
  printf '[dev] %s\n' "$1"
}

cleanup() {
  local exit_code=$?

  if [[ -n "$EXT_PID" ]] && kill -0 "$EXT_PID" 2>/dev/null; then
    kill "$EXT_PID" 2>/dev/null || true
  fi

  wait "$EXT_PID" 2>/dev/null || true

  exit "$exit_code"
}

trap cleanup INT TERM EXIT

if [[ ! -d "node_modules/.pnpm" ]]; then
  log "Dependencies not found. Running pnpm install..."
  COREPACK_HOME="$COREPACK_HOME" "${PNPM_CMD[@]}" install
fi

log "Starting extension build watcher..."
COREPACK_HOME="$COREPACK_HOME" "${PNPM_CMD[@]}" --filter extension build --watch &
EXT_PID=$!

log "Waiting for extension/dist/manifest.json..."
for _ in $(seq 1 60); do
  if [[ -f "extension/dist/manifest.json" ]]; then
    break
  fi
  sleep 1
done

if [[ ! -f "extension/dist/manifest.json" ]]; then
  log "Timed out waiting for extension build output."
  exit 1
fi

cat <<'EOF'

Strava Elevate dev environment is running.

Next steps:
  1. Open chrome://extensions
  2. Enable Developer mode
  3. Click Load unpacked
  4. Select extension/dist
  5. Open https://www.strava.com/dashboard

Keep this terminal open. Press Ctrl+C to stop the extension watcher.
EOF

wait "$EXT_PID"
