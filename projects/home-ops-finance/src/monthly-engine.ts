import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BaselineLineItem,
  ExpenseEntry,
  ForecastWealthAnchor,
  ImportDraft,
  IncomeEntry,
  MonthlyBaseline,
  WealthBucket,
} from "./types.js";
import { ensureFinanceDataDir, financeDataPath } from "./local-config.ts";
import {
  buildConsistencySignals,
  type MonthlyConsistencySignal,
} from "./monthly-consistency-signals.ts";
import { buildMonthlyForecastRouting } from "./monthly-forecast-routing.ts";
import {
  buildBaselineForMonth,
  compareMonthKeys,
  monthFromDate,
  incomeMonthKey,
  roundCurrency,
  selectBaselineForMonth,
  selectBaselineLineItemsForMonth,
  selectExpenseEntriesForMonth,
  selectIncomeEntriesForMonth,
  sumExpensesAfterDate,
  sumExpensesForMonth,
  sumIncomeAvailableAfterDate,
  sumIncomeAvailableForMonth,
  sumIncomeForMonth,
  sumIncomeReserveForMonth,
  sumLineItems,
  sumMusicIncomeForMonth,
  uniqueMonthKeys,
} from "./monthly-planning-helpers.ts";
import { buildMonthAllocationInstructionsFromReview } from "./core/allocation/build-month-allocation-instructions.js";

export {
  buildBaselineForMonth,
  compareMonthKeys,
  monthFromDate,
  incomeMonthKey,
  roundCurrency,
  selectBaselineForMonth,
  selectBaselineLineItemsForMonth,
  selectExpenseEntriesForMonth,
  selectIncomeEntriesForMonth,
  sumExpensesAfterDate,
  sumExpensesForMonth,
  sumIncomeAvailableAfterDate,
  sumIncomeAvailableForMonth,
  sumIncomeForMonth,
  sumIncomeReserveForMonth,
  sumLineItems,
  sumMusicIncomeForMonth,
  uniqueMonthKeys,
} from "./monthly-planning-helpers.ts";

export interface MonthlyPlanRow {
  monthKey: string;
  baselineProfile: "historical_liquidity" | "forecast_investing";
  baselineAnchorMonthKey: string;
  netSalaryAmount: number;
  baselineFixedAmount: number;
  baselineVariableAmount: number;
  annualReserveAmount: number;
  plannedSavingsAmount: number;
  baselineAvailableAmount: number;
  monthAvailableBeforeExpensesAmount: number;
  baselineAnchorAvailableAmount: number;
  baselineAnchorDeltaAmount: number;
  baselineFixedDeltaAmount: number;
  baselineVariableDeltaAmount: number;
  annualReserveDeltaAmount: number;
  plannedSavingsDeltaAmount: number;
  importedIncomeAmount: number;
  importedIncomeReserveAmount: number;
  importedIncomeAvailableAmount: number;
  musicIncomeAmount: number;
  musicAllocationToSafetyAmount: number;
  musicAllocationToInvestmentAmount: number;
  salaryAllocationToSafetyAmount: number;
  salaryAllocationToInvestmentAmount: number;
  anchorAppliesWithinMonth?: boolean;
  projectionIncomeAvailableAmount?: number;
  projectionExpenseAmount?: number;
  safetyBucketStartAmount?: number;
  safetyBucketCalculatedEndAmount?: number;
  safetyBucketAnchorAmount?: number;
  safetyBucketEndAmount?: number;
  investmentBucketStartAmount?: number;
  investmentBucketCalculatedEndAmount?: number;
  investmentBucketAnchorAmount?: number;
  investmentBucketEndAmount?: number;
  projectedWealthCalculatedEndAmount?: number;
  projectedWealthAnchorAmount?: number;
  projectedWealthEndAmount?: number;
  wealthAnchorApplied?: boolean;
  importedExpenseAmount: number;
  netAfterImportedFlows: number;
  consistencySignals: MonthlyConsistencySignal[];
}

export interface MonthReview {
  monthKey: string;
  row: MonthlyPlanRow;
  baselineLineItems: BaselineLineItem[];
  incomeEntries: IncomeEntry[];
  expenseEntries: ExpenseEntry[];
}

