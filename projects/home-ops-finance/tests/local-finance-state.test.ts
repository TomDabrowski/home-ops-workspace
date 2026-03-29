import test from "node:test";
import assert from "node:assert/strict";

// Shared browser/local-state modules intentionally stay in JS; runtime coverage matters here.
// @ts-ignore
import { createLocalFinanceStateTools } from "../app/shared/local-finance-state.js";

test("latest active wealth snapshot for a month wins when building local anchors", () => {
  const tools = createLocalFinanceStateTools({
    monthFromDate(value: string) {
      return String(value).slice(0, 7);
    },
    incomeMonthKey(entry: { monthKey?: string; entryDate?: string }) {
      return entry.monthKey || String(entry.entryDate ?? "").slice(0, 7);
    },
    compareMonthKeys(left: string, right: string) {
      return String(left).localeCompare(String(right));
    },
    uniqueMonthKeys() {
      return ["2026-03", "2026-04"];
    },
    assumptionNumber(_draft: unknown, _key: string, fallback: number) {
      return fallback;
    },
    assumptionString(_draft: unknown, _key: string, fallback: string) {
      return fallback;
    },
    roundCurrency(value: number) {
      return Math.round(value * 100) / 100;
    },
    wealthSnapshotCashAccounts(entry: { cashAccounts?: Record<string, number> }) {
      return entry.cashAccounts ?? {};
    },
    wealthSnapshotCashTotalForEntry(entry: { cashAmount?: number }) {
      return Number(entry.cashAmount ?? 0);
    },
    readMonthlyExpenseOverrides() {
      return [];
    },
    readMonthlyMusicIncomeOverrides() {
      return [];
    },
    readWealthSnapshots() {
      return [
        {
          id: "old",
          snapshotDate: "2026-03-25T20:36",
          cashAmount: 11024.39,
          cashAccounts: { giro: 731.89, cash: 292.5, savings: 10000 },
          investmentAmount: 9200,
          isActive: true,
        },
        {
          id: "new",
          snapshotDate: "2026-03-27T08:57",
          cashAmount: 11024.39,
          cashAccounts: { giro: 731.89, cash: 292.5, savings: 10000 },
          investmentAmount: 13537.56,
          isActive: true,
        },
      ];
    },
    readSalarySettings() {
      return [];
    },
    readBaselineOverrides() {
      return [];
    },
  });

  const state = tools.applyLocalWorkflowState({
    draftReport: {},
    monthlyPlan: { rows: [] },
    accounts: [],
    importDraft: {
      workbookPath: "",
      incomeEntries: [
        {
          id: "salary-april",
          entryDate: "2026-04-01",
          amount: 2800,
          reserveAmount: 0,
          availableAmount: 2800,
          isPlanned: true,
        },
      ],
      expenseEntries: [
        {
          id: "activate-april-forecast",
          entryDate: "2026-04-01",
          amount: 0,
          isPlanned: true,
        },
      ],
      debtSnapshots: [],
      forecastAssumptions: [],
      wealthBuckets: [
        { kind: "safety", currentAmount: 0, expectedAnnualReturn: 0 },
        { kind: "investment", currentAmount: 0, expectedAnnualReturn: 0 },
      ],
      monthlyBaselines: [
        {
          monthKey: "2026-03",
          netSalaryAmount: 2800,
          fixedExpensesAmount: 1000,
          baselineVariableAmount: 500,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1000,
          availableBeforeIrregulars: 300,
        },
        {
          monthKey: "2026-04",
          netSalaryAmount: 2800,
          fixedExpensesAmount: 1000,
          baselineVariableAmount: 500,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1000,
          availableBeforeIrregulars: 300,
        },
      ],
      baselineLineItems: [
        { id: "fixed", label: "Fix", amount: 1000, category: "fixed", effectiveFrom: "2026-03" },
        { id: "variable", label: "Var", amount: 500, category: "variable", effectiveFrom: "2026-03" },
        { id: "save", label: "Save", amount: 1000, category: "savings", effectiveFrom: "2026-03" },
      ],
      forecastWealthAnchors: [],
    },
  });

  const marchAnchor = state.importDraft.forecastWealthAnchors.find((entry: { monthKey: string }) => entry.monthKey === "2026-03");
  assert.ok(marchAnchor);
  assert.equal(marchAnchor.snapshotDate, "2026-03-27T08:57");
  assert.equal(marchAnchor.investmentBucketAmount, 13537.56);
});

