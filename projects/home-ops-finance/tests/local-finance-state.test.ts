// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import { createLocalFinanceStateTools } from "../app/shared/local-finance-state.js";

test("baseline summary and profiles follow local investment overrides", () => {
  const tools = createLocalFinanceStateTools({
    monthFromDate: (date) => String(date).slice(0, 7),
    incomeMonthKey: (entry) => String(entry.entryDate).slice(0, 7),
    compareMonthKeys: (left, right) => left.localeCompare(right),
    uniqueMonthKeys: (incomeEntries, expenseEntries) =>
      [...new Set([...incomeEntries, ...expenseEntries].map((entry) => String(entry.entryDate).slice(0, 7)))].sort(),
    assumptionNumber: (_draft, _key, fallback) => fallback,
    assumptionString: (_draft, _key, fallback) => fallback,
    roundCurrency: (value) => Math.round(value * 100) / 100,
    wealthSnapshotCashAccounts: () => ({}),
    wealthSnapshotCashTotalForEntry: () => 0,
    readMonthlyExpenseOverrides: () => [],
    readMonthlyMusicIncomeOverrides: () => [],
    readWealthSnapshots: () => [],
    readSalarySettings: () => [],
    readBaselineOverrides: () => [
      {
        id: "override-invest",
        label: "Investment",
        amount: 1500,
        effectiveFrom: "2026-03",
        sourceLineItemId: "invest",
        category: "savings",
        isActive: true,
      },
    ],
  });

  const result = tools.applyLocalWorkflowState({
    draftReport: {
      totals: {},
      topExpenseMonths: [],
      topIncomeMonths: [],
      baselineProfiles: [],
      recentMonths: [],
      latestDebtBalances: [],
    },
    monthlyPlan: { rows: [] },
    importDraft: {
      workbookPath: "/tmp/example.xlsx",
      incomeEntries: [{ id: "income-1", entryDate: "2026-03-01", amount: 0, reserveAmount: 0, availableAmount: 0, incomeStreamId: "salary" }],
      expenseEntries: [{ id: "expense-1", entryDate: "2026-03-01", amount: 0 }],
      debtSnapshots: [],
      forecastWealthAnchors: [],
      monthlyBaselines: [
        {
          monthKey: "2026-03",
          netSalaryAmount: 3000,
          fixedExpensesAmount: 1000,
          baselineVariableAmount: 200,
          plannedSavingsAmount: 1050,
          availableBeforeIrregulars: 750,
          annualReserveAmount: 0,
        },
      ],
      baselineLineItems: [
        { id: "fixed", label: "Rent", amount: 1000, category: "fixed", effectiveFrom: "2026-03" },
        { id: "variable", label: "Food", amount: 200, category: "variable", effectiveFrom: "2026-03" },
        { id: "invest", label: "Investment", amount: 1050, category: "savings", effectiveFrom: "2026-03" },
      ],
      wealthBuckets: [
        { kind: "safety", currentAmount: 0, expectedAnnualReturn: 0 },
        { kind: "investment", currentAmount: 0, expectedAnnualReturn: 0 },
      ],
    },
  });

  assert.equal(result.monthlyPlan.rows[0].plannedSavingsAmount, 1500);
  assert.equal(result.draftReport.baselineSummary.plannedSavingsAmount, 1500);
  assert.equal(result.draftReport.baselineSummary.availableBeforeIrregulars, 300);
  assert.equal(result.draftReport.baselineProfiles[0].plannedSavingsAmount, 1500);
  assert.equal(result.draftReport.baselineProfiles[0].availableBeforeIrregulars, 300);
});
