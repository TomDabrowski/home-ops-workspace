# Personal DevOps Platform

This directory is the operating system for managing projects across repos and devices.

Common names for this kind of setup:

- Internal Developer Platform
- Personal DevOps Platform
- AI Agent Operating System
- Agentic Project Management
- Multi-Agent Project Operations
- Project Operations Hub

This repo uses the practical name:

- Personal DevOps Platform

## Purpose

Give future Codex threads, local agents, and human reviews a shared way to understand:

- which projects exist
- which repos exist outside this workspace
- what each project is for
- where code lives
- where runtime lives
- which checks matter
- which role should look at what
- what can be changed safely
- what must stay private

## Safety Model

Agents may usually do these without extra approval:

- inspect code and docs
- run non-destructive checks and tests
- draft issues, plans, reports, and docs
- suggest refactors
- update generic documentation

Agents should ask before:

- deploying
- deleting files or branches
- changing secrets, private data paths, or credentials
- merging long-lived branches
- making broad rewrites across projects
- changing automation schedules

Never commit:

- private finance data
- real account data
- passwords, API keys, SSH keys
- personal hostnames, private Tailscale domains, or LAN IPs
- filled local setup files

## Core Files

- `project-inventory.yaml`: repo-neutral project list and responsibilities
- `repo-registry.template.yaml`: template for tracking all repos without committing private details
- `platform-architecture.md`: target architecture for repo management, NAS runtime, deploys, and agents
- `operating-rules.md`: global rules for agents and maintainers
- `roles/`: role playbooks for specialized review and execution
- `workflows/`: repeatable project workflows
- `reports/`: templates for agent output

## Default Operating Loop

1. Read `project-inventory.yaml`.
2. If work spans external repos, consult a private filled copy of `repo-registry.template.yaml`.
3. Pick the relevant project or role.
4. Read the project README plus `STATUS.md` if present.
5. Run the smallest meaningful checks.
6. Report findings in a short, actionable format.
7. Only edit files when the requested task clearly needs it.
8. Keep private values out of Git.
