# TODO

## Now

- Continue splitting the finance logic more clearly into `core`, `adapters`, and `ui` responsibilities.
- After the new `src/monthly-forecast-routing.ts` extraction, continue carving the remaining heavier month calculation branches out of `src/monthly-engine.ts` now that the planning helpers, consistency rules, and forecast routing each live in their own modules.
- Reduce duplicated business logic between `src/monthly-engine.ts` and `app/app.js`.
- Add schema validation at persistence and import boundaries before the saved JSON shapes grow further.
- Keep the UI thin: render and trigger actions, but avoid putting new finance rules into browser-only code.
- Continue tightening layout stability, especially tooltips, sticky bars, and wide tables in developer mode.
- Keep the retirement and projection assumptions visible anywhere projected values are shown.

## Next

- Add a real post-target drawdown phase after the retirement target month instead of stopping at the nest-egg checkpoint.
- Split conservative cost growth into more explicit buckets where useful, especially insurance and other fixed costs.
- Decide whether imported historical entries should become directly editable in the month workspace or remain review-only with overrides.
- Add stronger workbook-vs-app comparison checks for wealth buckets and monthly handoff points.
- Add lightweight charts for wealth path, safety vs. investment, and long-range target progress.

## Later

- Add account balance history.
- Add smarter categorization helpers.
- Revisit whether the local JSON persistence should stay file-based or move to a stricter small local store once the domain model stabilizes.
