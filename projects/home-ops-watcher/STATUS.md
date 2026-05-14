# Status

## Current Phase

First MVP

## Status Summary

- Project folder created.
- Initial scope and MVP captured.
- First implementation added.
- The project now consumes `@home-ops/framework` via a local file dependency.
- HTTP and TCP checks are implemented.
- Validated JSON history persistence is implemented.
- A tiny local server exposes `/`, `/api/status`, `/api/checks/run`, and `/api/history`.
- Typecheck and tests pass.

## Immediate Next Step

Add real private targets in `config.local.json` and run the watcher locally.

## Notes

- Keep commits small and milestone-based.
- Update this file whenever scope or progress changes.
- Do not commit real LAN IPs, hostnames, or private monitoring targets.
