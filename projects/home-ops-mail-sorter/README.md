# Home Ops Mail Sorter

Mail classifier that suggests sorting actions without relying on a pile of manual rules.

## MVP

- Read messages from a mailbox via IMAP later, but start with exported samples.
- Classify emails into a small set of useful categories.
- Suggest actions before applying them automatically.
- Capture decisions for future learning.

## First Build Slice

- Load sample emails from local JSON.
- Score each message against a compact category set.
- Print suggestion-only actions with confidence and reasons.
- Keep the architecture ready for a future IMAP adapter.
- Store manual review decisions and reuse them as sender-based hints.

## Current Project Files

- `data/sample-mails.json`: tracked starter messages for local development
- `data/sample-eml/`: starter `.eml` exports for import-path testing
- `data/mailbox-config.json`: category-to-action and folder defaults
- `data/review-state.json`: accepted review decisions and learned sender hints
- `src/types.ts`: shared mail, suggestion, and report types
- `src/classifier.ts`: first scoring-based category classifier
- `src/mail-loader.ts`: loads JSON samples, single `.eml` files, or `.eml` folders
- `src/review-state.ts`: decision storage and sender rule extraction
- `src/report.ts`: terminal-friendly suggestion rendering
- `src/cli.ts`: local entry point for classifying sample data
- `tests/classifier.test.ts`: baseline behavior coverage
- `tests/review-state.test.ts`: coverage for learned sender decisions

## Local Commands

```bash
npm install
npm run typecheck
npm test
npm run suggest
npm run suggest -- data/sample-mails.json
npm run suggest -- data/sample-eml
npm run suggest -- data/sample-eml --format json
npm run review:record -- msg-electricity-01 finance_bill review_finance "Finance/Utilities" data/sample-mails.json
```

`suggest` now accepts a `.json` file, a single `.eml` file, or a directory full of `.eml` files.
Use `--format json` for machine-readable output on `stdout`.

`review:record` stores a manual decision in `data/review-state.json`. Future `suggest` runs then use those saved decisions as sender-based hints before falling back to keyword scoring.

## Next Steps

- Add a safer review UI on top of the current CLI flow.
- Expand learned rules beyond exact senders to domains and recurring patterns.
- Introduce an IMAP reader once the local export flow feels stable.
