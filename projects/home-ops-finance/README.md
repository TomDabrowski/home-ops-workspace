# Home Ops Finance

Personal finance tracker to replace the current spreadsheet in small, safe steps.

## Current Direction

The current spreadsheet already combines income, expenses, asset tracking, and monthly rollups. The app should keep that same mental model and move it into a cleaner system instead of forcing a completely different workflow.

## MVP

- Track accounts, assets, income, and expenses.
- Separate fixed and variable monthly costs.
- Show monthly cashflow, savings rate, and net worth.
- Provide a simple 3 to 12 month forecast.

## Current Project Files

- `docs/data-model.md`: first draft of the core entities
- `docs/workbook-analysis.md`: reverse-engineered notes from the current spreadsheet
- `docs/import-mapping.md`: sheet-to-table migration plan
- `data/sample-finance.json`: starter shape for real data later
- `src/workbook-importer.ts`: first workbook-to-draft importer scaffold
- `src/types.ts`: target import and domain types
- `TODO.md`: short-term build sequence
- `STATUS.md`: current progress and next step

## Local Commands

```bash
npm install
npm run typecheck
npm test
npm run import:workbook -- "/Users/tom/Downloads/Bilanz Tom.xlsx"
npm run report:draft -- data/import-draft.json
npm run plan:months -- data/import-draft.json
npm run build:dashboard -- data/draft-report.json data/monthly-plan.json dist/dashboard.html
npm run serve:app
```

The current importer draft already extracts:

- workbook sheet metadata
- forecast assumptions
- baseline planning anchors
- music income rows
- irregular expense rows
- debt accounts and debt snapshots

The importer also normalizes workbook transaction signs:

- positive irregular rows stay as expenses
- negative irregular rows are converted into imported inflows such as refunds, sales, and payouts

The current monthly engine uses two explicit baseline profiles:

- `historical_liquidity`: before the current investment baseline is active
- `forecast_investing`: from the current investment-oriented planning phase onward

## Local App

Run `npm run serve:app` and open `http://localhost:4310`.

The local app shell currently serves:

- `/`: browser entry point
- `/data/*`: generated draft and monthly plan JSON
- `/dist/*`: generated static dashboard output

## Next Steps

- Turn the spreadsheet categories into the first real data model.
- Expand the local app from read-only review into the first interactive finance UI.
- Add more validation tests against known workbook anchors and month totals.
