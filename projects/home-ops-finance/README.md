# Home Ops Finance

Local-first finance tracker for migrating spreadsheet-based planning into a more structured app in small, safe steps.

This project is designed to keep private source data outside the repository while still allowing the app, importer, and review workflow to be developed in public.

## Preview

Illustrative preview with sanitized example values:

![Home Ops Finance overview preview](docs/assets/overview-preview.svg)

![Home Ops Finance month review preview](docs/assets/month-review-preview.svg)

## Current Direction

The current spreadsheet already combines income, expenses, asset tracking, and monthly rollups. The app should keep that same mental model and move it into a cleaner system instead of forcing a completely different workflow.

## MVP

- Track accounts, assets, income, and expenses.
- Separate fixed and variable monthly costs.
- Show monthly cashflow, savings rate, and net worth.
- Provide a simple 3 to 12 month forecast.

## What Is In The Repo

- TypeScript source for the importer, planning engine, local app server, and browser UI
- sanitized example data for development
- documentation for the workbook migration and target data model
- local-only configuration examples for external private data

## What Is Not In The Repo

- real spreadsheets
- real generated finance reports
- real account data
- local secrets or credentials

## Current Project Files

- `docs/data-model.md`: first draft of the core entities
- `docs/architecture-guidelines.md`: target architecture for keeping the project business-system-first instead of frontend-first
- `docs/deployment-pi.md`: recommended first deployment path for a central Pi-hosted setup
- `deploy/docker-compose.synology.yml`: Synology-oriented container starter for the app server
- `scripts/deploy-synology.sh`: repo-driven Synology deploy script that syncs code and restarts the container
- `docs/workbook-analysis.md`: reverse-engineered notes from the current spreadsheet
- `docs/import-mapping.md`: sheet-to-table migration plan
- `data/sample-finance.json`: starter shape for real data later
- `config.local.example.json`: local-only example for private workbook/data paths outside the repo
- `config.server.example.json`: example paths for a Pi or similar always-on host
- `src/workbook-importer.ts`: first workbook-to-draft importer scaffold
- `src/types.ts`: target import and domain types
- `TODO.md`: short-term build sequence
- `STATUS.md`: current progress and next step

## Local Commands

```bash
npm install
npm run typecheck
npm test
npm run import:workbook -- "/path/to/private/finance-workbook.xlsx"
npm run bootstrap:mappings
npm run apply:review-state
npm run report:draft -- data/import-draft.json
npm run report:reviewed
npm run plan:months -- data/import-draft.json
npm run plan:reviewed
npm run build:dashboard -- data/draft-report.json data/monthly-plan.json dist/dashboard.html
npm run serve:app
npm run serve:app:server
npm run deploy:synology
```

Start with `npm install`, then `npm run typecheck` and `npm test`.

## External Private Data

Private workbook and generated JSON data can live outside the repo checkout via a local-only `config.local.json` next to `package.json`.

Example:

```json
{
  "dataDir": "/path/to/private/home-ops-finance/data",
  "workbookPath": "/path/to/private/finance-workbook.xlsx"
}
```

The file is gitignored. You can point it to iCloud, a NAS mount, or another private external path.

All paths shown here are placeholders.

The current importer draft already extracts:

- workbook sheet metadata
- forecast assumptions
- baseline planning anchors
- explicit workbook wealth anchors from `Übersicht Vermögen`
- music income rows
- irregular expense rows
- debt accounts and debt snapshots

The importer also normalizes workbook transaction signs:

- positive irregular rows stay as expenses
- negative irregular rows are converted into imported inflows such as refunds, sales, and payouts

The current monthly engine uses two explicit baseline profiles:

- `historical_liquidity`: before the current investment baseline is active
- `forecast_investing`: from the current investment-oriented planning phase onward

The current monthly engine also:

- keeps music `gross`, `reserve`, and `free` amounts separate
- routes forecast music income between safety and investment buckets after the workbook threshold
- reapplies explicit manual wealth anchors from `Übersicht Vermögen` before continuing the forecast

## Local App

Run `npm run serve:app` and open `http://localhost:4310`.

For a central Pi/NAS-style deployment, use `npm run serve:app:server`.

Relevant runtime environment variables:

- `HOME_OPS_FINANCE_DATA_DIR`: external directory for private finance JSON data
- `HOME_OPS_FINANCE_WORKBOOK_PATH`: external workbook path
- `HOME_OPS_FINANCE_HOST`: bind host for the app server, for example `0.0.0.0`
- `PORT`: server port, defaults to `4310`
- `HOME_OPS_FINANCE_SERVER_MODE=1`: disables the local auto-shutdown behavior for a long-running server
- `HOME_OPS_FINANCE_PUBLIC_BASE_URL`: optional display URL for logs and runtime diagnostics

The local app shell currently serves:

- `/`: browser entry point
- `/data/*`: generated draft and monthly plan JSON from the active private data directory
- `/dist/*`: generated static dashboard output
- `/api/runtime-info`: current runtime host/data-path/server-mode information

The browser review currently supports:

- a calmer default UI with a separate developer mode for migration-heavy or technical controls
- validation signals for likely mismatches or risky months
- month filters for deficits and future forecast rows
- a month-by-month review with a shared month selector across month-scoped tabs
- a month-by-month review with active baseline items, imported flows, and a clearer start/in-month/end structure
- local reconciliation and import-correction persistence into project JSON files
- a first reviewed-draft pipeline that can reapply saved corrections once `data/import-draft.json` exists
- bootstrapped default category/account mappings for imported entries
- automatic regeneration of reviewed report, reviewed month plan, and reviewed dashboard after saves in the local app
- a first goals view for milestone tracking and longer-range planning assumptions
- a separate household-inventory workspace with total value, split between general household goods and music equipment, and editable insured sum

The current local app also keeps private finance artifacts outside the repository:

- reviewed drafts and month plans stay in the configured external `dataDir`
- household inventory persistence also lives in that private external data directory
- documentation and preview assets inside the repo remain sanitized and example-only

## Central Hosting Direction

For a private “same app everywhere” setup, the recommended path is:

1. keep the app logic inside this repo
2. point `HOME_OPS_FINANCE_DATA_DIR` at a central private data directory
3. run `npm run serve:app:server` on a Pi or similar host
4. reach it through a private network layer such as Tailscale instead of exposing it publicly first

This keeps the finance logic unchanged while making runtime and storage deployment-specific.

A `systemd` starter template is available at:

- `deploy/home-ops-finance.service.example`

A simple runtime check helper is available at:

- `scripts/check-server-runtime.sh`

A Docker image definition is available at:

- `Dockerfile`

For Synology specifically, prefer the repo-driven deploy script:

- `scripts/deploy-synology.sh`

It keeps the repo as the only code source while the Synology stores only:

- the synced deployment checkout
- the running container
- the external private data directory

## Next Steps

- Turn the spreadsheet categories into the first real data model.
- Add deeper workbook consistency checks against known anchor values and suspicious month totals.
- Expand the review UI from inspection into the first editable finance workflow.
- Split the project more clearly into domain core, adapters, and thin UI surfaces as described in `docs/architecture-guidelines.md`.
