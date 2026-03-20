# Home Ops Mail Sorter

Conservative multi-account IMAP spam cleaner for a home NAS or always-on server.

## Current Direction

- Read messages from one or more IMAP inboxes in read-only mode.
- Score messages conservatively and report likely spam candidates.
- Start in `dry-run` with audit output only.
- Keep scheduler, locking, state, and retention solid before enabling live mail moves.

## Current Project Files

- `data/sample-mails.json`: tracked starter messages for local development
- `data/sample-eml/`: starter `.eml` exports for import-path testing
- `data/sample-export.mbox`: starter `.mbox` export for batch-import testing
- `data/accounts.example.json`: example multi-account IMAP config for scheduled or NAS runs
- `data/mailbox-config.json`: category-to-action and folder defaults
- `docs/synology.md`: first Synology and Docker deployment notes
- `src/account-state.ts`: keeps recurring IMAP runs from re-reporting the same message every time
- `src/types.ts`: shared mail, suggestion, and report types
- `src/classifier.ts`: first scoring-based category classifier
- `src/mail-loader.ts`: loads JSON samples, `.eml`, `.mbox`, or `.eml` folders
- `src/imap-source.ts`: read-only IMAP source for scheduled account runs
- `src/account-runner.ts`: multi-account runner that writes reports per account
- `src/ops-runner.ts`: scheduled run wrapper with snapshot retention for account reports
- `src/report.ts`: terminal-friendly suggestion rendering
- `src/cli.ts`: local entry point for classifying sample data
- `tests/classifier.test.ts`: baseline behavior coverage
- `tests/account-runner.test.ts`: coverage for account-run helper logic
- `tests/account-state.test.ts`: coverage for processed-message state helpers
- `tests/ops-runner.test.ts`: coverage for snapshot and retention helpers

## Local Commands

```bash
npm install
npm run typecheck
npm test
npm run suggest
npm run suggest -- data/sample-mails.json
npm run suggest -- data/sample-eml
npm run suggest -- data/sample-export.mbox
npm run suggest -- data/sample-eml --format json
npm run suggest -- data/sample-mails.json --category marketing --only-ready
npm run suggest:accounts -- data/accounts.example.json
npm run validate:accounts -- data/accounts.example.json
npm run run:scheduled -- data/accounts.example.json
docker build -t home-ops-mail-sorter .
```

`suggest` now accepts a `.json` file, a single `.eml` file, a `.mbox` export, or a directory full of `.eml` files.
Use `--format json` for machine-readable output on `stdout`.
Use `--category <name>` or `--only-ready` to narrow the report to actionable subsets.
Use `--output <path>` to save the report for later tooling or UI consumption.
The suggestion report also flags whether each message is already safe enough for future automation based on confidence and mailbox config.

## NAS / Scheduled Run

- Copy `data/accounts.example.json` to `data/accounts.json` or `data/accounts.local.json`.
- Keep real passwords out of files and provide them through env vars such as `MAIL_SORTER_PERSONAL_PASSWORD`.
- Run `npm run validate:accounts -- data/accounts.json` before enabling a scheduled task.
- Run `npm run suggest:accounts -- data/accounts.json` from a NAS scheduler, cron job, systemd timer, or container task.
- Or run `npm run run:scheduled -- data/accounts.json` to also keep timestamped report snapshots with retention.
- The current account runner uses read-only IMAP access and suggestion-only behavior.
- It also persists a processed-message state file so scheduled runs can skip already reported messages.
- For each configured account it writes `report.txt` and `report.json` into the configured reports directory.
- The scheduled wrapper also stores account report snapshots under `reports/accounts/_history/` and prunes older ones.
- Scheduled runs now also use a simple lock file and a JSON run log, so overlapping starts and failures are easier to spot.
- Scheduled runs also write `latest-summary.json` and `latest-summary.txt` for a quick cross-account overview.
- Automatic mail moves are intentionally not enabled yet. The current focus is a safe spam-cleaner dry-run.
- See [docs/synology.md](docs/synology.md) for a first Docker and Synology setup path.

## Next Steps

- Replace the generic category classifier with a tighter spam-scoring model.
- Add allowlist / never-trash protections for important senders and domains.
- Introduce optional IMAP move-to-trash actions only after the dry-run path is stable in real use.