export interface MonthAllocationInstruction {
  kind: "salary" | "music";
  effectiveDate: string;
  title: string;
  thresholdAccountId?: string | null;
  happenedBeforeMonthStart?: boolean;
  thresholdAmountBeforeEntry?: number;
  thresholdGapBeforeEntry?: number;
  reserveAmount: number;
  toCashAmount: number;
  toInvestmentAmount: number;
  availableAmount: number;
}

export interface MonthlyPlanReport {
  workbookPath: string;
  generatedAt: string;
  anchorMonthKey: string;
  baselineMode: "exclude_annual_reserve_from_available";
  rows: MonthlyPlanRow[];
}

function resolvePaths(): {
  inputPath: string;
  outputJsonPath: string;
  outputMarkdownPath: string;
} {
  if (process.argv[2] === "--reviewed") {
    return {
      inputPath: resolve(financeDataPath("import-draft-reviewed.json")),
      outputJsonPath: resolve(financeDataPath("monthly-plan-reviewed.json")),
      outputMarkdownPath: resolve(financeDataPath("monthly-plan-reviewed.md")),
    };
  }

  return {
    inputPath: resolve(process.argv[2] ?? financeDataPath("import-draft.json")),
    outputJsonPath: resolve(process.argv[3] ?? financeDataPath("monthly-plan.json")),
    outputMarkdownPath: resolve(process.argv[4] ?? financeDataPath("monthly-plan.md")),
  };
}

function readDraft(inputPath: string): ImportDraft {
  return JSON.parse(readFileSync(inputPath, "utf8")) as ImportDraft;
}

function assumptionNumber(draft: ImportDraft, key: string, fallback: number): number {
  const assumption = draft.forecastAssumptions.find((entry) => entry.key === key);
  return typeof assumption?.value === "number" ? assumption.value : fallback;
}

function assumptionString(draft: ImportDraft, key: string, fallback: string): string {
  const assumption = draft.forecastAssumptions.find((entry) => entry.key === key);
  return typeof assumption?.value === "string" && assumption.value.trim() ? assumption.value.trim() : fallback;
}

function wealthBucket(draft: ImportDraft, kind: WealthBucket["kind"]): WealthBucket | undefined {
  return draft.wealthBuckets.find((bucket) => bucket.kind === kind);
}

function wealthAnchorForMonth(draft: ImportDraft, monthKey: string): ForecastWealthAnchor | undefined {
  return (draft.forecastWealthAnchors ?? []).find((anchor) => anchor.monthKey === monthKey);
}

function monthlyReturnFromAnnualRate(rate: number, mode: "simple_division" | "compound"): number {
  if (mode === "compound") {
    return Math.pow(1 + rate, 1 / 12) - 1;
  }

  return rate / 12;
}

function anchorCashAccountAmount(anchor: ForecastWealthAnchor | undefined, accountId: string, fallback: number): number {
  const amount = anchor?.cashAccounts?.[accountId];
  return typeof amount === "number" && Number.isFinite(amount) ? amount : fallback;
}

