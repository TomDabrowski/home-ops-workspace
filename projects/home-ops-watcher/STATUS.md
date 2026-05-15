# Status

## Current Phase

First MVP

## Status Summary

- Project folder created.
- Initial scope and MVP captured.
- First implementation added.
- The project now consumes `@home-ops/framework` via a local file dependency.
- HTTP, TCP, and JSON status checks are implemented.
- Missing or stale target checks are surfaced as `warn`.
- JSON webhook notifications are available for `warn` or `down` reports.
- Validated JSON history persistence is implemented.
- A compact local server UI exposes summary tiles, target cards, JSON details, and the API routes.
- Typecheck and tests pass.

## Immediate Next Step

Add real private targets in `config.local.json`, including Backup Control via `/api/status`, and run the watcher locally.

## Notes

- Keep commits small and milestone-based.
- Update this file whenever scope or progress changes.
- Do not commit real LAN IPs, hostnames, or private monitoring targets.
