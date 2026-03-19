# Status

## Current Phase

Foundation

## Status Summary

- Project folder created.
- Initial scope and MVP captured.
- First finance data model draft written.
- Sample JSON structure added for future implementation.
- Current Excel workbook structure and formula purpose analyzed.
- Normalized app table model and import mapping drafted.
- TypeScript project scaffold and first workbook importer added.
- Workbook importer now extracts music income rows, irregular expenses, and debt snapshots into a draft JSON.
- Import normalization added so negative irregular rows are moved into inflows and expense amounts are consistently positive.
- Draft reporting layer added for monthly summaries and latest debt balances.
- Baseline anchor comparison added, including the current delta between workbook availability and recomputed planning parts.
- First deterministic monthly planning engine added on top of the import draft.
- First local browser dashboard build step added from generated JSON reports.
- Monthly planning now switches between a historical liquidity profile and a forecast investing profile instead of using one baseline for every month.
- Typecheck and first monthly-engine unit tests are in place and passing.
- Monthly planning now derives its baseline from detailed line items with effective dates instead of only from precomputed summary fields.
- First local app shell added to serve browser UI assets, generated finance JSON, and dashboard output on `localhost:4310`.

## Immediate Next Step

Turn the local app shell into the first real review UI for monthly planning, imported flows, and workbook consistency checks.

## Notes

- Keep commits small and milestone-based.
- Update this file whenever scope or progress changes.
