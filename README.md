# Finance

Workspace for finance and home-ops tools, with a focus on local-first workflows, private data handling, and conservative automation.

The repository contains code, example data, and project notes only. Real spreadsheets, generated reports, and account credentials are intentionally kept out of version control.

## Layout

- `ops`: personal DevOps platform docs for agent roles, repo inventory, NAS runtime, workflows, and reports
- `projects/home-ops-finance`: finance tracker, import tooling, reports, and local dashboard
- `projects/home-ops-subscriptions`: recurring cost and invoice tracking
- `projects/home-ops-backup-control`: backup verification tooling
- `projects/home-ops-watcher`: home lab monitoring
- `projects/home-ops-dashboard`: shared household dashboard ideas
- `projects/home-ops-media-organizer`: media and file organization tooling
- `projects/home-ops-mail-sorter`: mail classification and sorting

## Repository Notes

- Example paths in this repo are placeholders.
- Example JSON and mail samples are sanitized for development and testing.
- See `.gitignore` for the default local-only files that should stay untracked.
- See `ops/` for cross-project operating rules and role playbooks.

## Local Finance Data

`projects/home-ops-finance` can keep private workbook exports and generated JSON outside the repo, for example on a NAS mount.

Create a local-only config at `projects/home-ops-finance/config.local.json`:

```json
{
  "dataDir": "/Volumes/FinanceData/home-ops-finance",
  "workbookPath": "/Volumes/FinanceData/finance-workbook.xlsx"
}
```

Behavior:

- `dataDir` becomes the default location for import drafts, reports, monthly plans, reviewed artifacts, and local review state files.
- `workbookPath` becomes the default workbook import source for `projects/home-ops-finance/src/workbook-importer.ts`.
- `HOME_OPS_FINANCE_DATA_DIR` and `HOME_OPS_FINANCE_WORKBOOK_PATH` override the config file when set.

If a configured NAS path is unavailable, the finance scripts fail with a clear error instead of silently writing private data into the repo.