test("month-start wealth anchors use the saved snapshot as the opening value for that month", () => {
  const tools = createLocalFinanceStateTools({
    monthFromDate(value: string) {
      return String(value).slice(0, 7);
    },
    incomeMonthKey(entry: { monthKey?: string; entryDate?: string }) {
      return entry.monthKey || String(entry.entryDate ?? "").slice(0, 7);
    },
    compareMonthKeys(left: string, right: string) {
      return String(left).localeCompare(String(right));
    },
    uniqueMonthKeys() {
      return ["2026-03", "2026-04"];
    },
    assumptionNumber(_draft: unknown, _key: string, fallback: number) {
      return fallback;
    },
    assumptionString(_draft: unknown, _key: string, fallback: string) {
      return fallback;
    },
    roundCurrency(value: number) {
      return Math.round(value * 100) / 100;
    },
    wealthSnapshotCashAccounts(entry: { cashAccounts?: Record<string, number> }) {
      return entry.cashAccounts ?? {};
    },
    wealthSnapshotCashTotalForEntry(entry: { cashAmount?: number }) {
      return Number(entry.cashAmount ?? 0);
    },
    readMonthlyExpenseOverrides() {
      return [];
    },
    readMonthlyMusicIncomeOverrides() {
      return [];
    },
    readWealthSnapshots() {
      return [
        {
          id: "month-start",
          snapshotDate: "2026-03-27T08:57",
          anchorMonthKey: "2026-04",
          cashAmount: 11024.39,
          cashAccounts: { giro: 731.89, cash: 292.5, savings: 10000 },
          investmentAmount: 13537.56,
          isActive: true,
        },
      ];
    },
    readSalarySettings() {
      return [];
    },
    readBaselineOverrides() {
      return [];
    },
  });

  const state = tools.applyLocalWorkflowState({
    draftReport: {},
    monthlyPlan: { rows: [] },
    accounts: [],
    importDraft: {
      workbookPath: "",
      incomeEntries: [
        {
          id: "salary-april",
          entryDate: "2026-04-01",
          amount: 2800,
          reserveAmount: 0,
          availableAmount: 2800,
          isPlanned: true,
        },
      ],
      expenseEntries: [],
      debtSnapshots: [],
      forecastAssumptions: [],
      wealthBuckets: [
        { kind: "safety", currentAmount: 0, expectedAnnualReturn: 0 },
        { kind: "investment", currentAmount: 0, expectedAnnualReturn: 0 },
      ],
      monthlyBaselines: [
        {
          monthKey: "2026-03",
          netSalaryAmount: 2800,
          fixedExpensesAmount: 1000,
          baselineVariableAmount: 500,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1000,
          availableBeforeIrregulars: 300,
        },
        {
          monthKey: "2026-04",
          netSalaryAmount: 2800,
          fixedExpensesAmount: 1000,
          baselineVariableAmount: 500,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1000,
          availableBeforeIrregulars: 300,
        },
      ],
      baselineLineItems: [
        { id: "fixed", label: "Fix", amount: 1000, category: "fixed", effectiveFrom: "2026-03" },
        { id: "variable", label: "Var", amount: 500, category: "variable", effectiveFrom: "2026-03" },
        { id: "save", label: "Save", amount: 1000, category: "savings", effectiveFrom: "2026-03" },
      ],
      forecastWealthAnchors: [],
    },
  });

  const aprilRow = state.monthlyPlan.rows.find((entry: { monthKey: string }) => entry.monthKey === "2026-04");
  assert.ok(aprilRow);
  assert.equal(aprilRow.anchorMode, "month_start");
  assert.equal(aprilRow.anchorAppliesAtMonthStart, true);
  assert.equal(aprilRow.anchorAppliesWithinMonth, false);
  assert.equal(aprilRow.safetyBucketStartAmount, 11024.39);
  assert.equal(aprilRow.investmentBucketStartAmount, 13537.56);
});

