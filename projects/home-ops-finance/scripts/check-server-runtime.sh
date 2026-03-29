#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4310}"
HOST="${HOME_OPS_FINANCE_HOST:-127.0.0.1}"

if [ "$HOST" = "0.0.0.0" ]; then
  URL="http://127.0.0.1:${PORT}/api/runtime-info"
else
  URL="http://${HOST}:${PORT}/api/runtime-info"
fi

echo "Runtime check for ${URL}"
curl -fsS "$URL"
