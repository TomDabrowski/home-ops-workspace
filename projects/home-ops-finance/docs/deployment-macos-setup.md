# macOS Setup For Deploy

Use this when a second Mac should be able to deploy `home-ops-finance` to the same Synology target.

This file intentionally stays generic.

Do not store private values such as:

- personal NAS IPs
- private Tailscale hostnames
- usernames
- SSH key paths
- passwords
- iCloud paths

Keep those in a separate private note outside the repo.

## Goal

After setup, the second Mac should be able to:

- open the repo
- install the local deploy app
- deploy to Synology
- reach the running app through LAN or Tailscale

## What Is Shared vs Local

Shared through the repo:

- app code
- deploy scripts
- deploy app installer
- generic deployment docs

Shared outside the repo:

- Synology live data directory
- Git remote

Still local per Mac:

- Tailscale login
- SSH key / SSH agent access
- SSH config
- macOS keychain entry for the Synology sudo password
- installed `Home Ops Finance Deploy.app`

## Setup Steps On A New Mac

1. Clone the repo and open:

```bash
cd /path/to/finance/projects/home-ops-finance
```

2. Make sure these tools are available:

- Git
- Node / npm
- Tailscale
- SSH access to the Synology target

3. Create the local deploy config:

```bash
cp .deploy.local.example.env .deploy.local.env
```

4. Fill in the local values in `.deploy.local.env`.

This file is local-only and must not be committed.

5. Install the local deploy app:

```bash
./scripts/install-deploy-launcher.sh
```

6. Open the deploy app once:

- `~/Applications/Home Ops Finance Deploy.app`

Expected first-run behavior:

- macOS may ask for app permissions
- the Synology sudo password may be requested
- you can store that password in the macOS keychain

## Verify The Device

Before the first real deploy, verify:

- Tailscale is connected
- SSH to the Synology works
- the deploy app opens

After the first deploy, verify:

- the container restarts cleanly
- the app loads through LAN or Tailscale
- the mounted Synology data is still intact

## Troubleshooting

If the deploy app opens but cannot deploy:

- check `.deploy.local.env`
- check that Tailscale is connected
- check that SSH is available on this Mac
- check that the Synology sudo password is still valid in the keychain

If the app is missing on the second Mac:

- run `./scripts/install-deploy-launcher.sh` again

If deploy works but the app is not reachable:

- verify the Synology container is running
- verify the app is reachable on port `4310`
- prefer the running container, not an old Synology project entry