test("late pre-month snapshots infer a month-start anchor for the next month when pre-month entries already belong to it", () => {
  const tools = createLocalFinanceStateTools({
    monthFromDate(value: string) {
      return String(value).slice(0, 7);
    },
    incomeMonthKey(entry: { monthKey?: string; entryDate?: string }) {
      return entry.monthKey || String(entry.entryDate ?? "").slice(0, 7);
    },
    compareMonthKeys(left: string, right: string) {
      return String(left).localeCompare(String(right));
    },
    uniqueMonthKeys() {
      return ["2026-03", "2026-04"];
    },
    assumptionNumber(_draft: unknown, _key: string, fallback: number) {
      return fallback;
    },
    assumptionString(_draft: unknown, _key: string, fallback: string) {
      return fallback;
    },
    roundCurrency(value: number) {
      return Math.round(value * 100) / 100;
    },
    wealthSnapshotCashAccounts(entry: { cashAccounts?: Record<string, number> }) {
      return entry.cashAccounts ?? {};
    },
    wealthSnapshotCashTotalForEntry(entry: { cashAmount?: number }) {
      return Number(entry.cashAmount ?? 0);
    },
    readMonthlyExpenseOverrides() {
      return [];
    },
    readMonthlyMusicIncomeOverrides() {
      return [];
    },
    readWealthSnapshots() {
      return [
        {
          id: "march-late",
          snapshotDate: "2026-03-27T22:32",
          cashAmount: 10172,
          cashAccounts: { giro: 100, cash: 72, savings: 10000 },
          investmentAmount: 13258,
          isActive: true,
        },
      ];
    },
    readSalarySettings() {
      return [];
    },
    readBaselineOverrides() {
      return [];
    },
  });

  const state = tools.applyLocalWorkflowState({
    draftReport: {},
    monthlyPlan: { rows: [] },
    accounts: [],
    importDraft: {
      workbookPath: "",
      incomeEntries: [
        {
          id: "music-april-early",
          incomeStreamId: "music-income",
          monthKey: "2026-04",
          entryDate: "2026-03-25T18:00",
          amount: 1642.65,
          reserveAmount: 418.86,
          availableAmount: 1223.79,
          isPlanned: false,
        },
      ],
      expenseEntries: [
        {
          id: "activate-april-forecast",
          entryDate: "2026-04-01",
          amount: 0,
          isPlanned: true,
        },
      ],
      debtSnapshots: [],
      forecastAssumptions: [],
      wealthBuckets: [
        { kind: "safety", currentAmount: 0, expectedAnnualReturn: 0 },
        { kind: "investment", currentAmount: 0, expectedAnnualReturn: 0 },
      ],
      monthlyBaselines: [
        {
          monthKey: "2026-03",
          netSalaryAmount: 2706,
          fixedExpensesAmount: 1416.49,
          baselineVariableAmount: 239.51,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1050,
          availableBeforeIrregulars: 0,
        },
        {
          monthKey: "2026-04",
          netSalaryAmount: 2706,
          fixedExpensesAmount: 1416.49,
          baselineVariableAmount: 239.51,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1050,
          availableBeforeIrregulars: 0,
        },
      ],
      baselineLineItems: [
        { id: "fixed", label: "Fix", amount: 1416.49, category: "fixed", effectiveFrom: "2026-03" },
        { id: "variable", label: "Var", amount: 239.51, category: "variable", effectiveFrom: "2026-03" },
        { id: "save", label: "Save", amount: 1050, category: "savings", effectiveFrom: "2026-03" },
      ],
      forecastWealthAnchors: [],
    },
  });

  const aprilRow = state.monthlyPlan.rows.find((entry: { monthKey: string }) => entry.monthKey === "2026-04");
  assert.ok(aprilRow);
  assert.equal(aprilRow.anchorMode, "month_start");
  assert.equal(aprilRow.anchorAppliesAtMonthStart, true);
  assert.equal(aprilRow.safetyBucketStartAmount, 10172);
  assert.equal(aprilRow.investmentBucketStartAmount, 13258);
  assert.equal(aprilRow.projectionIncomeAvailableAmount, 0);
});

