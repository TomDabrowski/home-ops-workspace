#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
LOG_FILE="${TMPDIR:-/tmp/}home-ops-finance-deploy.log"
LOCAL_DEPLOY_ENV="${ROOT}/.deploy.local.env"
SECURITY_BIN="$(command -v security || true)"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$1" | tee -a "$LOG_FILE"
}

read_keychain_password() {
  if [[ -z "${SECURITY_BIN}" ]]; then
    return 1
  fi

  "${SECURITY_BIN}" find-generic-password \
    -a "${DEPLOY_KEYCHAIN_ACCOUNT}" \
    -s "${DEPLOY_KEYCHAIN_SERVICE}" \
    -w 2>/dev/null
}

save_keychain_password() {
  local password="$1"

  if [[ -z "${SECURITY_BIN}" ]]; then
    return 1
  fi

  "${SECURITY_BIN}" add-generic-password \
    -U \
    -a "${DEPLOY_KEYCHAIN_ACCOUNT}" \
    -s "${DEPLOY_KEYCHAIN_SERVICE}" \
    -w "${password}" >/dev/null
}

prompt_native_password() {
  /usr/bin/osascript -l JavaScript <<'OSA'
ObjC.import('Cocoa');

function run() {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  const result = app.displayDialog("Synology sudo-Passwort fuer den Deploy eingeben:", {
    withTitle: "Home Ops Finance Deploy",
    defaultAnswer: "",
    hiddenAnswer: true,
    buttons: ["Abbrechen", "Deploy starten"],
    defaultButton: "Deploy starten",
    cancelButton: "Abbrechen"
  });
  const saveResult = app.displayDialog("Passwort im macOS Schluesselbund speichern?", {
    withTitle: "Home Ops Finance Deploy",
    buttons: ["Nein", "Ja"],
    defaultButton: "Ja",
    cancelButton: "Nein"
  });
  const password = result.textReturned;
  const save = saveResult.buttonReturned === "Ja" ? "1" : "0";
  return password + "\n" + save;
}
OSA
}

run_deploy() {
  local password="$1"

  DEPLOY_HOST="${DEPLOY_HOST}" \
    DEPLOY_USER="${DEPLOY_USER}" \
    DEPLOY_SSH_IDENTITY="${DEPLOY_SSH_IDENTITY}" \
    DEPLOY_REMOTE_SUDO_PASSWORD="${password}" \
    "${SCRIPT_DIR}/deploy-synology.sh" 2>&1 | tee -a "${LOG_FILE}"
}

if [[ ! -f "${LOCAL_DEPLOY_ENV}" ]]; then
  echo
  echo "Es fehlt ${LOCAL_DEPLOY_ENV}"
  echo "Lege die Datei anhand von .deploy.local.example.env an."
  echo
  read -r "?Mit Enter beenden"
  exit 1
fi

# shellcheck disable=SC1090
source "${LOCAL_DEPLOY_ENV}"

if [[ -z "${DEPLOY_HOST:-}" || -z "${DEPLOY_USER:-}" || -z "${DEPLOY_SSH_IDENTITY:-}" ]]; then
  echo
  echo "In ${LOCAL_DEPLOY_ENV} fehlen DEPLOY_HOST, DEPLOY_USER oder DEPLOY_SSH_IDENTITY."
  echo
  read -r "?Mit Enter beenden"
  exit 1
fi

DEPLOY_KEYCHAIN_SERVICE="${DEPLOY_KEYCHAIN_SERVICE:-Home Ops Finance Deploy}"
DEPLOY_KEYCHAIN_ACCOUNT="${DEPLOY_KEYCHAIN_ACCOUNT:-${DEPLOY_USER}@${DEPLOY_HOST}}"

cd "${ROOT}"
echo
echo "Home Ops Finance Deploy"
echo "Ziel: ${DEPLOY_USER}@${DEPLOY_HOST}"
echo

log "Deploy gestartet fuer ${DEPLOY_USER}@${DEPLOY_HOST}"
DEPLOY_REMOTE_SUDO_PASSWORD="$(read_keychain_password || true)"
SAVE_TO_KEYCHAIN=0

if [[ -n "${DEPLOY_REMOTE_SUDO_PASSWORD}" ]]; then
  echo "Verwende gespeichertes Passwort aus dem macOS Schluesselbund."
  echo
else
  PROMPT_RESULT="$(prompt_native_password || true)"
  if [[ -z "${PROMPT_RESULT}" ]]; then
    echo
    echo "Kein Passwort eingegeben. Deploy abgebrochen."
    echo
    read -r "?Mit Enter beenden"
    exit 1
  fi
  SAVE_TO_KEYCHAIN="${PROMPT_RESULT##*$'\n'}"
  DEPLOY_REMOTE_SUDO_PASSWORD="${PROMPT_RESULT%$'\n'*}"
fi

if run_deploy "${DEPLOY_REMOTE_SUDO_PASSWORD}"; then
  if [[ "${SAVE_TO_KEYCHAIN}" == "1" ]]; then
    save_keychain_password "${DEPLOY_REMOTE_SUDO_PASSWORD}" || true
  fi
  echo
  echo "Deploy erfolgreich abgeschlossen."
  echo
else
  if [[ -n "${DEPLOY_REMOTE_SUDO_PASSWORD}" && "${SAVE_TO_KEYCHAIN}" == "0" ]]; then
    echo
    echo "Deploy mit gespeichertem Passwort fehlgeschlagen. Bitte Passwort neu eingeben."
    echo
    PROMPT_RESULT="$(prompt_native_password || true)"
    if [[ -n "${PROMPT_RESULT}" ]]; then
      SAVE_TO_KEYCHAIN="${PROMPT_RESULT##*$'\n'}"
      DEPLOY_REMOTE_SUDO_PASSWORD="${PROMPT_RESULT%$'\n'*}"
      if run_deploy "${DEPLOY_REMOTE_SUDO_PASSWORD}"; then
        if [[ "${SAVE_TO_KEYCHAIN}" == "1" ]]; then
          save_keychain_password "${DEPLOY_REMOTE_SUDO_PASSWORD}" || true
        fi
        echo
        echo "Deploy erfolgreich abgeschlossen."
        echo
        read -r "?Mit Enter schliessen"
        exit 0
      fi
    fi
  fi
  echo
  echo "Deploy fehlgeschlagen."
  echo "Log: ${LOG_FILE}"
  echo
  read -r "?Mit Enter beenden"
  exit 1
fi

read -r "?Mit Enter schliessen"
