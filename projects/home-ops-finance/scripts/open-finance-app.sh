#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:4310"
PORT="4310"
LOG_FILE="${TMPDIR:-/tmp}home-ops-finance-launch.log"

cd "$ROOT"

if ! command -v lsof >/dev/null 2>&1; then
  echo "Missing required command: lsof" >&2
  exit 1
fi

if ! lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  if [ ! -d node_modules ]; then
    npm install >>"$LOG_FILE" 2>&1
  fi

  nohup npm run serve:app >>"$LOG_FILE" 2>&1 &

  for _ in {1..30}; do
    if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

open "$URL"
