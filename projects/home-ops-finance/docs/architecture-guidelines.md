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

## Practical Definition Of Success

This project is successful when:

- finance rules can be changed without hunting through UI code
- outputs remain explainable to a non-web expert
- AI can safely help without introducing stack sprawl
- new features feel like extending a business system, not patching a demo frontend
