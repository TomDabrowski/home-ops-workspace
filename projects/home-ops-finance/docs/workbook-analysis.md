# Workbook Analysis

Source file analyzed:

- `/path/to/private/finance-workbook.xlsx`

## Summary

The workbook is understandable and structured enough to migrate into software.

It is not just a flat expense tracker. It already models:

- monthly fixed and variable expenses
- salary-based baseline calculations
- separate music income planning
- long-range yearly and monthly forecasts
- wealth split between safety and investment buckets
- debt tracking

## Sheets

### `Bilanz`

Purpose:

- baseline monthly income and expense overview
- derived salary metrics
- fixed expense rollups
- cash available after fixed expenses and lifestyle allocations

Notable logic:

- yearly expenses are converted into monthly reserves with formulas like `=C6/12`
- salary metrics are derived from gross salary, taxes, and fixed assumptions
- monthly free cash is calculated from salary and expense blocks
- there is a direct dependency on music income and wealth planning

Examples:

- `B37 = SUM(B6:B36)` monthly expense total
- `E37 = 2920` net salary anchor
- `E81 = SUM(E72:E79)` fixed monthly expenses
- `E82 = E81 + E69` fixed expenses plus food and other variable baseline

### `Übersicht Vermögen`

Purpose:

- wealth projection engine
- split between `Sicherheitsbaustein` and `Renditebaustein`
- threshold logic for switching how money is allocated

Core model:

- daily/monthly available money comes from `Bilanz`
- wealth is split into:
  - safety bucket (`Tagesgeld`)
  - investment bucket (`ETF`)
- allocation changes once threshold values are reached
- monthly compounding is applied to both savings and investment buckets

Important assumptions:

- safety threshold: `10000`
- music threshold: `10000`
- Tagesgeld annual return: `2%`
- ETF annual return: `5%`
- default monthly ETF contribution: `1050`

Key formulas:

- `G3 = 'Bilanz'!E37 - L6 - 'Bilanz'!E82`
- `G12 = G11 / 12`
- `K12 = K11 / 12`
- safety bucket grows with:
  - prior balance
  - monthly salary surplus if below threshold
  - music income or partial music income
- investment bucket grows with:
  - prior balance
  - fixed monthly investment amount
  - salary surplus once safety threshold is reached
  - 60% of music income once threshold is reached

This is the main long-term forecast logic in the workbook.

### `Einnahmen Musik`

Purpose:

- monthly music income planning
- split into gross income, retained share, and free share

Observed pattern:

- rows are organized by month and year
- monthly income values are repeated or projected forward
- a percentage split is applied using a configurable cell

Example pattern:

- `D = gross amount`
- `E = retained share`
- `F = free share`

This sheet feeds directly into wealth projection.

### `sonstige Ausgaben 2023 bis 2030`

Purpose:

- month-by-month irregular expenses and one-off events
- contains real history and future planned items

Observed structure:

- grouped by year
- each month has:
  - description column
  - amount column
  - date/comment column
- every month has a `Summe`

This sheet is a very good source for migrating historical variable expenses from 2023 onward.

### `Schulden`

Purpose:

- debt register and repayment history
- debt composition by lender
- projected and historical debt states

Observed debts:

- Auxmoney
- Sparkasse
- Bildungskredit
- debt to mother

This is enough structure to migrate into a dedicated debts table.

## What The Forecast Is Doing

At a high level, the workbook forecast works like this:

1. Start with net salary from `Bilanz`.
2. Subtract the fixed baseline monthly expenses from `Bilanz`.
3. Subtract irregular monthly expenses from `sonstige Ausgaben 2023 bis 2030`.
4. Add music income from `Einnahmen Musik`.
5. Route monthly surplus differently depending on whether the safety threshold has been reached.
6. Apply monthly compounding to safety and investment balances.
7. Sum both buckets into total projected wealth.

So yes: the workbook contains a real, readable forecasting model, not just manual guesses.

## Baseline Observation

The current workbook baseline appears to treat annual reserves as a separate planning block rather than always subtracting them inside the main `available before irregulars` anchor.

Observed workbook anchors:

- monthly net salary: `2920`
- fixed monthly expenses: `1266.49`
- baseline variable amount: `320`
- annual reserve block: about `102.08`
- planned monthly investment: `1050`
- available before irregulars anchor: `283.51`

If annual reserves are subtracted directly, the recomputed availability becomes `181.43`, not `283.51`.

This suggests the workbook's planning model likely keeps annual reserves visible but outside the main available-cash anchor at that point in the sheet.

## Migration Feasibility

### Formula Understanding

Feasible:

- yes, the workbook formulas are understandable enough to reproduce
- the forecast logic is based on clear cross-sheet references and threshold rules

### Historical Data Import

Feasible:

- yes, historical data can be carried over
- at minimum from 2023 onward there is already structured month-by-month expense history
- 2025 onward is especially straightforward because the relevant planning sheets are clearly organized

Recommended migration levels:

- `Level 1`: import monthly aggregates only
- `Level 2`: import individual historical entries from the irregular expense sheet
- `Level 3`: rebuild forecast states month by month from imported entries and balances

### Risks

- some cells are manual anchors rather than purely derived values
- some forecasts are copied forward rather than generated from normalized source tables
- there are hardcoded constants inside formulas that should become named settings in the app

## Recommended App Model Additions

Compared with the first draft, the app should explicitly support:

- `debt_accounts`
- `debt_snapshots`
- `forecast_assumptions`
- `forecast_months`
- `income_streams`
- `expense_entries`
- `monthly_baselines`
- `wealth_buckets`

## Recommended Build Order

1. Import the workbook concepts into normalized data tables.
2. Recreate the baseline monthly model from `Bilanz`.
3. Recreate the irregular expense model from `sonstige Ausgaben`.
4. Recreate debt tracking from `Schulden`.
5. Rebuild the forecast engine from `Übersicht Vermögen` and `Einnahmen Musik`.

## Bottom Line

The workbook is detailed, but it is not too chaotic to migrate.

The formulas are understandable enough to rebuild the logic in code, and the historical data is structured enough to import in stages.
