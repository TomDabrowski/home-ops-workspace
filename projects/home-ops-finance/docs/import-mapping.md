# Import Mapping

## Purpose

This document defines how the current workbook should be imported into normalized app tables.

## Migration Strategy

### Phase 1

Import high-value structures first:

- baseline monthly planning
- historical irregular expenses
- debt accounts and debt snapshots
- music income projections
- forecast assumptions

### Phase 2

Backfill detailed categories, account mappings, and balance snapshots.

### Phase 3

Recompute forecast months inside the app and compare them with workbook outputs.

## Sheet Mapping

### `Bilanz`

Import targets:

- `monthly_baselines`
- `income_streams`
- `expense_categories`
- `subscriptions`
- `forecast_assumptions`

Fields to capture:

- net salary anchor
- fixed monthly expenses
- annual expenses converted to monthly reserves
- planned food and lifestyle buffers
- derived monthly available cash

Notes:

- many values here are planning anchors, not transaction history
- annual expenses should become recurring planned expenses or named assumptions

### `Übersicht Vermögen`

Import targets:

- `wealth_buckets`
- `forecast_assumptions`
- optional seed rows for `forecast_months`

Fields to capture:

- safety threshold
- music threshold
- annual return assumptions
- target monthly ETF contribution
- current starting balances

Notes:

- most rows should not be stored as raw imported facts forever
- the app should recreate these month rows from source tables

### `Einnahmen Musik`

Import targets:

- `income_streams`
- `income_entries`
- `forecast_assumptions`

Fields to capture:

- month
- projected gross amount
- retained share
- free share
- split percentage assumption

### `sonstige Ausgaben 2023 bis 2030`

Import targets:

- `expense_entries`

Fields to capture:

- year
- month
- description
- amount
- comment or source date if present

Notes:

- negative values should stay negative only at raw import time if needed
- app normalization should convert them into a consistent inflow/outflow convention

### `Schulden`

Import targets:

- `debt_accounts`
- `debt_snapshots`
- debt-related `expense_entries`

Fields to capture:

- lender
- original amount
- monthly rate
- remaining balance by date
- payoff milestones

## Data Rules

- keep imported workbook values traceable with a `source` marker
- preserve month granularity when day precision is missing
- convert workbook constants into named `forecast_assumptions`
- do not store copied forecast rows as permanent source truth if the same values can be derived

## First Validation Pass

After import, validate:

1. monthly baseline cashflow matches workbook anchor values
2. irregular expense monthly totals match the workbook monthly sums
3. debt balances match the workbook checkpoints
4. forecast month outputs are close to workbook results for selected months
