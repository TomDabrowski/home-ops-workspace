# Pi Deployment

This is the recommended first “same app everywhere” deployment path.

## Goal

Run the existing `home-ops-finance` app on a Raspberry Pi without changing the finance logic.

The Pi owns:

- the running app server
- the private network entry point

An external private data directory owns:

- finance JSON state
- reviewed artifacts
- activity logs

## Recommended Shape

### App Host

- Raspberry Pi
- Node.js installed
- repo checkout available locally

### Data Source

Use one private directory as the live data source via:

- `HOME_OPS_FINANCE_DATA_DIR=/path/to/private/home-ops-finance/data`

This can be:

- a local Pi directory
- a Synology-mounted directory

Avoid using iCloud as the live server-side data source for the Pi.

## Start Command

```bash
cd /path/to/finance/projects/home-ops-finance
HOME_OPS_FINANCE_DATA_DIR=/srv/home-ops-finance/data \
HOME_OPS_FINANCE_HOST=0.0.0.0 \
HOME_OPS_FINANCE_SERVER_MODE=1 \
PORT=4310 \
npm run serve:app
```

Equivalent shortcut:

```bash
npm run serve:app:server
```

If you use the shortcut, still provide `HOME_OPS_FINANCE_DATA_DIR` from the shell or service definition.

## Network Access

Recommended first:

- keep the service private
- reach it through Tailscale

Avoid exposing the service directly to the public internet as the first deployment step.

## Useful Runtime Checks

- `GET /api/runtime-info`
- app page loads under the chosen host and port
- activity log updates in the configured data directory
- `scripts/check-server-runtime.sh`

## systemd Direction

Use a service file based on `deploy/home-ops-finance.service.example`.

This keeps:

- restart policy
- working directory
- environment variables
- server mode

outside the finance logic itself.

## Example Files

- `config.server.example.json`
- `deploy/home-ops-finance.service.example`
- `scripts/check-server-runtime.sh`
