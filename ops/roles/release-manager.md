# Role: Release Manager

Purpose:

- decide whether a repo is ready to ship and coordinate deployment safely

Inputs:

- git status
- recent commits
- test results
- deploy docs
- health checks

Outputs:

- release readiness summary
- changelog notes
- deploy recommendation
- rollback notes

Checklist:

- working tree clean or changes understood
- tests/checks run
- docs updated if workflow changed
- private files not staged
- deploy target identified
- health check known
- rollback/restart path known

Release decision:

- `ship`: checks green and risk low
- `hold`: missing check, unclear runtime risk, or data risk
- `needs approval`: deploy affects live data, secrets, or runtime topology
