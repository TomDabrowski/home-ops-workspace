import test from "node:test";
import assert from "node:assert/strict";

import type { ImportDraft } from "../src/types.js";
import {
  buildMonthlyRows,
  selectBaselineForMonth,
  selectBaselineLineItemsForMonth,
  sumLineItems,
} from "../src/monthly-engine.ts";

function createDraft(): ImportDraft {
  return {
    source: "xlsx",
    workbookPath: "/tmp/example.xlsx",
    sheets: [],
    forecastAssumptions: [],
    monthlyBaselines: [
      {
        monthKey: "2023-01",
        netSalaryAmount: 2920,
        fixedExpensesAmount: 1266.49,
        baselineVariableAmount: 320,
        plannedSavingsAmount: 0,
        availableBeforeIrregulars: 1333.51,
        annualReserveAmount: 102.08,
      },
      {
        monthKey: "2026-03",
        netSalaryAmount: 2920,
        fixedExpensesAmount: 1266.49,
        baselineVariableAmount: 320,
        plannedSavingsAmount: 1050,
        availableBeforeIrregulars: 283.51,
        annualReserveAmount: 102.08,
      },
    ],
    baselineLineItems: [
      { id: "rent", label: "Miete", amount: 1080, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "phone", label: "Handy", amount: 5, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "power", label: "Strom", amount: 84, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "internet", label: "Internet", amount: 29.99, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "sub", label: "ChatGPT", amount: 20.5, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "misc-fixed", label: "Patreon", amount: 11, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "other-fixed", label: "Robby", amount: 6, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "freedom", label: "Freiheit+", amount: 30, category: "fixed", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "food", label: "Essen", amount: 120, category: "variable", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "other", label: "Sonstiges", amount: 200, category: "variable", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "reserve", label: "Ruecklage", amount: 102.08, category: "annual_reserve", cadence: "monthly", effectiveFrom: "2023-01" },
      { id: "invest", label: "Investment", amount: 1050, category: "savings", cadence: "monthly", effectiveFrom: "2026-03" },
    ],
    incomeStreams: [],
    incomeEntries: [
      {
        id: "music-2024-01",
        incomeStreamId: "music",
        entryDate: "2024-01-01",
        amount: 500,
        kind: "music",
        isRecurring: false,
        isPlanned: false,
      },
      {
        id: "music-2026-03",
        incomeStreamId: "music",
        entryDate: "2026-03-01",
        amount: 700,
        kind: "music",
        isRecurring: false,
        isPlanned: true,
      },
    ],
    expenseCategories: [],
    expenseEntries: [
      {
        id: "expense-2024-01",
        entryDate: "2024-01-01",
        description: "Example",
        amount: 100,
        expenseCategoryId: "other",
        expenseType: "variable",
        isRecurring: false,
        isPlanned: false,
      },
      {
        id: "expense-2026-03",
        entryDate: "2026-03-01",
        description: "Example",
        amount: 300,
        expenseCategoryId: "other",
        expenseType: "variable",
        isRecurring: false,
        isPlanned: true,
      },
    ],
    wealthBuckets: [],
    debtAccounts: [],
    debtSnapshots: [],
  };
}

test("selects the correct baseline phase for a month", () => {
  const draft = createDraft();
  assert.equal(selectBaselineForMonth(draft.monthlyBaselines, "2024-06").monthKey, "2023-01");
  assert.equal(selectBaselineForMonth(draft.monthlyBaselines, "2026-03").monthKey, "2026-03");
});

test("applies line items by effective month", () => {
  const draft = createDraft();
  const beforeInvesting = selectBaselineLineItemsForMonth(draft.baselineLineItems, "2024-01");
  const afterInvesting = selectBaselineLineItemsForMonth(draft.baselineLineItems, "2026-03");

  assert.equal(sumLineItems(beforeInvesting, "savings"), 0);
  assert.equal(sumLineItems(afterInvesting, "savings"), 1050);
  assert.equal(sumLineItems(beforeInvesting, "fixed"), 1266.49);
});

test("builds monthly rows with historical and investing profiles", () => {
  const rows = buildMonthlyRows(createDraft());
  const historical = rows.find((row) => row.monthKey === "2024-01");
  const investing = rows.find((row) => row.monthKey === "2026-03");

  assert.ok(historical);
  assert.ok(investing);

  assert.equal(historical?.baselineProfile, "historical_liquidity");
  assert.equal(historical?.baselineAvailableAmount, 1333.51);
  assert.equal(historical?.netAfterImportedFlows, 1733.51);

  assert.equal(investing?.baselineProfile, "forecast_investing");
  assert.equal(investing?.baselineAvailableAmount, 283.51);
  assert.equal(investing?.netAfterImportedFlows, 683.51);
});
