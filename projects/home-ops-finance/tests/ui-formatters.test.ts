// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import { renderDetailEntries } from "../app/shared/ui-formatters.js";

test("detail entries render hover tooltips even without developer mode", () => {
  const html = renderDetailEntries(
    [
      {
        label: "Investment",
        value: "14.587,56 EUR",
        formula: "13.537,56 EUR Snapshot + 1.050,00 EUR Basis-Investment = 14.587,56 EUR",
      },
    ],
    {
      readDeveloperMode: () => false,
      readFormulaTooltipsEnabled: () => true,
      escapeHtml: (value: string) =>
        String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\"", "&quot;"),
    },
  );

  assert.match(html, /has-tooltip/);
  assert.match(html, /13\.537,56 EUR Snapshot/);
  assert.doesNotMatch(html, /detail-formula/);
});

test("detail entries omit hover tooltips when tooltip setting is disabled", () => {
  const html = renderDetailEntries(
    [
      {
        label: "Investment",
        value: "14.587,56 EUR",
        formula: "13.537,56 EUR Snapshot + 1.050,00 EUR Basis-Investment = 14.587,56 EUR",
      },
    ],
    {
      readDeveloperMode: () => false,
      readFormulaTooltipsEnabled: () => false,
      escapeHtml: (value: string) => String(value),
    },
  );

  assert.doesNotMatch(html, /has-tooltip/);
});
