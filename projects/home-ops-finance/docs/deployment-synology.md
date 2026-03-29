# Synology Deployment

This is the recommended deployment path for the current setup because Synology already hosts other containerized infrastructure.

## Goal

Run `home-ops-finance` as its own container in Synology Container Manager.

The repo stays the single source of truth for code. Synology is only the deployment target plus the live data directory.

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
- `scripts/deploy-synology.sh`
- `scripts/check-server-runtime.sh`

## Recommended Deploy Flow

Prefer the repo-driven deploy script over manual file copying or Synology's project build UI.

1. develop and commit locally in the Git repo
2. sync code to Synology with `scripts/deploy-synology.sh`
3. let the script build via `docker build --network host`
4. let the script restart the `home-ops-finance` container against the stable live data directory

Example:

```bash
cd /path/to/finance/projects/home-ops-finance
DEPLOY_USER=tom DEPLOY_HOST=192.168.178.74 npm run deploy:synology
```

For macOS there is also a one-click deploy path:

1. copy `.deploy.local.example.env` to `.deploy.local.env`
2. fill in the Synology SSH target and SSH identity path
3. run `scripts/install-deploy-launcher.sh` once
4. use `Home Ops Finance Deploy.app` from `~/Applications`

The macOS launcher asks only for the Synology sudo password and then runs the same repo-based deploy flow without opening a terminal.

This keeps a clear split:

- repo checkout: code
- `/volume1/docker/home-ops-finance/data`: live finance JSON

## Why Not Use The Synology Build UI?

The current Synology project build path proved brittle for this app:

- uploaded compose files did not include the full build context
- Docker DNS in the Synology UI build path was flaky, while `docker build --network host` worked reliably

Use the Synology UI for visibility if you want, but use the repo-driven deploy script as the primary deployment path.

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