function sumExpensesForMonthAndAccount(entries: ExpenseEntry[], monthKey: string, accountId: string): number {
  return roundCurrency(
    selectExpenseEntriesForMonth(entries, monthKey)
      .filter((entry) => entry.accountId === accountId)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

function sumExpensesAfterDateAndAccount(entries: ExpenseEntry[], monthKey: string, date: string, accountId: string): number {
  return roundCurrency(
    selectExpenseEntriesForMonth(entries, monthKey)
      .filter((entry) => entry.accountId === accountId && entry.entryDate >= date)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function buildMonthlyRows(draft: ImportDraft): MonthlyPlanRow[] {
  if (draft.monthlyBaselines.length === 0) {
    return [];
  }

  const monthKeys = uniqueMonthKeys(draft.incomeEntries, draft.expenseEntries);
  const safetyThreshold = assumptionNumber(draft, "safety_threshold", 10000);
  const musicThreshold = assumptionNumber(draft, "music_threshold", safetyThreshold);
  const musicThresholdAccountId = assumptionString(draft, "music_threshold_account_id", "savings");
  const safetyStartDefault = wealthBucket(draft, "safety")?.currentAmount ?? 0;
  const investmentStartDefault = wealthBucket(draft, "investment")?.currentAmount ?? 0;
  const safetyMonthlyReturn = monthlyReturnFromAnnualRate(
    wealthBucket(draft, "safety")?.expectedAnnualReturn ?? assumptionNumber(draft, "savings_interest_annual", 0.02),
    "simple_division",
  );
  const investmentMonthlyReturn = monthlyReturnFromAnnualRate(
    wealthBucket(draft, "investment")?.expectedAnnualReturn ?? assumptionNumber(draft, "investment_return_annual", 0.05),
    "compound",
  );
  const firstPlannedMonthKey =
    draft.incomeEntries
      .filter((entry) => entry.isPlanned)
      .map((entry) => monthFromDate(entry.entryDate))
      .sort((left, right) => compareMonthKeys(left, right))[0] ??
    draft.expenseEntries
      .filter((entry) => entry.isPlanned)
      .map((entry) => monthFromDate(entry.entryDate))
      .sort((left, right) => compareMonthKeys(left, right))[0];

  let safetyBucketEndAmount = safetyStartDefault;
  let investmentBucketEndAmount = investmentStartDefault;
  let musicThresholdAccountEndAmount = safetyStartDefault;

  return monthKeys.map((monthKey) => {
    const selectedBaseline = selectBaselineForMonth(draft.monthlyBaselines, monthKey);
    const baseline = buildBaselineForMonth(selectedBaseline, monthKey);
    const activeLineItems = selectBaselineLineItemsForMonth(draft.baselineLineItems, monthKey);
    const fixedAmount = sumLineItems(activeLineItems, "fixed");
    const variableAmount = sumLineItems(activeLineItems, "variable");
    const annualReserveAmount = sumLineItems(activeLineItems, "annual_reserve");
    const plannedSavingsAmount = sumLineItems(activeLineItems, "savings");
    const importedIncomeAmount = sumIncomeForMonth(draft.incomeEntries, monthKey);
    const importedIncomeReserveAmount = sumIncomeReserveForMonth(draft.incomeEntries, monthKey);
    const importedIncomeAvailableAmount = sumIncomeAvailableForMonth(draft.incomeEntries, monthKey);
    const musicIncomeAmount = sumMusicIncomeForMonth(draft.incomeEntries, monthKey);
    const importedExpenseAmount = sumExpensesForMonth(draft.expenseEntries, monthKey);
    const baselineAvailableAmount = roundCurrency(
      baseline.netSalaryAmount -
        fixedAmount -
        variableAmount -
        plannedSavingsAmount,
    );
    const netAfterImportedFlows = roundCurrency(
      baseline.netSalaryAmount -
        fixedAmount -
        variableAmount -
        plannedSavingsAmount +
        importedIncomeAvailableAmount -
        importedExpenseAmount,
    );
    const monthAvailableBeforeExpensesAmount = roundCurrency(
      baselineAvailableAmount + importedIncomeAvailableAmount,
    );
    const baselineAnchorAvailableAmount = roundCurrency(selectedBaseline.availableBeforeIrregulars);
    const baselineAnchorDeltaAmount = roundCurrency(baselineAvailableAmount - baselineAnchorAvailableAmount);
    const baselineFixedDeltaAmount = roundCurrency(fixedAmount - selectedBaseline.fixedExpensesAmount);
    const baselineVariableDeltaAmount = roundCurrency(variableAmount - selectedBaseline.baselineVariableAmount);
    const annualReserveDeltaAmount = roundCurrency(annualReserveAmount - (selectedBaseline.annualReserveAmount ?? 0));
    const plannedSavingsDeltaAmount = roundCurrency(plannedSavingsAmount - selectedBaseline.plannedSavingsAmount);
    const importedVariableThresholdAmount = roundCurrency(
      Math.max(baselineAvailableAmount, variableAmount),
    );
    const salaryAllocationToSafetyAmount = roundCurrency(
      Math.max(0, baseline.netSalaryAmount - fixedAmount - variableAmount - plannedSavingsAmount),
    );
    const salaryAllocationToInvestmentAmount = roundCurrency(plannedSavingsAmount);
    const useForecastRouting = firstPlannedMonthKey ? compareMonthKeys(monthKey, firstPlannedMonthKey) >= 0 : false;
    const safetyBucketStartAmount = useForecastRouting ? safetyBucketEndAmount : undefined;
    const investmentBucketStartAmount = useForecastRouting ? investmentBucketEndAmount : undefined;
    const explicitWealthAnchor = wealthAnchorForMonth(draft, monthKey);
    const snapshotDate = explicitWealthAnchor?.snapshotDate;
    const anchorAppliesWithinMonth = Boolean(snapshotDate && monthFromDate(snapshotDate) === monthKey);
    const incomeAvailableForProjection = anchorAppliesWithinMonth
      ? sumIncomeAvailableAfterDate(draft.incomeEntries, monthKey, snapshotDate!)
      : importedIncomeAvailableAmount;
    const expenseAmountForProjection = anchorAppliesWithinMonth
      ? sumExpensesAfterDate(draft.expenseEntries, monthKey, snapshotDate!)
      : importedExpenseAmount;
    const forecastRouting = buildMonthlyForecastRouting({
      monthKey,
      useForecastRouting,
      musicThreshold,
      safetyMonthlyReturn,
      investmentMonthlyReturn,
      salaryAllocationToSafetyAmount,
      salaryAllocationToInvestmentAmount,
      importedIncomeAvailableAmount,
      importedExpenseAmount,
      safetyBucketStartAmount,
      investmentBucketStartAmount,
      explicitWealthAnchor,
      incomeAvailableAfterAnchorAmount: incomeAvailableForProjection,
      expenseAfterAnchorAmount: expenseAmountForProjection,
    });
    const thresholdAccountExpenseAmount = musicThresholdAccountId
      ? anchorAppliesWithinMonth
        ? sumExpensesAfterDateAndAccount(draft.expenseEntries, monthKey, snapshotDate!, musicThresholdAccountId)
        : sumExpensesForMonthAndAccount(draft.expenseEntries, monthKey, musicThresholdAccountId)
      : expenseAmountForProjection;
    const currentMusicThresholdAccountAmount = musicThresholdAccountId
      ? anchorAppliesWithinMonth
        ? anchorCashAccountAmount(
            explicitWealthAnchor,
            musicThresholdAccountId,
            Number(explicitWealthAnchor?.safetyBucketAmount ?? 0),
          )
        : musicThresholdAccountEndAmount
      : Number(safetyBucketStartAmount ?? 0);
    const musicThresholdAccountProjectedEndAmount = useForecastRouting
      ? roundCurrency(
          currentMusicThresholdAccountAmount * (1 + safetyMonthlyReturn) +
            forecastRouting.musicAllocationToSafetyAmount -
            thresholdAccountExpenseAmount,
        )
      : undefined;
    if (forecastRouting.safetyBucketEndAmount !== undefined) {
      safetyBucketEndAmount = forecastRouting.safetyBucketEndAmount;
    }
    if (forecastRouting.investmentBucketEndAmount !== undefined) {
      investmentBucketEndAmount = forecastRouting.investmentBucketEndAmount;
    }
    if (musicThresholdAccountId && musicThresholdAccountProjectedEndAmount !== undefined) {
      musicThresholdAccountEndAmount = musicThresholdAccountProjectedEndAmount;
    }
    const consistencySignals = buildConsistencySignals({
      monthKey,
      baselineAnchorMonthKey: selectedBaseline.monthKey,
      baselineAvailableAmount,
      baselineAnchorAvailableAmount,
      baselineAnchorDeltaAmount,
      baselineFixedDeltaAmount,
      baselineVariableDeltaAmount,
      annualReserveDeltaAmount,
      plannedSavingsDeltaAmount,
      importedExpenseAmount,
      importedVariableThresholdAmount,
      importedIncomeAvailableAmount,
      monthAvailableBeforeExpensesAmount,
      netAfterImportedFlows,
    });

    return {
      monthKey,
      baselineProfile: baseline.baselineProfile,
      baselineAnchorMonthKey: selectedBaseline.monthKey,
      netSalaryAmount: baseline.netSalaryAmount,
      baselineFixedAmount: fixedAmount,
      baselineVariableAmount: variableAmount,
      annualReserveAmount,
      plannedSavingsAmount,
      baselineAvailableAmount,
      monthAvailableBeforeExpensesAmount,
      baselineAnchorAvailableAmount,
      baselineAnchorDeltaAmount,
      baselineFixedDeltaAmount,
      baselineVariableDeltaAmount,
      annualReserveDeltaAmount,
      plannedSavingsDeltaAmount,
      importedIncomeAmount,
      importedIncomeReserveAmount,
      importedIncomeAvailableAmount,
      musicIncomeAmount,
      musicAllocationToSafetyAmount: forecastRouting.musicAllocationToSafetyAmount,
      musicAllocationToInvestmentAmount: forecastRouting.musicAllocationToInvestmentAmount,
      salaryAllocationToSafetyAmount,
      salaryAllocationToInvestmentAmount,
      anchorAppliesWithinMonth: forecastRouting.anchorAppliesWithinMonth,
      projectionIncomeAvailableAmount: forecastRouting.projectionIncomeAvailableAmount,
      projectionExpenseAmount: forecastRouting.projectionExpenseAmount,
      safetyBucketStartAmount,
      safetyBucketCalculatedEndAmount: forecastRouting.safetyBucketCalculatedEndAmount,
      safetyBucketAnchorAmount: forecastRouting.safetyBucketAnchorAmount,
      safetyBucketEndAmount: forecastRouting.safetyBucketEndAmount,
      investmentBucketStartAmount,
      investmentBucketCalculatedEndAmount: forecastRouting.investmentBucketCalculatedEndAmount,
      investmentBucketAnchorAmount: forecastRouting.investmentBucketAnchorAmount,
      investmentBucketEndAmount: forecastRouting.investmentBucketEndAmount,
      projectedWealthCalculatedEndAmount: forecastRouting.projectedWealthCalculatedEndAmount,
      projectedWealthAnchorAmount: forecastRouting.projectedWealthAnchorAmount,
      projectedWealthEndAmount: forecastRouting.projectedWealthEndAmount,
      wealthAnchorApplied: forecastRouting.wealthAnchorApplied,
      importedExpenseAmount,
      netAfterImportedFlows,
      consistencySignals,
    };
  });
}

export function buildMonthReview(draft: ImportDraft, monthKey: string): MonthReview | null {
  const rows = buildMonthlyRows(draft);
  const row = rows.find((item) => item.monthKey === monthKey);

  if (!row) {
    return null;
  }

  return {
    monthKey,
    row,
    baselineLineItems: selectBaselineLineItemsForMonth(draft.baselineLineItems, monthKey),
    incomeEntries: selectIncomeEntriesForMonth(draft.incomeEntries, monthKey),
    expenseEntries: selectExpenseEntriesForMonth(draft.expenseEntries, monthKey),
  };
}

export function buildMonthAllocationInstructions(draft: ImportDraft, monthKey: string): MonthAllocationInstruction[] {
  const review = buildMonthReview(draft, monthKey);
  if (!review) {
    return [];
  }

  // Keep one rule owner for allocation guidance. The browser should render the
  // same structured output instead of maintaining a second calculation path.
  return buildMonthAllocationInstructionsFromReview(review, draft);
}

export function buildMarkdown(report: MonthlyPlanReport): string {
  const lines: string[] = [];

  lines.push("# Monthly Plan Report");
  lines.push("");
  lines.push(`Source workbook: \`${report.workbookPath}\``);
  lines.push(`Generated at: \`${report.generatedAt}\``);
  lines.push(`Anchor month: \`${report.anchorMonthKey}\``);
  lines.push(`Baseline mode: \`${report.baselineMode}\``);
  lines.push("");
  lines.push("## Recent Rows");
  lines.push("");

  for (const row of report.rows.slice(-12)) {
    lines.push(
      `- ${row.monthKey} (${row.baselineProfile}): baseline ${row.baselineAvailableAmount.toFixed(2)} EUR, music gross ${row.musicIncomeAmount.toFixed(2)} EUR, free ${row.importedIncomeAvailableAmount.toFixed(2)} EUR, reserve ${row.importedIncomeReserveAmount.toFixed(2)} EUR, imported expenses ${row.importedExpenseAmount.toFixed(2)} EUR, result ${row.netAfterImportedFlows.toFixed(2)} EUR`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function main(): void {
  ensureFinanceDataDir();
  const { inputPath, outputJsonPath, outputMarkdownPath } = resolvePaths();

  const draft = readDraft(inputPath);
  const anchor = draft.monthlyBaselines[0];

  if (!anchor) {
    throw new Error("No monthly baseline anchor found in import draft.");
  }

  const report: MonthlyPlanReport = {
    workbookPath: draft.workbookPath,
    generatedAt: new Date().toISOString(),
    anchorMonthKey: anchor.monthKey,
    baselineMode: "exclude_annual_reserve_from_available",
    rows: buildMonthlyRows(draft),
  };

  writeFileSync(outputJsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeFileSync(outputMarkdownPath, buildMarkdown(report), "utf8");

  console.log(`Wrote monthly plan JSON to ${outputJsonPath}`);
  console.log(`Wrote monthly plan Markdown to ${outputMarkdownPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
