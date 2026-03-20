# Status

## Current Phase

Foundation MVP

## Status Summary

- Project folder created.
- Initial scope and MVP captured.
- Local TypeScript scaffold added.
- First sample-driven classifier and CLI added in suggestion-only mode.
- Baseline tests cover category and action suggestions.
- Action folders are configurable through tracked mailbox defaults.
- CLI can now read JSON samples, single `.eml` files, and `.eml` export folders.
- Suggestion reports now expose category summaries and optional JSON output.
- The loader can now ingest `.mbox` batch exports in addition to `.eml` and JSON inputs.
- Suggestion reports now distinguish between `review-first` and `ready` automation candidates.
- The CLI can now filter reports down to one category or only automation-ready candidates.
- The CLI can now also persist rendered reports to an output file for later automation or UI use.
- The project now has a first read-only IMAP multi-account runner intended for NAS or scheduled home-network use.
- Scheduled account runs now maintain a processed-message state so the same IMAP message is not reported every run.
- Account configs can now be validated up front before enabling a scheduled run.
- The project now includes a first Dockerfile and Synology-oriented deployment notes for NAS use.
- Scheduled account runs can now create retained report snapshots for operational history.
- Scheduled account runs now also write a run log and use a simple lock file to avoid overlaps.
- Scheduled account runs now generate a compact latest summary across all accounts.
- The active code path has been trimmed back to a spam-cleaner-oriented dry-run foundation without browser review UI.

## Immediate Next Step

Replace the generic sorter heuristics with a tighter spam-focused scoring and protection model.

## Notes

- Keep commits small and milestone-based.
- Update this file whenever scope or progress changes.
- Delay IMAP until the local sample workflow feels right.
- Keep the rollout conservative until allowlists and move-to-trash protections exist.
