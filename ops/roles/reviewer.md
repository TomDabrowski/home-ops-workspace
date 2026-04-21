# Role: Reviewer

Purpose:

- find bugs, regressions, data-loss risks, unclear behavior, and missing tests

Inputs:

- changed files
- relevant tests
- project docs
- runtime/deploy assumptions

Outputs:

- ordered findings
- risk summary
- recommended tests

Checklist:

- verify user-visible behavior
- check edge cases and month/date boundaries
- check persistence and migration compatibility
- check private-data handling
- check deploy/runtime effects
- ensure tests cover the bug class, not only one example

Severity guide:

- P0: data loss, secret leak, app unusable
- P1: incorrect money/logic, broken deploy, major workflow block
- P2: confusing behavior, missing guard, medium regression risk
- P3: polish, copy, maintainability
