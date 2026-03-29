# Synology Deployment

This is the recommended deployment path for the current setup because Synology already hosts other containerized infrastructure.

## Goal

Run `home-ops-finance` as its own container in Synology Container Manager.

## Recommended Shape

- one container for `home-ops-finance`
- one dedicated host directory for live finance data
- one dedicated external port, separate from Pi-hole

Recommended host data path:

- `/volume1/docker/home-ops-finance/data`

Recommended exposed port:

- `4310`

## Docker Inputs In This Repo

- `Dockerfile`
- `deploy/docker-compose.synology.yml`
- `scripts/check-server-runtime.sh`

## Container Environment

- `HOME_OPS_FINANCE_HOST=0.0.0.0`
- `HOME_OPS_FINANCE_SERVER_MODE=1`
- `HOME_OPS_FINANCE_DATA_DIR=/data`
- `PORT=4310`

## Volume Mapping

Map the Synology host directory:

- `/volume1/docker/home-ops-finance/data`

to the container path:

- `/data`

## Network Access

Start with:

- internal LAN access only
- or Tailscale access to the Synology

Do not expose the app directly to the public internet first.

## Runtime Check

After the container starts, verify:

- `http://<synology-ip>:4310/api/runtime-info`
- app shell loads
- data writes land in the mounted `/volume1/docker/home-ops-finance/data` directory