test("in-month snapshots do not re-add the full monthly base investment on top of the snapshot", () => {
  const tools = createLocalFinanceStateTools({
    monthFromDate(value: string) {
      return String(value).slice(0, 7);
    },
    incomeMonthKey(entry: { monthKey?: string; entryDate?: string }) {
      return entry.monthKey || String(entry.entryDate ?? "").slice(0, 7);
    },
    compareMonthKeys(left: string, right: string) {
      return String(left).localeCompare(String(right));
    },
    uniqueMonthKeys() {
      return ["2026-03"];
    },
    assumptionNumber(_draft: unknown, _key: string, fallback: number) {
      return fallback;
    },
    assumptionString(_draft: unknown, _key: string, fallback: string) {
      return fallback;
    },
    roundCurrency(value: number) {
      return Math.round(value * 100) / 100;
    },
    wealthSnapshotCashAccounts(entry: { cashAccounts?: Record<string, number> }) {
      return entry.cashAccounts ?? {};
    },
    wealthSnapshotCashTotalForEntry(entry: { cashAmount?: number }) {
      return Number(entry.cashAmount ?? 0);
    },
    readMonthlyExpenseOverrides() {
      return [];
    },
    readMonthlyMusicIncomeOverrides() {
      return [];
    },
    readWealthSnapshots() {
      return [
        {
          id: "march-in-month",
          snapshotDate: "2026-03-27T22:32",
          cashAmount: 10172,
          cashAccounts: { giro: 100, cash: 72, savings: 10000 },
          investmentAmount: 13258,
          isActive: true,
        },
      ];
    },
    readSalarySettings() {
      return [];
    },
    readBaselineOverrides() {
      return [];
    },
  });

  const state = tools.applyLocalWorkflowState({
    draftReport: {},
    monthlyPlan: { rows: [] },
    accounts: [],
    importDraft: {
      workbookPath: "",
      incomeEntries: [
        {
          id: "salary-march",
          entryDate: "2026-03-01",
          amount: 2706,
          reserveAmount: 0,
          availableAmount: 2706,
          isPlanned: true,
        },
      ],
      expenseEntries: [],
      debtSnapshots: [],
      forecastAssumptions: [],
      wealthBuckets: [
        { kind: "safety", currentAmount: 0, expectedAnnualReturn: 0 },
        { kind: "investment", currentAmount: 0, expectedAnnualReturn: 0 },
      ],
      monthlyBaselines: [
        {
          monthKey: "2026-03",
          netSalaryAmount: 2706,
          fixedExpensesAmount: 1416.49,
          baselineVariableAmount: 239.51,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1050,
          availableBeforeIrregulars: 0,
        },
      ],
      baselineLineItems: [
        { id: "fixed", label: "Fix", amount: 1416.49, category: "fixed", effectiveFrom: "2026-03" },
        { id: "variable", label: "Var", amount: 239.51, category: "variable", effectiveFrom: "2026-03" },
        { id: "save", label: "Save", amount: 1050, category: "savings", effectiveFrom: "2026-03" },
      ],
      forecastWealthAnchors: [],
    },
  });

  const marchRow = state.monthlyPlan.rows.find((entry: { monthKey: string }) => entry.monthKey === "2026-03");
  assert.ok(marchRow);
  assert.equal(marchRow.anchorAppliesWithinMonth, true);
  assert.equal(marchRow.projectionSalaryAllocationToInvestmentAmount, 0);
  assert.equal(marchRow.investmentBucketAnchorAmount, 13258);
  assert.equal(marchRow.investmentBucketEndAmount, 13258);
});

