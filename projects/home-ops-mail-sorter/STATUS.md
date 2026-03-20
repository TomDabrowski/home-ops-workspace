# Status

## Current Phase

Foundation MVP

## Status Summary

- Project folder created.
- Initial scope and MVP captured.
- Local TypeScript scaffold added.
- First sample-driven classifier and CLI added in suggestion-only mode.
- Baseline tests cover category and action suggestions.
- Manual review decisions can now be stored and reused as sender-based hints.
- Action folders are configurable through tracked mailbox defaults.
- CLI can now read JSON samples, single `.eml` files, and `.eml` export folders.
- Suggestion reports now expose category summaries and optional JSON output.

## Immediate Next Step

Expand review-state learning beyond exact sender matches and add richer mailbox export parsing.

## Notes

- Keep commits small and milestone-based.
- Update this file whenever scope or progress changes.
- Delay IMAP until the local sample workflow feels right.
- Continue to prefer suggestion-first behavior even when learned hints exist.
