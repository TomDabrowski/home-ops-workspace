#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:4310"
PORT="4310"
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
LOG_FILE="${TMPDIR:-/tmp/}home-ops-finance-launch.log"

cd "$ROOT"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$1" >>"$LOG_FILE"
}

notify() {
  /usr/bin/osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

show_error() {
  local message="$1"
  /usr/bin/osascript <<OSA >/dev/null 2>&1 || true
display dialog "${message}" buttons {"OK"} default button "OK" with title "Home Ops Finance"
OSA
}

find_command() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi

  return 1
}

LSOF_BIN="$(find_command lsof || true)"
NPM_BIN="$(find_command npm || true)"
OPEN_BIN="$(find_command open || true)"

if [ -z "$LSOF_BIN" ]; then
  log "Fehlt: lsof"
  show_error "Home Ops Finance konnte nicht starten, weil 'lsof' nicht gefunden wurde.\n\nLog: ${LOG_FILE}"
  exit 1
fi

if [ -z "$NPM_BIN" ]; then
  log "Fehlt: npm"
  show_error "Home Ops Finance konnte nicht starten, weil 'npm' nicht gefunden wurde.\n\nLog: ${LOG_FILE}"
  exit 1
fi

if [ -z "$OPEN_BIN" ]; then
  log "Fehlt: open"
  show_error "Home Ops Finance konnte den Browser nicht öffnen, weil 'open' nicht gefunden wurde.\n\nLog: ${LOG_FILE}"
  exit 1
fi

log "Launcher gestartet in ${ROOT}"

if ! "$LSOF_BIN" -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  notify "Home Ops Finance" "Server wird gestartet..."
  log "Server noch nicht aktiv auf Port ${PORT}"

  if [ ! -d node_modules ]; then
    log "node_modules fehlt, starte npm install"
    if ! "$NPM_BIN" install >>"$LOG_FILE" 2>&1; then
      log "npm install fehlgeschlagen"
      show_error "Home Ops Finance konnte Abhängigkeiten nicht installieren.\n\nLog: ${LOG_FILE}"
      exit 1
    fi
  fi

  log "Starte App-Server"
  nohup "$NPM_BIN" run serve:app >>"$LOG_FILE" 2>&1 &

  for _ in {1..30}; do
    if "$LSOF_BIN" -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      log "Server erfolgreich gestartet"
      break
    fi
    sleep 1
  done
fi

if ! "$LSOF_BIN" -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  log "Server antwortet nach Wartezeit nicht"
  show_error "Home Ops Finance konnte den lokalen Server nicht starten.\n\nLog: ${LOG_FILE}"
  exit 1
fi

log "Öffne Browser auf ${URL}"
"$OPEN_BIN" "$URL"
