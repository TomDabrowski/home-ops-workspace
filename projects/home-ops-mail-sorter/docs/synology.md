# Synology / NAS Run

This project can already run in a safe read-only mode on a NAS or any always-on home server.

## Current Safety Profile

- IMAP access is read-only.
- The runner only creates suggestions and reports.
- No messages are moved, deleted, or modified.
- Repeated runs skip already reported messages through `data/account-state.json`.

## Files You Need

- `data/accounts.example.json`: copy this to `data/accounts.json`
- `data/mailbox-config.json`: default category-to-action mapping
- `.env.example`: copy values into your container or scheduler environment

## Local Dry Run

```bash
npm install
cp data/accounts.example.json data/accounts.json
export MAIL_SORTER_PERSONAL_PASSWORD="your-password"
npm run validate:accounts -- data/accounts.json
npm run run:scheduled -- data/accounts.json
```

Reports are written per account to `reports/accounts/<account-id>/`.

## Docker Build

```bash
docker build -t home-ops-mail-sorter .
```

## Docker Run

```bash
docker run --rm \
  --env-file .env \
  -v "$PWD/data:/app/data" \
  -v "$PWD/reports:/app/reports" \
  home-ops-mail-sorter
```

This container command defaults to:

```bash
npm run run:scheduled -- data/accounts.json
```

## Synology Container Manager

1. Build the image on another machine or from Synology if available.
2. Mount a persistent project folder into `/app/data` and `/app/reports`.
3. Provide env vars like `MAIL_SORTER_PERSONAL_PASSWORD`.
4. Start with `npm run validate:accounts -- data/accounts.json`.
5. Then schedule `npm run run:scheduled -- data/accounts.json`.

## Recommended Volume Layout

- `/volume1/docker/mail-sorter/data` -> `/app/data`
- `/volume1/docker/mail-sorter/reports` -> `/app/reports`

Keep `accounts.json` and `account-state.json` inside the mounted `data` folder so state survives container restarts.
Snapshot history is written under the mounted `reports/accounts/_history` directory.
The scheduler lock file and run log live under `reports/accounts/.run.lock` and `reports/accounts/run-log.json` by default.
The latest cross-account summary is written to `reports/accounts/latest-summary.json` and `reports/accounts/latest-summary.txt`.

## Scheduler Idea

- Frequency: every 10 to 15 minutes
- First phase: dry-run with audit reports only
- Later phase: optional move-to-trash for very high-confidence spam only, after allowlists and protections are in place
