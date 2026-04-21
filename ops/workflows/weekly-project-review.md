# Workflow: Weekly Project Review

Goal:

- create a short cross-project overview without changing code by default

Steps:

1. Read `ops/project-inventory.yaml`.
2. Visit projects by priority.
3. For each project, read README and STATUS/TODO files if present.
4. Run only cheap checks listed in the inventory when appropriate.
5. Summarize:
   - current state
   - blockers
   - stale docs
   - test/deploy risks
   - suggested next action
6. Do not deploy or delete anything.

Output:

- use `ops/reports/status-report-template.md`
