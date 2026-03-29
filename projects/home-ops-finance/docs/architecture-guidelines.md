# Architecture Guidelines

## Purpose

This project should evolve like a business system, not like a framework-heavy web app.

The main value is:

- correct finance rules
- understandable planning results
- safe import and review workflows
- easy future changes without breaking the whole app

The browser UI is important, but it is not the product core.

## Recommended System Shape

### 1. Core

Keep the finance logic in a domain-first core that can be reasoned about like backend code.

Responsibilities:

- monthly planning
- wealth routing
- music reserve and tax logic
- forecast and retirement simulation
- validation and plausibility checks

Rules:

- no file access
- no DOM access
- no local storage access
- deterministic input -> output behavior

Good target modules:

- `core/baseline/`
- `core/income/`
- `core/expenses/`
- `core/allocation/`
- `core/forecast/`
- `core/retirement/`
- `core/validation/`

### 2. Adapters

Adapters should translate between the outside world and the core.

Responsibilities:

- workbook import
- reviewed-state application
- JSON persistence
- local app server endpoints
- browser storage fallback

Rules:

- adapters may read and write files
- adapters may map legacy shapes into cleaner domain inputs
- adapters should not own finance rules

Good target modules:

- `adapters/import/`
- `adapters/persistence/`
- `adapters/server/`
- `adapters/browser/`

### 3. UI

The UI should stay thin.

Responsibilities:

- render values
- collect inputs
- call actions
- show explanations and history

Rules:

- no hidden finance rules in rendering code
- no duplicate calculation logic unless strictly temporary
- explain values from core outputs instead of recomputing them differently

Good target modules:

- `ui/months/`
- `ui/music/`
- `ui/baseline/`
- `ui/retirement/`
- `ui/household/`
- `ui/shared/`

## What To Optimize For

### Architecture Control, Not Full Stack Mastery

The owner of this project does not need to become a full frontend specialist.

The project should instead optimize for:

- clear boundaries
- stable data shapes
- testable domain logic
- low framework churn
- easy prompting and safe AI-assisted changes

### Fewer Technologies

Preferred path:

- TypeScript
- Node
- local JSON persistence for now
- plain browser UI while the product is still changing fast

Avoid:

- mixing multiple UI frameworks
- moving business logic into DOM handlers
- adding infrastructure before the domain is stable

## Design Rules For AI-Assisted Changes

- No new library without a clear reason.
- No business logic inside purely presentational helpers.
- No file IO inside domain logic.
- No silent duplicate formulas across engine and UI.
- Every new feature should answer:
  - where does input come from
  - which core module owns the rule
  - which adapter persists it
  - which UI surface displays it

## Current Architecture Risks

### 1. Large Monthly Engine

`src/monthly-engine.ts` is currently the strongest candidate for future pain.

Why:

- too many responsibilities in one file
- hard to change without side effects
- naming gets heavier over time

Refactor direction:

- extract pure helpers first
- move calculations by concern, not by UI screen

### 2. UI Recomputes Too Much

Some browser-side logic still mirrors engine logic.

Risk:

- app view and engine can drift apart
- hard to trust values

Refactor direction:

- prefer one calculation path
- let the UI consume richer outputs instead of rebuilding them

### 3. Persistence Shapes Need Stronger Contracts

Current JSON persistence is pragmatic and okay, but long-term it needs stricter validation.

Refactor direction:

- add schema validation at adapter boundaries
- fail early on malformed saved data

## Recommended Near-Term Refactor Order

### Phase 1: Stabilize Boundaries

- document which functions are domain logic vs UI glue
- move shared calculation helpers out of UI files where possible
- keep existing behavior unchanged

### Phase 2: Split The Engine

Start with the least risky extractions:

- baseline calculation helpers
- imported income and expense aggregation
- wealth allocation and threshold routing
- forecast projection helpers

### Phase 3: Add Validation At Boundaries

- validate saved JSON structures
- validate server payloads
- validate imported workbook shapes before calculation

### Phase 4: Thin UI Surfaces

- let each workspace render from structured outputs
- reduce direct business calculations inside `app/app.js`

## Progress / Already Applied

This section tracks architecture-relevant changes that are already in place, so the current system shape is visible across devices.

### Boundary Progress

- Music month ownership now supports a separate `monthKey` in addition to the real `entryDate`.
- Wealth snapshots now support `snapshotDate` with date and time, so same-day ordering is more reliable.
- Wealth snapshots now also support an optional explicit month-start owner, so a saved snapshot can act as “the start of April” instead of being inferred only from calendar placement.
- The reviewed-state flow already persists music overrides, wealth snapshots, and allocation-action state through project JSON files instead of relying only on browser storage.
- Server-side boundary validation now protects:
  - `reconciliation-state.json`
  - `import-mappings.json`
  - `baseline-overrides.json`
  - `monthly-expense-overrides.json`
  - `monthly-music-income-overrides.json`
  - `music-tax-settings.json`
  - `forecast-settings.json`
  - `salary-settings.json`
  - `wealth-snapshots.json`
  - `allocation-action-state.json`
  - `household-items.json`

