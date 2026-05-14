# Home Ops Backup Control

Backup verification tool for NAS and local backup jobs. This is the second small consumer of
`@home-ops/framework` after Home Ops Watcher: it reuses local config resolution, validated JSON
state, server helpers, and the same "local first" shape.

## What It Does

- Tracks configured backup jobs and their expected maximum age.
- Stores backup run records locally in `data/backup-runs.json`.
- Flags jobs as `ok`, `warn`, or `failed`.
- Ignores disabled jobs with `enabled: false`.
- Exposes a tiny local JSON UI and API for dashboards or scripts.

## Setup

```bash
npm install
cp config.local.example.json config.local.json
npm run check
npm start
```

The default server is `http://127.0.0.1:4321`. You can override the server with
`HOME_OPS_BACKUP_PORT` and `HOME_OPS_BACKUP_HOST`.

## API

- `GET /api/status` returns the current backup health report.
- `GET /api/runs` returns stored run records.
- `POST /api/runs` records a run for a configured job.

Example:

```bash
curl -X POST http://127.0.0.1:4321/api/runs \
  -H 'content-type: application/json' \
  -d '{"jobId":"documents","completedAt":"2026-05-14T18:00","status":"success","note":"Manual check"}'
```

## CLI

```bash
npm run backup -- status
npm run backup -- runs
npm run record -- --job documents-backup --status success --note "Manual check"
```

The CLI uses the same local config and JSON state as the server, so backup scripts can record a
successful or failed run without calling the HTTP API.

## Next Steps

- Add the real local backup jobs in `config.local.json`.
- Add optional target probes for mounted volumes or backup marker files.
- Wire the report into Home Ops Watcher once both APIs settle.
