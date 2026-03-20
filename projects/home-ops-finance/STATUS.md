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
- The local review app now includes a month-by-month inspection view with active baseline items and imported income and expense rows.
- Monthly planning now emits automatic consistency signals for anchor mismatches, deficit months, and unusual imported expense spikes.
- The local review app now highlights suspicious months and shows automatic month-level warnings directly in the review pane.
- The local review app now includes a first editable reconciliation layer with month status, notes, and signal-based checklist actions stored locally in the browser.
- The local review app now supports first editable import corrections for income and expense rows, including local category mapping, target account assignment, and reviewed-state tracking.
- Reconciliation and import-mapping decisions can now be persisted into project JSON files through the local app server instead of only staying in browser storage.
- A first project-level account list now exists and is used by the import-correction UI as the source of target-account options.
- A first `apply-review-state` script now reapplies reviewed month and entry decisions onto a reviewed import draft and exits cleanly when no generated `import-draft.json` exists yet.
- The real workbook `/Users/tom/Downloads/Bilanz Tom.xlsx` has now been imported into `data/import-draft.json`, and reviewed draft/report/plan/dashboard artifacts can be regenerated from it.
- Default import mappings have been bootstrapped for 491 real imported entries so the review UI starts from a prepared category/account baseline instead of an empty file.
- Saving reconciliation or mapping changes through the local app now regenerates the reviewed draft, reviewed reports, reviewed monthly plan, and reviewed dashboard automatically.
- The overview now surfaces a priority-ranked shortlist of the worst warning months so manual review can start with the highest-impact outliers immediately.
- Music income now keeps gross, reserve, and free-available amounts separately, and the monthly plan models the workbook threshold routing between safety and investment buckets for forecast months.
- Manual workbook wealth anchors from `Übersicht Vermögen` are now imported and reapplied in the monthly engine, so explicit reset months such as `2026-02` use the Excel values directly before the forecast continues.
- The local app now includes a first goals and retirement planner that projects 25k net-worth milestones and estimates the minimum average monthly music revenue needed to hit a retirement target by a chosen age.

## Immediate Next Step

Validate a few more 2026 workbook anchor and post-anchor months in the app, then tune the retirement-planner assumptions so its target-music output matches the mental model from the spreadsheet.

## Notes

- Keep commits small and milestone-based.
- Update this file whenever scope or progress changes.
