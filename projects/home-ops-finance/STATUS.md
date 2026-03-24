# Status

## Current Phase

Interactive Planning App

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
- A representative workbook import path has been validated against `data/import-draft.json`, and reviewed draft/report/plan/dashboard artifacts can be regenerated from it.
- Default import mappings have been bootstrapped for a large set of imported entries so the review UI starts from a prepared category/account baseline instead of an empty file.
- Saving reconciliation or mapping changes through the local app now regenerates the reviewed draft, reviewed reports, reviewed monthly plan, and reviewed dashboard automatically.
- The overview now surfaces a priority-ranked shortlist of the worst warning months so manual review can start with the highest-impact outliers immediately.
- Music income now keeps gross, reserve, and free-available amounts separately, and the monthly plan models the workbook threshold routing between safety and investment buckets for forecast months.
- Manual workbook wealth anchors from `Übersicht Vermögen` are now imported and reapplied in the monthly engine, so explicit reset months such as `2026-02` use the Excel values directly before the forecast continues.
- The local app now includes a first goals view that projects 25k net-worth milestones and supports longer-range planning assumptions.
- The review app is now project-persistent for future planning edits: reconciliation, import mappings, future fixed-cost overrides, and manual monthly expense overrides are written to project JSON via the local app server.
- `apply-review-state` now reapplies both future fixed-cost overrides and manual variable monthly expenses into the reviewed import draft, so reviewed artifacts include forward-only planning changes from the UI.
- The baseline UI has been turned into a forward-only planning surface: new fixed costs can be created with `gueltig ab`, custom future fixed costs can be edited/deactivated, and existing workbook fixed costs can be changed or ended from a chosen future month without rewriting history.
- The month review now supports manual variable month expenses in the app, including create/edit/deactivate flows that regenerate the reviewed draft/report/plan/dashboard automatically.
- The month table is now directly actionable: clicking a month opens the review workspace, and the table now shows end-of-month total wealth alongside the existing planning columns.
- The app shell has been restructured so the `Monate` tab opens as a focused month workspace with the selected month, summary, warnings, imported expenses, manual month expenses, and a sticky side column for income, active plan items, reconciliation, and mappings.
- The month workspace now defaults to the current month when possible instead of jumping to the end of the forecast.
- The longer-range planning assumptions are now more explicit and conservative: inflation, salary growth, rent growth, other-cost growth, music-tax handling, and fixed monthly music needed are modeled together.
- The long-range planning view now only projects through its chosen target month instead of continuing an implied work life far beyond the target age, and the target-age input is constrained so it cannot fall below current age.
- The local app server now serves HTML/CSS/JS/JSON with no-cache headers to reduce stale-browser issues while iterating on the app locally.
- The app copy is being cleaned up toward production-quality German text, including real umlauts in the visible UI instead of `ae/oe/ue` placeholders.
- The app surface has started moving toward a cleaner Apple-like UI direction: brighter palette, lighter cards, calmer typography, and a less tool-heavy overall layout.
- The default app surface is now significantly less technical: migration-heavy tabs and stored-change diagnostics are hidden behind a developer mode instead of always being visible.
- Month selection is now shared across the month-scoped workflows instead of resetting independently in each tab.
- The month workspace now focuses on a simpler mental model with separated `start of month`, `in month`, and `end of month` summaries.
- Annual reserve items now show their recurring charge day when that can be derived from existing imported bookings.
- A first dedicated household-inventory workspace now exists, including a total-value summary, separate household/music sections, editable insured sum, and CRUD support backed by the external private data directory.
- The long-range planning UI no longer uses sliders; it now relies on plain numeric inputs because the slider-based interactions were unstable in real use.
- The long-range planning view no longer recalculates live on every keystroke. Users now adjust values and explicitly apply them with a `Werte übernehmen` button.
- The long-range planning view now includes visible validation and exception handling in the UI. Invalid combinations such as `current age > target age` show an in-app error box instead of breaking the page.
- The heavier long-range calculations are now lazy-initialized only when the planning tab is opened, which improves the perceived performance of the main app shell and month workflow.
- Home Ops Finance can now resolve its private workbook and generated JSON data from a local-only external path via `config.local.json` or env vars, so sensitive finance artifacts can live on iCloud or a NAS instead of inside the repo checkout.
- A first explicit architecture guideline now exists for keeping the project business-system-first: domain core, adapters, and thin UI surfaces are now the intended direction for future refactors and AI-assisted changes.
- The first projection/refactoring step from that plan is now in place: the browser-side retirement and forecast helpers have been pulled out of `app/app.js` into a dedicated `app/projection-tools.js` module so the UI surface is no longer carrying that full block inline.
- The first `src/monthly-engine.ts` split is now also done: reusable month-selection, baseline-selection, and aggregation helpers have been moved into `src/monthly-planning-helpers.ts`, reducing the amount of low-level data plumbing that still lives inside the engine file.

## Immediate Next Step

Use `docs/architecture-guidelines.md` and `TODO.md` as the working contract for the next refactor phase: keep shrinking `app/app.js`, then start splitting the biggest month-planning responsibilities out of `src/monthly-engine.ts` while keeping the outputs stable.

## Notes

- Keep commits small and milestone-based.
- Do not commit or push personal workbook-derived `data/*.json` artifacts.
- Update this file whenever scope or progress changes.