Why this matters:

- planning month and real cash timing are no longer forced into the same field
- snapshot-based routing can reason more safely about end-of-day or same-day updates
- workflow state is more portable across devices
- month-start intent is no longer forced to hide inside a generic in-month snapshot

### Pure Logic Extractions Already Done

- Shared month-selection and aggregation helpers were moved into `src/monthly-planning-helpers.ts`.
- Month allocation guidance exists as explicit pure logic in `src/monthly-engine.ts` via `buildMonthAllocationInstructions(...)`.
- The month allocation guidance now has a canonical pure owner in `src/core/allocation/build-month-allocation-instructions.js`.
- `app/app.js` and `src/monthly-engine.ts` both consume that shared module instead of maintaining separate rule implementations.

Why this matters:

- the riskiest finance rules are less buried inside DOM handlers
- behavior is easier to regression-test
- this is a direct step toward a future `core/allocation/` split

### UI / Workflow Improvements Already Done

- Month guidance now has explicit completion state for salary and music actions.
- Completed actions are persisted and rendered as done instead of staying visually open forever.
- Guidance can now explain why money goes to the threshold account and can keep a planned month visible even when the actual music payment happened before month start.
- Wealth snapshots can now be marked explicitly as the month start for a chosen month, and the month review surfaces expose whether a month-start anchor is active.
- The wealth-snapshot workflow and monthly music-income workflow now live in `app/ui/workflow-planners.js` instead of being embedded directly inside `app/app.js`.
- The monthly-expense workflow now also lives in `app/ui/workflow-planners.js`.
- The month review UI surfaces now live in `app/ui/month-review.js` instead of being embedded directly inside `app/app.js`.
- The review workflow surfaces for reconciliation, imported entries, and mapping correction now live in `app/ui/review-workspace.js`.
- The planner surfaces for forecast thresholds, salary settings, and music tax now live in `app/ui/planners.js`.
- The music workspace now lives in `app/ui/music-workspace.js`.
- The household workspace now lives in `app/ui/household-workspace.js`.
- The fixed-cost / baseline override workspace now lives in `app/ui/fixed-cost-workspace.js`.
- The retirement / goals workspace now lives in `app/ui/retirement-workspace.js`.
- The overview dashboard, priority-month cards, and month-review navigation now live in `app/ui/overview-dashboard.js`.
- Browser workflow state, cache loading, and JSON persistence fallback now live in `app/browser/workflow-state.js`.
- Browser app-shell concerns like tab/view-state persistence, status messaging, developer-mode UI, and client-session lifecycle now live in `app/browser/app-shell.js`.
- Browser runtime helpers for app-state access, date defaults, and data refresh now live in `app/browser/app-runtime.js`.
- Browser bindings for shutdown, tab wiring, developer-mode toggles, and app bootstrap now live in `app/browser/app-bindings.js`.
- Browser-owned review state for reconciliation defaults and mapping persistence now lives in `app/browser/review-state.js`.
- Browser-owned retirement planner settings now live in `app/browser/planner-settings.js`.
- Shared browser helpers for labels, select options, wealth-snapshot formatting, and baseline line-item shaping now live in `app/shared/finance-ui-helpers.js`.
- Shared browser formatting and generic render helpers now live in `app/shared/ui-formatters.js`.
- Shared month/date/forecast helpers now live in `app/shared/forecast-helpers.js`.
- Month-review data preparation, manual-entry ownership checks, and monthly expense warnings now live in `app/shared/month-review-data.js`.
- Local draft/report/monthly-plan derivation now lives in `app/shared/local-finance-state.js`.
- Shared month-baseline surfaces now live in `app/ui/month-baseline.js`.
- Workflow-history rendering now lives in `app/ui/workflow-history.js`.

Why this matters:

- the UI is moving toward rendering explicit outputs instead of improvising its own story
- the month workflow is more trustworthy for real end-of-month use
- the overview/dashboard shell is less entangled with month-review routing
- workflow caching and persistence no longer bloat the main app shell
- repeated browser helper logic is moving out of the app shell into explicit shared modules
- date/forecast helper logic is no longer duplicated inline in the app shell
- review-state defaults and mapping persistence are no longer hidden in the main app shell
- browser app-state access and refresh plumbing are no longer hidden in the main app shell
- browser event binding and bootstrap wiring are no longer hidden in the main app shell
- startup and idle-shutdown behavior are now more tolerant of slow browser attachment, so the local app server does not disappear too aggressively during launch
- runtime hosting concerns are starting to separate from the finance logic: host, port, data path, and persistent-server mode can now be configured without changing the finance modules
- retirement planner localStorage behavior is no longer mixed into the app shell
- month-scoped review data shaping is no longer embedded only inside the app shell
- browser orchestration concerns are no longer mixed directly into the main app shell
- local workflow-to-draft merging and derived finance-state rebuilding are no longer embedded in the app shell

