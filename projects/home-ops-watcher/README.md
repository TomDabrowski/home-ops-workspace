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
- Supports HTTP, TCP, and JSON status checks for local Home Ops apps.
- Marks targets as `warn` when no check has been recorded or when `staleAfterHours` is exceeded.
- Exposes a compact local status UI with summary tiles, target cards, and JSON details.

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

The start page shows the current overall status, counts for `ok` / `warn` / `down`, and one card per
configured target. Use "Checks starten" to run checks and persist the latest results into history.

The default private data path is `data/` inside the project. For real use, set `dataDir` in `config.local.json` or `HOME_OPS_WATCHER_DATA_DIR` to a private external path.

## API

```text
GET  /api/status
POST /api/checks/run
GET  /api/history
```

## JSON Status Targets

Use `kind: "json-status"` for local apps that expose a status payload. By default Watcher reads
`summary.status` and maps `ok` to `ok`, `warn` to `warn`, and `failed` to `down`.

```json
{
  "id": "backup-control",
  "label": "Backup Control",
  "kind": "json-status",
  "url": "http://127.0.0.1:4321/api/status"
}
```

Add `staleAfterHours` to any target that should become `warn` when checks stop running.

## Next Steps

- Add the first real local device/service targets in private `config.local.json`.
- Add a notification channel only after the status model is stable.
- Add optional local advisor summary via Ollama once deterministic status data is useful.
