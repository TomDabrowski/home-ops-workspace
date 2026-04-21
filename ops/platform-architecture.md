# Personal DevOps Platform Architecture

This is the target shape for managing all repos, not only the Home Ops Finance app.

## Goal

Create a small personal Internal Developer Platform that can:

- know which repos exist
- know which services run on the NAS
- run repeatable checks
- deploy safely
- keep docs and setup paths understandable
- let specialized agents produce useful work without constant re-explaining

## Layers

### 1. Repo Registry

Tracks all repos and project folders.

Public-safe fields may live in Git:

- repo name
- generic purpose
- local project path pattern
- default branch
- check commands
- deploy type
- owner role

Private fields should live in a filled private copy outside Git:

- exact hostnames
- LAN IPs
- Tailscale domains
- SSH users
- SSH key paths
- secrets
- private data paths

Use:

- `ops/repo-registry.template.yaml`

### 2. NAS Runtime

The NAS is the preferred always-on runtime for small services.

Expected runtime pattern:

- code stays in Git
- deploy syncs build context to NAS
- containers run on NAS
- live data is mounted from dedicated NAS folders
- app-specific deploy scripts are repo-owned
- generic deploy orchestration is documented in `ops/`

### 3. Deploy Automation

Preferred path:

- local Mac or agent triggers deploy
- deploy script builds on NAS or builds an image and ships it
- service restarts with stable volumes
- health check verifies the service
- deploy output is visible and saved

Automatic deploys should be gated:

- safe: docs-only checks, test runs, status reports
- allowed with project policy: auto-deploy from `main` after green checks
- manual approval: first deploy, schema changes, data migrations, destructive changes

### 4. Agent Roles

Agents should be role-specific:

- Platform Engineer: repo registry, deploy standards, NAS runtime
- Release Manager: checks, changelog, deploy readiness
- Ops: service health, backup, runtime docs
- Reviewer: bugs, regressions, missing tests
- Product: user stories and priorities
- Docs: setup and onboarding
- Ideas: backlog and exploration
- Design: UX, mobile, copy clarity
- SEO / Content: public-facing projects only

### 5. Inbox And Reports

Agents should write human-readable output instead of changing everything silently.

Use:

- `ops/reports/inbox-item-template.md`
- `ops/reports/status-report-template.md`

## Deployment Maturity Levels

### Level 0: Manual

- local commands
- manual copy/deploy
- ad-hoc notes

### Level 1: Scripted

- repo contains deploy script
- docs explain setup
- manual trigger
- basic health check

### Level 2: One-Click

- local launcher or command palette action
- visible logs
- health check after deploy
- secrets in keychain or local secret store

### Level 3: Gated Auto-Deploy

- push to `main`
- checks run
- deploy runs only if policy allows
- health check required
- rollback notes available

### Level 4: Full Platform

- central dashboard
- all repos inventoried
- recurring reviews
- deploy history
- service health
- backup status

Current target:

- Level 2 for important services
- Level 1 for early projects
- Level 3 only after each service has tests, health checks, and rollback notes

## Non-Goals

- no public exposure by default
- no secrets in Git
- no blind auto-deploys for data-sensitive apps
- no central system that can delete live data without approval
- no pretending early prototypes are production services
