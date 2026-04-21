# Workflow: New Device Setup

Goal:

- make a new Mac capable of working on and deploying projects without committing private values

Steps:

1. Clone the workspace repo.
2. Read `ops/README.md`.
3. Read `ops/project-inventory.yaml`.
4. For Synology deploy of Home Ops Finance, read:
   - `projects/home-ops-finance/docs/deployment-macos-setup.md`
   - `projects/home-ops-finance/docs/deployment-synology.md`
5. Copy private templates into a private location and fill them there.
6. Install local deploy tooling only on that device.
7. Verify SSH/Tailscale locally.

Never commit:

- filled `.deploy.local.env`
- filled private setup templates
- private hostnames, IPs, usernames, or key paths
