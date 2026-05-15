#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

BACKUP_DIR="$ROOT_DIR/projects/home-ops-backup-control"
WATCHER_DIR="$ROOT_DIR/projects/home-ops-watcher"

usage() {
  cat <<'USAGE'
Usage: scripts/home-ops-local.sh <start|stop|restart|status|check>

Runs Home Ops Backup Control and Home Ops Watcher locally in the background.
Logs and PID files are written to each app's ignored data/ directory.
USAGE
}

app_pid_file() {
  local app_dir="$1"
  printf '%s/data/server.pid' "$app_dir"
}

app_log_file() {
  local app_dir="$1"
  printf '%s/data/server.log' "$app_dir"
}

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

start_app() {
  local name="$1"
  local app_dir="$2"
  local pid_file log_file
  pid_file="$(app_pid_file "$app_dir")"
  log_file="$(app_log_file "$app_dir")"
  mkdir -p "$app_dir/data"

  if is_running "$pid_file"; then
    echo "$name already running: pid $(cat "$pid_file")"
    return
  fi

  (
    cd "$app_dir"
    nohup "$NODE_BIN" --experimental-strip-types src/server.ts > "$log_file" 2>&1 &
    echo "$!" > "$pid_file"
  )
  echo "started $name: pid $(cat "$pid_file")"
}

stop_app() {
  local name="$1"
  local app_dir="$2"
  local pid_file
  pid_file="$(app_pid_file "$app_dir")"

  if ! is_running "$pid_file"; then
    rm -f "$pid_file"
    echo "$name not running"
    return
  fi

  kill "$(cat "$pid_file")"
  rm -f "$pid_file"
  echo "stopped $name"
}

status_app() {
  local name="$1"
  local app_dir="$2"
  local port="$3"
  local pid_file
  pid_file="$(app_pid_file "$app_dir")"

  if is_running "$pid_file"; then
    echo "$name running: pid $(cat "$pid_file")"
  else
    echo "$name stopped"
  fi

  if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/status" >/dev/null; then
    echo "$name api ok: http://127.0.0.1:$port"
  else
    echo "$name api not reachable: http://127.0.0.1:$port"
  fi
}

check_integration() {
  curl -fsS --max-time 3 "http://127.0.0.1:4321/api/status" >/dev/null
  curl -fsS --max-time 3 -X POST "http://127.0.0.1:4320/api/checks/run"
}

command="${1:-}"
case "$command" in
  start)
    start_app "backup-control" "$BACKUP_DIR"
    start_app "watcher" "$WATCHER_DIR"
    ;;
  stop)
    stop_app "watcher" "$WATCHER_DIR"
    stop_app "backup-control" "$BACKUP_DIR"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    status_app "backup-control" "$BACKUP_DIR" 4321
    status_app "watcher" "$WATCHER_DIR" 4320
    ;;
  check)
    check_integration
    ;;
  *)
    usage
    exit 2
    ;;
esac
