#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-}"
DEPLOY_TARGET_ROOT="${DEPLOY_TARGET_ROOT:-/volume1/docker/home-ops-finance}"
DEPLOY_APP_DIR="${DEPLOY_APP_DIR:-${DEPLOY_TARGET_ROOT}/app}"
DEPLOY_DATA_DIR="${DEPLOY_DATA_DIR:-${DEPLOY_TARGET_ROOT}/data}"
DEPLOY_PORT="${DEPLOY_PORT:-4310}"
DEPLOY_CONTAINER_NAME="${DEPLOY_CONTAINER_NAME:-home-ops-finance}"
DEPLOY_IMAGE_TAG="${DEPLOY_IMAGE_TAG:-home-ops-finance:synology}"

if [[ -z "${DEPLOY_HOST}" || -z "${DEPLOY_USER}" ]]; then
  cat <<'EOF' >&2
Missing deployment target.

Set at least:
  DEPLOY_HOST=192.168.178.74
  DEPLOY_USER=tom

Optional overrides:
  DEPLOY_TARGET_ROOT=/volume1/docker/home-ops-finance
  DEPLOY_PORT=4310
  DEPLOY_CONTAINER_NAME=home-ops-finance
  DEPLOY_IMAGE_TAG=home-ops-finance:synology
EOF
  exit 1
fi

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

echo "Syncing project files to ${SSH_TARGET}:${DEPLOY_APP_DIR} ..."
ssh "${SSH_TARGET}" "mkdir -p '${DEPLOY_APP_DIR}' '${DEPLOY_DATA_DIR}'"

rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'data/' \
  --exclude 'config.local.json' \
  --exclude '.DS_Store' \
  "${PROJECT_ROOT}/" "${SSH_TARGET}:${DEPLOY_APP_DIR}/"

echo "Building image and restarting container on ${SSH_TARGET} ..."
ssh "${SSH_TARGET}" \
  "set -euo pipefail; \
   sudo docker build --network host -t '${DEPLOY_IMAGE_TAG}' '${DEPLOY_APP_DIR}'; \
   if sudo docker ps -a --format '{{.Names}}' | grep -Fxq '${DEPLOY_CONTAINER_NAME}'; then \
     sudo docker rm -f '${DEPLOY_CONTAINER_NAME}'; \
   fi; \
   sudo docker run -d \
     --name '${DEPLOY_CONTAINER_NAME}' \
     -p '${DEPLOY_PORT}:${DEPLOY_PORT}' \
     -e HOME_OPS_FINANCE_HOST=0.0.0.0 \
     -e HOME_OPS_FINANCE_SERVER_MODE=1 \
     -e HOME_OPS_FINANCE_DATA_DIR=/data \
     -e PORT='${DEPLOY_PORT}' \
     -v '${DEPLOY_DATA_DIR}:/data' \
     '${DEPLOY_IMAGE_TAG}' >/dev/null; \
   sudo docker ps --filter 'name=${DEPLOY_CONTAINER_NAME}'"

echo
echo "Deployment finished."
echo "App URL: http://${DEPLOY_HOST}:${DEPLOY_PORT}/"
echo "Runtime info: http://${DEPLOY_HOST}:${DEPLOY_PORT}/api/runtime-info"
