# Home Ops Watcher

Home lab watcher for services, devices, and internet-facing health checks.

This project is the first real consumer of the shared private `home-ops-framework` package.

## MVP

- Check reachability for core devices and services.
- Track simple uptime history.
- Surface service problems in one view.
- Alert only on real failures, not noise.

## Current Implementation

- Uses `@home-ops/framework` through a local file dependency.
- Reads targets from `config.local.json`.
- Stores check history in the private data directory as `watch-history.json`.
- Supports HTTP and TCP reachability checks.
- Exposes a tiny local status UI and JSON API.

## Setup

```bash
npm install
cp config.local.example.json config.local.json
npm run check
npm start
```

Open:

```text
http://127.0.0.1:4320
```

The default private data path is `data/` inside the project. For real use, set `dataDir` in `config.local.json` or `HOME_OPS_WATCHER_DATA_DIR` to a private external path.

## API

```text
GET  /api/status
POST /api/checks/run
GET  /api/history
```

## Next Steps

- Add the first real local device/service targets in private `config.local.json`.
- Add stale-history detection so a target can be marked warn when it has not been checked recently.
- Add a notification channel only after the status model is stable.
- Add optional local advisor summary via Ollama once deterministic status data is useful.
