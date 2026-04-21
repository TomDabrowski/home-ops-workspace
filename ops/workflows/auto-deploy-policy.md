# Workflow: Auto-Deploy Policy

Goal:

- define when automatic deployment is acceptable.

Default:

- automatic deploy is off
- one-click/manual deploy is preferred until a project is mature

Auto-deploy may be enabled only when:

- `main` is protected by meaningful checks
- test command exists
- deploy script is repeatable
- health check exists
- live data path is external and stable
- rollback/restart path is documented
- secrets are not read from Git

Suggested gate:

1. pull latest `main`
2. run project checks
3. build artifact/image
4. deploy to NAS
5. run health check
6. report result

Never auto-deploy:

- data migrations without approval
- destructive changes
- first deployment of a service
- changes involving secrets
- services without a health check