test("month-start anchors do not re-add music income that is already captured in the snapshot", () => {
  const tools = createLocalFinanceStateTools({
    monthFromDate(value: string) {
      return String(value).slice(0, 7);
    },
    incomeMonthKey(entry: { monthKey?: string; entryDate?: string }) {
      return entry.monthKey || String(entry.entryDate ?? "").slice(0, 7);
    },
    compareMonthKeys(left: string, right: string) {
      return String(left).localeCompare(String(right));
    },
    uniqueMonthKeys() {
      return ["2026-04"];
    },
    assumptionNumber(_draft: unknown, _key: string, fallback: number) {
      return fallback;
    },
    assumptionString(_draft: unknown, _key: string, fallback: string) {
      return fallback;
    },
    roundCurrency(value: number) {
      return Math.round(value * 100) / 100;
    },
    wealthSnapshotCashAccounts(entry: { cashAccounts?: Record<string, number> }) {
      return entry.cashAccounts ?? {};
    },
    wealthSnapshotCashTotalForEntry(entry: { cashAmount?: number }) {
      return Number(entry.cashAmount ?? 0);
    },
    readMonthlyExpenseOverrides() {
      return [];
    },
    readMonthlyMusicIncomeOverrides() {
      return [];
    },
    readWealthSnapshots() {
      return [
        {
          id: "april-start",
          snapshotDate: "2026-03-27T22:32",
          anchorMonthKey: "2026-04",
          cashAmount: 10172,
          cashAccounts: { giro: 100, cash: 72, savings: 10000 },
          investmentAmount: 13258,
          isActive: true,
        },
      ];
    },
    readSalarySettings() {
      return [];
    },
    readBaselineOverrides() {
      return [];
    },
  });

  const state = tools.applyLocalWorkflowState({
    draftReport: {},
    monthlyPlan: { rows: [] },
    accounts: [],
    importDraft: {
      workbookPath: "",
      incomeEntries: [
        {
          id: "music-april",
          incomeStreamId: "music-income",
          monthKey: "2026-04",
          entryDate: "2026-03-25T18:00",
          amount: 1642.65,
          reserveAmount: 418.86,
          availableAmount: 1223.79,
          isPlanned: false,
        },
      ],
      expenseEntries: [
        {
          id: "activate-april-forecast",
          entryDate: "2026-04-01",
          amount: 0,
          isPlanned: true,
        },
      ],
      debtSnapshots: [],
      forecastAssumptions: [],
      wealthBuckets: [
        { kind: "safety", currentAmount: 0, expectedAnnualReturn: 0 },
        { kind: "investment", currentAmount: 0, expectedAnnualReturn: 0 },
      ],
      monthlyBaselines: [
        {
          monthKey: "2026-04",
          netSalaryAmount: 2920,
          fixedExpensesAmount: 1266.49,
          baselineVariableAmount: 320,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1050,
          availableBeforeIrregulars: 283.51,
        },
      ],
      baselineLineItems: [
        { id: "fixed", label: "Fix", amount: 1266.49, category: "fixed", effectiveFrom: "2026-04" },
        { id: "variable", label: "Var", amount: 320, category: "variable", effectiveFrom: "2026-04" },
        { id: "save", label: "Save", amount: 1050, category: "savings", effectiveFrom: "2026-04" },
      ],
      forecastWealthAnchors: [],
    },
  });

  const aprilRow = state.monthlyPlan.rows.find((entry: { monthKey: string }) => entry.monthKey === "2026-04");
  assert.ok(aprilRow);
  assert.equal(aprilRow.anchorMode, "month_start");
  assert.equal(aprilRow.projectionIncomeAvailableAmount, 0);
  assert.equal(aprilRow.musicAllocationToSafetyAmount, 0);
  assert.equal(aprilRow.musicAllocationToInvestmentAmount, 0);
  assert.equal(aprilRow.investmentBucketEndAmount, 14308);
});

