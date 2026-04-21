# Operating Rules

These rules apply across all projects in this workspace.

## Source Of Truth

- Code truth lives in Git.
- Live/private data lives outside Git.
- Cross-repo private registry data lives in a private filled copy outside Git.
- Generated or filled local configs stay untracked.
- Project-specific status belongs in each project folder when useful.
- Cross-project operating context belongs in `ops/`.

## Agent Behavior

Agents should:

- read existing context before changing files
- keep changes small and reviewable
- prefer project-specific tests over broad slow checks unless needed
- write clear findings with file references
- update documentation when workflow changes
- avoid committing private values

Agents should not:

- invent private paths, hostnames, or credentials
- silently deploy
- delete user data
- rewrite large areas without a clear reason
- treat early ideas as committed product decisions

## Decision Boundaries

Safe to do directly:

- add generic docs
- add templates
- run tests
- fix clear code bugs
- improve wording
- add regression tests for observed failures

Ask or pause first:

- destructive filesystem actions
- secret handling
- production deploy changes
- enabling automatic deployment
- changing project ownership or priority
- removing branches with unique history
- automating recurring actions

## Reporting Standard

Every significant agent pass should answer:

- What did I check?
- What did I find?
- What changed?
- What did I verify?
- What remains risky or unclear?

Use `reports/status-report-template.md` unless a shorter answer is enough.
