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
DEPLOY_SSH_IDENTITY="${DEPLOY_SSH_IDENTITY:-}"

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
SSH_ARGS=(-o BatchMode=yes)

if [[ -n "${DEPLOY_SSH_IDENTITY}" ]]; then
  SSH_ARGS+=(-i "${DEPLOY_SSH_IDENTITY}" -o IdentitiesOnly=yes)
fi

echo "Syncing project files to ${SSH_TARGET}:${DEPLOY_APP_DIR} ..."
ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "mkdir -p '${DEPLOY_APP_DIR}' '${DEPLOY_DATA_DIR}'"

ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "find '${DEPLOY_APP_DIR}' -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +"

COPYFILE_DISABLE=1 tar \
  --no-mac-metadata \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='config.local.json' \
  --exclude='.DS_Store' \
  -C "${PROJECT_ROOT}" \
  -cf - . | ssh "${SSH_ARGS[@]}" "${SSH_TARGET}" "tar -xf - -C '${DEPLOY_APP_DIR}'"

echo "Building image and restarting container on ${SSH_TARGET} ..."
ssh -tt "${SSH_ARGS[@]}" "${SSH_TARGET}" \
  "set -euo pipefail; \
   docker_bin=''; \
   for candidate in \"\$(command -v docker 2>/dev/null || true)\" /usr/local/bin/docker /var/packages/ContainerManager/target/usr/bin/docker; do \
     if [ -n \"\${candidate}\" ] && [ -x \"\${candidate}\" ]; then docker_bin=\"\${candidate}\"; break; fi; \
   done; \
   if [ -z \"\${docker_bin}\" ]; then echo 'Could not find docker binary on Synology.' >&2; exit 1; fi; \
   sudo \"\${docker_bin}\" build --network host -t '${DEPLOY_IMAGE_TAG}' '${DEPLOY_APP_DIR}'; \
   if sudo \"\${docker_bin}\" ps -a --format '{{.Names}}' | grep -Fxq '${DEPLOY_CONTAINER_NAME}'; then \
     sudo \"\${docker_bin}\" rm -f '${DEPLOY_CONTAINER_NAME}'; \
   fi; \
   sudo \"\${docker_bin}\" run -d \
     --name '${DEPLOY_CONTAINER_NAME}' \
     -p '${DEPLOY_PORT}:${DEPLOY_PORT}' \
     -e HOME_OPS_FINANCE_HOST=0.0.0.0 \
     -e HOME_OPS_FINANCE_SERVER_MODE=1 \
     -e HOME_OPS_FINANCE_DATA_DIR=/data \
     -e PORT='${DEPLOY_PORT}' \
     -v '${DEPLOY_DATA_DIR}:/data' \
     '${DEPLOY_IMAGE_TAG}' >/dev/null; \
   sudo \"\${docker_bin}\" ps --filter 'name=${DEPLOY_CONTAINER_NAME}'"

echo
echo "Deployment finished."
echo "App URL: http://${DEPLOY_HOST}:${DEPLOY_PORT}/"
echo "Runtime info: http://${DEPLOY_HOST}:${DEPLOY_PORT}/api/runtime-info"
