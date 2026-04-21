# Workflow: Service Onboarding

Goal:

- bring a repo from "code exists" to "service can run on NAS safely"

Steps:

1. Identify service purpose and owner project.
2. Add or update README.
3. Define runtime:
   - command
   - port
   - env vars
   - data volume
   - health endpoint
4. Add deploy docs.
5. Add deploy script or launcher if appropriate.
6. Add health check.
7. Add backup expectations for live data.
8. Add service to private repo registry.
9. Only then consider automatic deployment.

Required before auto-deploy:

- tests or smoke checks
- stable runtime config
- health check
- rollback/restart instruction
- no secrets in Git