test("month-start anchors without threshold-account detail keep routing against the carried threshold balance", () => {
  const tools = createLocalFinanceStateTools({
    monthFromDate(value: string) {
      return String(value).slice(0, 7);
    },
    incomeMonthKey(entry: { monthKey?: string; entryDate?: string }) {
      return entry.monthKey || String(entry.entryDate ?? "").slice(0, 7);
    },
    compareMonthKeys(left: string, right: string) {
      return String(left).localeCompare(String(right));
    },
    uniqueMonthKeys() {
      return ["2026-03", "2026-04"];
    },
    assumptionNumber(_draft: unknown, _key: string, fallback: number) {
      return fallback;
    },
    assumptionString(_draft: unknown, key: string, fallback: string) {
      return key === "music_threshold_account_id" ? "savings" : fallback;
    },
    roundCurrency(value: number) {
      return Math.round(value * 100) / 100;
    },
    wealthSnapshotCashAccounts(entry: { cashAccounts?: Record<string, number> }) {
      return entry.cashAccounts ?? {};
    },
    wealthSnapshotCashTotalForEntry(entry: { cashAmount?: number }) {
      return Number(entry.cashAmount ?? 0);
    },
    readMonthlyExpenseOverrides() {
      return [];
    },
    readMonthlyMusicIncomeOverrides() {
      return [];
    },
    readWealthSnapshots() {
      return [
        {
          id: "march-anchor",
          snapshotDate: "2026-03-01",
          cashAmount: 12000,
          cashAccounts: { giro: 2800, cash: 700, savings: 8500 },
          investmentAmount: 9916,
          isActive: true,
        },
        {
          id: "april-start",
          snapshotDate: "2026-03-27T22:32",
          anchorMonthKey: "2026-04",
          cashAmount: 10172,
          investmentAmount: 13258,
          isActive: true,
        },
      ];
    },
    readSalarySettings() {
      return [];
    },
    readBaselineOverrides() {
      return [];
    },
  });

  const state = tools.applyLocalWorkflowState({
    draftReport: {},
    monthlyPlan: { rows: [] },
    accounts: [],
    importDraft: {
      workbookPath: "",
      incomeEntries: [
        {
          id: "music-march",
          incomeStreamId: "music-income",
          monthKey: "2026-03",
          entryDate: "2026-03-10",
          amount: 1642.65,
          reserveAmount: 418.86,
          availableAmount: 1223.79,
          isPlanned: false,
        },
        {
          id: "music-april",
          incomeStreamId: "music-income",
          monthKey: "2026-04",
          entryDate: "2026-04-05",
          amount: 1642.65,
          reserveAmount: 418.86,
          availableAmount: 1223.79,
          isPlanned: true,
        },
      ],
      expenseEntries: [
        {
          id: "activate-april-forecast",
          entryDate: "2026-04-01",
          amount: 0,
          isPlanned: true,
        },
      ],
      debtSnapshots: [],
      forecastAssumptions: [],
      wealthBuckets: [
        { kind: "safety", currentAmount: 0, expectedAnnualReturn: 0 },
        { kind: "investment", currentAmount: 0, expectedAnnualReturn: 0 },
      ],
      monthlyBaselines: [
        {
          monthKey: "2026-03",
          netSalaryAmount: 2920,
          fixedExpensesAmount: 1266.49,
          baselineVariableAmount: 320,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1050,
          availableBeforeIrregulars: 283.51,
        },
        {
          monthKey: "2026-04",
          netSalaryAmount: 2920,
          fixedExpensesAmount: 1266.49,
          baselineVariableAmount: 320,
          annualReserveAmount: 0,
          plannedSavingsAmount: 1050,
          availableBeforeIrregulars: 283.51,
        },
      ],
      baselineLineItems: [
        { id: "fixed", label: "Fix", amount: 1266.49, category: "fixed", effectiveFrom: "2026-03" },
        { id: "variable", label: "Var", amount: 320, category: "variable", effectiveFrom: "2026-03" },
        { id: "save", label: "Save", amount: 1050, category: "savings", effectiveFrom: "2026-03" },
      ],
      forecastWealthAnchors: [],
    },
  });

  const aprilRow = state.monthlyPlan.rows.find((entry: { monthKey: string }) => entry.monthKey === "2026-04");
  assert.ok(aprilRow);
  assert.equal(aprilRow.anchorMode, "month_start");
  assert.equal(aprilRow.musicAllocationToSafetyAmount, 1223.79);
  assert.equal(aprilRow.musicAllocationToInvestmentAmount, 0);
});
