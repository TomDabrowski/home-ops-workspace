import test from "node:test";
import assert from "node:assert/strict";

import type { ImportDraft } from "../src/types.js";
import {
  buildMonthReview,
  buildMonthlyRows,
  selectBaselineForMonth,
  selectBaselineLineItemsForMonth,
  selectExpenseEntriesForMonth,
  selectIncomeEntriesForMonth,
  sumLineItems,
} from "../src/monthly-engine.ts";

function createDraft(): ImportDraft {
  return {
    source: "xlsx",
    workbookPath: "/tmp/example.xlsx",
    sheets: [],
    forecastAssumptions: [
      { key: "safety_threshold", value: 10000, valueType: "number" },
      { key: "music_threshold", value: 10000, valueType: "number" },
      { key: "music_investment_share_after_threshold", value: 0.6, valueType: "number" },
      { key: "music_safety_share_after_threshold", value: 0.4, valueType: "number" },
    ],
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
        incomeStreamId: "music-income",
        entryDate: "2024-01-01",
        amount: 500,
        reserveAmount: 150,
        availableAmount: 350,
        kind: "music",
        isRecurring: false,
        isPlanned: false,
      },
      {
        id: "music-2026-03",
        incomeStreamId: "music-income",
        entryDate: "2026-03-01",
        amount: 700,
        reserveAmount: 210,
        availableAmount: 490,
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
    wealthBuckets: [
      {
        id: "safety-bucket",
        name: "Sicherheitsbaustein",
        kind: "safety",
        targetAmount: 10000,
        currentAmount: 9916,
        expectedAnnualReturn: 0.02,
        isThresholdBucket: true,
      },
      {
        id: "investment-bucket",
        name: "Renditebaustein",
        kind: "investment",
        currentAmount: 9916,
        expectedAnnualReturn: 0.05,
        isThresholdBucket: false,
      },
    ],
    forecastWealthAnchors: [],
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
  assert.equal(historical?.baselineAnchorDeltaAmount, 0);
  assert.equal(historical?.importedIncomeAmount, 500);
  assert.equal(historical?.importedIncomeAvailableAmount, 350);
  assert.equal(historical?.netAfterImportedFlows, 1583.51);
  assert.equal(historical?.consistencySignals.length, 0);

  assert.equal(investing?.baselineProfile, "forecast_investing");
  assert.equal(investing?.baselineAvailableAmount, 283.51);
  assert.equal(investing?.importedIncomeReserveAmount, 210);
  assert.equal(investing?.importedIncomeAvailableAmount, 490);
  assert.equal(investing?.musicAllocationToSafetyAmount, 700);
  assert.equal(investing?.musicAllocationToInvestmentAmount, 0);
  assert.equal(investing?.netAfterImportedFlows, 473.51);
  assert.equal(investing?.consistencySignals.length, 1);
  assert.deepEqual(
    investing?.consistencySignals.map((signal) => signal.code),
    ["expense_over_baseline_available"],
  );
});

test("selects imported flows for a specific month", () => {
  const draft = createDraft();

  assert.equal(selectIncomeEntriesForMonth(draft.incomeEntries, "2024-01").length, 1);
  assert.equal(selectExpenseEntriesForMonth(draft.expenseEntries, "2024-01").length, 1);
  assert.equal(selectIncomeEntriesForMonth(draft.incomeEntries, "2025-02").length, 0);
});

test("builds a month review with baseline and imported flows", () => {
  const review = buildMonthReview(createDraft(), "2026-03");

  assert.ok(review);
  assert.equal(review?.row.monthKey, "2026-03");
  assert.equal(review?.baselineLineItems.length, 12);
  assert.equal(review?.incomeEntries.length, 1);
  assert.equal(review?.expenseEntries.length, 1);
  assert.equal(review?.row.baselineAvailableAmount, 283.51);
  assert.equal(review?.row.safetyBucketStartAmount, 9916);
  assert.equal(review?.row.safetyBucketEndAmount, 10632.53);
  assert.deepEqual(
    review?.row.consistencySignals.map((signal) => signal.title),
    ["Importierte Ausgaben uebersteigen freie Baseline"],
  );
});

test("flags anchor mismatches and negative months automatically", () => {
  const draft = createDraft();
  draft.baselineLineItems = draft.baselineLineItems.map((item) =>
    item.id === "invest" ? { ...item, amount: 900 } : item,
  );
  draft.expenseEntries.push({
    id: "expense-2026-03-spike",
    entryDate: "2026-03-15",
    description: "Unexpected repair",
    amount: 1300,
    expenseCategoryId: "other",
    expenseType: "variable",
    isRecurring: false,
    isPlanned: false,
  });

  const row = buildMonthlyRows(draft).find((item) => item.monthKey === "2026-03");

  assert.ok(row);
  assert.equal(row?.baselineAnchorDeltaAmount, 150);
  assert.equal(row?.netAfterImportedFlows, -676.49);
  assert.deepEqual(
    row?.consistencySignals.map((signal) => signal.code),
    ["baseline_anchor_mismatch", "monthly_deficit", "expense_over_baseline_available", "expense_spike"],
  );
});

test("respects explicit workbook wealth anchors before continuing the forecast", () => {
  const draft = createDraft();
  draft.incomeEntries.push({
    id: "music-2026-02",
    incomeStreamId: "music-income",
    entryDate: "2026-02-01",
    amount: 600,
    reserveAmount: 180,
    availableAmount: 420,
    kind: "music",
    isRecurring: false,
    isPlanned: true,
  });
  draft.expenseEntries.push({
    id: "expense-2026-02",
    entryDate: "2026-02-01",
    description: "Forecast",
    amount: 250,
    expenseCategoryId: "other",
    expenseType: "variable",
    isRecurring: false,
    isPlanned: true,
  });
  draft.forecastWealthAnchors = [
    {
      monthKey: "2026-02",
      safetyBucketAmount: 6300,
      investmentBucketAmount: 12077,
      totalWealthAmount: 18377,
      sourceSheet: "Übersicht Vermögen",
      sourceRowNumber: 38,
      isManualAnchor: true,
    },
  ];

  const rows = buildMonthlyRows(draft);
  const anchored = rows.find((row) => row.monthKey === "2026-02");
  const continued = rows.find((row) => row.monthKey === "2026-03");

  assert.ok(anchored);
  assert.ok(continued);
  assert.equal(anchored?.safetyBucketEndAmount, 6300);
  assert.equal(anchored?.investmentBucketEndAmount, 12077);
  assert.equal(anchored?.projectedWealthEndAmount, 18377);
  assert.equal(continued?.safetyBucketStartAmount, 6300);
  assert.equal(continued?.investmentBucketStartAmount, 12077);
});