### Tests Added For Refactor Safety

- Regression tests cover routing music to the configured threshold account.
- Regression tests cover using the latest prior wealth snapshot for threshold decisions.
- Regression tests cover the “planned for April, received in March” case for both engine and browser-side allocation guidance.
- Validation tests now cover accepted and rejected payloads for the main workflow and planner JSON files.

Why this matters:

- architecture work can continue with less fear of silently breaking month transitions

## Current Transitional Compromises

These are known temporary states, not desired end-state architecture.

- Allocation guidance still has two call sites:
  - `src/monthly-engine.ts`
  - `app/app.js`
- But the finance rule itself now lives in one canonical module:
  - `src/core/allocation/build-month-allocation-instructions.js`
- `app/app.js` is still too large and still owns some workflow shaping that should eventually move into dedicated UI modules or adapters.
- `app/app.js` is thinner than before, but still acts as the central composition root for many workspaces.
- `app/app.js` now delegates even the dashboard/month-navigation behavior, and many former local helpers now live in `app/shared/ui-formatters.js` and `app/shared/forecast-helpers.js`.
- `app/app.js` no longer owns the workflow-state cache layer; that responsibility moved to `app/browser/workflow-state.js`.
- `app/app.js` no longer owns the browser app-shell lifecycle and status machinery; that responsibility moved to `app/browser/app-shell.js`.
- `app/app.js` no longer owns low-level browser runtime helpers like state access, date defaults, and finance-data refresh; that responsibility moved to `app/browser/app-runtime.js`.
- `app/app.js` no longer owns shutdown wiring, tab binding, developer-mode toggles, or bootstrap error handling; that responsibility moved to `app/browser/app-bindings.js`.
- `app/app.js` no longer owns reconciliation defaults, entry-mapping defaults, or mapping persistence wiring; that responsibility moved to `app/browser/review-state.js`.
- `app/app.js` no longer owns retirement planner settings persistence; that responsibility moved to `app/browser/planner-settings.js`.
- `app/app.js` still contains important month-review and formatting glue, but many shared helper functions were removed into `app/shared/finance-ui-helpers.js`.
- `app/app.js` still orchestrates review rendering, but month-review data shaping now lives in `app/shared/month-review-data.js`.
- `app/app.js` no longer owns the local draft/report/monthly-plan derivation pipeline; that responsibility moved to `app/shared/local-finance-state.js`.
- `app/app.js` no longer owns the month-baseline summary/list surfaces; that responsibility moved to `app/ui/month-baseline.js`.
- `app/app.js` no longer owns workflow-history rendering; that responsibility moved to `app/ui/workflow-history.js`.
- `app/app.js` has been reduced from well above 3000 lines to under 1000 lines during this refactor pass.
- Retirement simulation math already lives outside the UI in `app/projection-tools.js`, but planner settings and some composition glue still live in `app/app.js`.
- Browser-side persistence and server persistence already share concepts, but they do not yet have strong schema validation at the boundary.
- Wealth snapshot form defaults were recently simplified back toward “latest real snapshot first”, but the planner still mixes workflow concerns and financial defaults in one UI surface.
- Validation is now in place for the persisted planner, workflow, and review JSON endpoints that the local app currently writes.
- The app server now has a cleaner deployment boundary: runtime host/port/persistent mode are configuration, not finance logic.
- Pi/NAS deployment guidance now lives in docs and deployment templates instead of being implied through ad-hoc local scripts only.
- Synology container deployment now has its own deployment artifacts, again without introducing hosting-specific branches into the finance rules.

## Recommended Next 3 Refactor Steps

### 1. Thin `app.js` Further Into A Clear Composition Root

Target:

- remove more remaining orchestration-only glue from `app/app.js`
- make imports and ownership obvious enough that a quick scan explains where logic now lives

Likely destination:

- `app/browser/`
- `app/shared/`
- `app/ui/`

### 2. Tighten The Remaining Workflow Boundaries

Target:

- keep workflow screens thin and push any remaining shaping toward shared helpers or adapters
- continue simplifying planner defaults and workflow state transitions where they are still mixed

Why next:

- the large structural split is done, so the next wins are clarity and fewer mixed responsibilities

### 3. Expand Refactor-Safety Coverage

Target:

- add tests around the newer shared browser modules
- protect the final composition-root changes with regression coverage where behavior is easy to drift

Why next:

- the risky architecture moves are mostly complete, so the next risk is accidental regression during cleanup

## Practical Definition Of Success

This project is successful when:

- finance rules can be changed without hunting through UI code
- outputs remain explainable to a non-web expert
- AI can safely help without introducing stack sprawl
- new features feel like extending a business system, not patching a demo frontend
