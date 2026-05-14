# Status

## Current Phase

MVP implemented

## Status Summary

- Local config, JSON state, report calculation, CLI, server API, and tiny status UI are implemented.
- The app consumes shared helpers from `@home-ops/framework`.
- Tests cover validation and stale/failed/disabled backup report behavior.

## Immediate Next Step

Configure the first real backup jobs in `config.local.json` and decide how each job will record a run.

## Notes

- Default local server: `http://127.0.0.1:4321`.
- API endpoints: `GET /api/status`, `GET /api/runs`, `POST /api/runs`.
- CLI commands: `status`, `runs`, `record`.
- Good next integration point: Home Ops Watcher can call `/api/status` and show backup health beside service health.
