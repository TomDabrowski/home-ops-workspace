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

export interface MonthlyConsistencySignal {
  code:
    | "baseline_anchor_mismatch"
    | "baseline_deficit"
    | "monthly_deficit"
    | "expense_over_baseline_available"
    | "expense_spike";
  severity: "info" | "warn";
  title: string;
  detail: string;
}

export interface MonthReview {
  monthKey: string;
  row: MonthlyPlanRow;
  baselineLineItems: BaselineLineItem[];
  incomeEntries: IncomeEntry[];
  expenseEntries: ExpenseEntry[];
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

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function monthFromDate(value: string): string {
  return value.slice(0, 7);
}

export function uniqueMonthKeys(incomeEntries: IncomeEntry[], expenseEntries: ExpenseEntry[]): string[] {
  const keys = new Set<string>();

  for (const entry of incomeEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  for (const entry of expenseEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}

export function compareMonthKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

export function selectBaselineLineItemsForMonth(
  lineItems: BaselineLineItem[],
  monthKey: string,
): BaselineLineItem[] {
  const currentByKey = new Map<string, BaselineLineItem>();

  for (const item of [...lineItems].sort((left, right) => compareMonthKeys(left.effectiveFrom, right.effectiveFrom))) {
    if (compareMonthKeys(item.effectiveFrom, monthKey) > 0) {
      continue;
    }

    const key = `${item.category}:${item.label}`;
    if (item.amount <= 0) {
      currentByKey.delete(key);
      continue;
    }

    currentByKey.set(key, item);
  }

  return [...currentByKey.values()];
}

export function sumLineItems(items: BaselineLineItem[], category: BaselineLineItem["category"]): number {
  return roundCurrency(
    items
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + item.amount, 0),
  );
}

export function selectBaselineForMonth(baselines: MonthlyBaseline[], monthKey: string): MonthlyBaseline {
  const sorted = [...baselines].sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
  let selected = sorted[0];

  for (const baseline of sorted) {
    if (compareMonthKeys(baseline.monthKey, monthKey) <= 0) {
      selected = baseline;
    } else {
      break;
    }
  }

  return selected;
}

export function buildBaselineForMonth(anchor: MonthlyBaseline, monthKey: string): MonthlyBaseline & {
  baselineProfile: "historical_liquidity" | "forecast_investing";
} {
  if (anchor.plannedSavingsAmount === 0) {
    return {
      ...anchor,
      monthKey,
      baselineProfile: "historical_liquidity",
    };
  }

  return {
    ...anchor,
    monthKey,
    baselineProfile: "forecast_investing",
  };
}

export function sumIncomeForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function sumIncomeReserveForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + (entry.reserveAmount ?? 0), 0),
  );
}

export function sumIncomeAvailableForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + (entry.availableAmount ?? entry.amount - (entry.reserveAmount ?? 0)), 0),
  );
}

export function sumIncomeAvailableAfterDate(entries: IncomeEntry[], monthKey: string, snapshotDate: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey && String(entry.entryDate) > snapshotDate)
      .reduce((sum, entry) => sum + (entry.availableAmount ?? entry.amount - (entry.reserveAmount ?? 0)), 0),
  );
}

export function sumMusicIncomeForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => entry.incomeStreamId === "music-income" && monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

function assumptionNumber(draft: ImportDraft, key: string, fallback: number): number {
  const assumption = draft.forecastAssumptions.find((entry) => entry.key === key);
  return typeof assumption?.value === "number" ? assumption.value : fallback;
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

export function sumExpensesForMonth(entries: ExpenseEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function sumExpensesAfterDate(entries: ExpenseEntry[], monthKey: string, snapshotDate: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey && String(entry.entryDate) > snapshotDate)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function selectIncomeEntriesForMonth(entries: IncomeEntry[], monthKey: string): IncomeEntry[] {
  return entries.filter((entry) => monthFromDate(entry.entryDate) === monthKey);
}

export function selectExpenseEntriesForMonth(entries: ExpenseEntry[], monthKey: string): ExpenseEntry[] {
  return entries.filter((entry) => monthFromDate(entry.entryDate) === monthKey);
}

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

function buildConsistencySignals(input: {
  monthKey: string;
  baselineAnchorMonthKey: string;
  baselineAvailableAmount: number;
  baselineAnchorAvailableAmount: number;
  baselineAnchorDeltaAmount: number;
  baselineFixedDeltaAmount: number;
  baselineVariableDeltaAmount: number;
  annualReserveDeltaAmount: number;
  plannedSavingsDeltaAmount: number;
  importedExpenseAmount: number;
  importedVariableThresholdAmount: number;
  importedIncomeAvailableAmount: number;
  monthAvailableBeforeExpensesAmount: number;
  netAfterImportedFlows: number;
}): MonthlyConsistencySignal[] {
  const signals: MonthlyConsistencySignal[] = [];

  const mismatchEntries: Array<[string, number]> = [
    ["Fixkosten", input.baselineFixedDeltaAmount],
    ["Variable Basis", input.baselineVariableDeltaAmount],
    ["Ruecklage", input.annualReserveDeltaAmount],
    ["Sparen", input.plannedSavingsDeltaAmount],
  ];
  const mismatchParts = mismatchEntries
    .filter(([, delta]) => Math.abs(delta) > 0.01)
    .map(([label, delta]) => `${label} ${formatCurrency(delta)}`);

  if (Math.abs(input.baselineAnchorDeltaAmount) > 0.01 || mismatchParts.length > 0) {
    const detailParts = [
      `Anker ${input.baselineAnchorMonthKey}`,
      `Verfuegbar-Differenz ${formatCurrency(input.baselineAnchorDeltaAmount)}`,
    ];

    if (mismatchParts.length > 0) {
      detailParts.push(`Teilabweichungen: ${mismatchParts.join(", ")}`);
    }

    signals.push({
      code: "baseline_anchor_mismatch",
      severity: "warn",
      title: "Baseline passt nicht sauber zum Anchor",
      detail: detailParts.join(" · "),
    });
  }

  if (input.baselineAvailableAmount < 0) {
    signals.push({
      code: "baseline_deficit",
      severity: "warn",
      title: "Baseline selbst liegt unter null",
      detail: `${input.monthKey} startet schon vor Importen mit ${formatCurrency(input.baselineAvailableAmount)}.`,
    });
  }

  if (input.netAfterImportedFlows < 0) {
    signals.push({
      code: "monthly_deficit",
      severity: "warn",
      title: "Monat endet nach Importen im Minus",
      detail: `${input.monthKey} faellt auf ${formatCurrency(input.netAfterImportedFlows)} nach importierten Bewegungen.`,
    });
  }

  if (input.importedExpenseAmount > input.baselineAvailableAmount && input.importedExpenseAmount > 0) {
    signals.push({
      code: "expense_over_baseline_available",
      severity: "warn",
      title: "Importierte Ausgaben uebersteigen freie Baseline",
      detail:
        `Ausgaben ${formatCurrency(input.importedExpenseAmount)} gegen freie Baseline ${formatCurrency(input.baselineAvailableAmount)}. ` +
        `Freie Import-Einnahmen im Monat: ${formatCurrency(input.importedIncomeAvailableAmount)}.`,
    });
  }

  if (input.importedExpenseAmount > input.importedVariableThresholdAmount && input.importedExpenseAmount > 0) {
    signals.push({
      code: "expense_spike",
      severity: "info",
      title: "Importierter Ausgabenmonat wirkt ungewoehnlich hoch",
      detail: `Ausgaben ${formatCurrency(input.importedExpenseAmount)} liegen ueber dem Vergleichswert von ${formatCurrency(input.importedVariableThresholdAmount)}.`,
    });
  }

  return signals;
}

export function buildMonthlyRows(draft: ImportDraft): MonthlyPlanRow[] {
  if (draft.monthlyBaselines.length === 0) {
    return [];
  }

  const monthKeys = uniqueMonthKeys(draft.incomeEntries, draft.expenseEntries);
  const safetyThreshold = assumptionNumber(draft, "safety_threshold", 10000);
  const musicThreshold = assumptionNumber(draft, "music_threshold", safetyThreshold);
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
    const currentSafetyAmount = anchorAppliesWithinMonth
      ? Number(explicitWealthAnchor?.safetyBucketAmount ?? 0)
      : (safetyBucketStartAmount ?? 0);
    const musicSafetyGapAmount = Math.max(0, musicThreshold - currentSafetyAmount);
    const musicAllocationToSafetyAmount = roundCurrency(
      !useForecastRouting ? 0 : Math.min(incomeAvailableForProjection, musicSafetyGapAmount),
    );
    const musicAllocationToInvestmentAmount = roundCurrency(
      !useForecastRouting ? 0 : Math.max(0, incomeAvailableForProjection - musicAllocationToSafetyAmount),
    );
    const safetyBucketProjectedEndAmount = useForecastRouting
      ? roundCurrency(
          (safetyBucketStartAmount ?? 0) * (1 + safetyMonthlyReturn) +
            salaryAllocationToSafetyAmount +
            musicAllocationToSafetyAmount -
            expenseAmountForProjection,
        )
      : undefined;
    const investmentBucketProjectedEndAmount = useForecastRouting
      ? roundCurrency(
          (investmentBucketStartAmount ?? 0) * (1 + investmentMonthlyReturn) +
            salaryAllocationToInvestmentAmount +
            musicAllocationToInvestmentAmount,
        )
      : undefined;
    const projectedWealthCalculatedEndAmount =
      safetyBucketProjectedEndAmount !== undefined && investmentBucketProjectedEndAmount !== undefined
        ? roundCurrency(safetyBucketProjectedEndAmount + investmentBucketProjectedEndAmount)
        : undefined;
    const safetyBucketAnchorAmount = explicitWealthAnchor?.safetyBucketAmount;
    const investmentBucketAnchorAmount = explicitWealthAnchor?.investmentBucketAmount;
    const anchoredSafetyEndAmount =
      anchorAppliesWithinMonth && safetyBucketAnchorAmount !== undefined
        ? roundCurrency(safetyBucketAnchorAmount + musicAllocationToSafetyAmount - expenseAmountForProjection)
        : undefined;
    const anchoredInvestmentEndAmount =
      anchorAppliesWithinMonth && investmentBucketAnchorAmount !== undefined
        ? roundCurrency(investmentBucketAnchorAmount + musicAllocationToInvestmentAmount)
        : undefined;
    const projectedWealthAnchorAmount =
      safetyBucketAnchorAmount !== undefined && investmentBucketAnchorAmount !== undefined
        ? roundCurrency(safetyBucketAnchorAmount + investmentBucketAnchorAmount)
        : explicitWealthAnchor?.totalWealthAmount;
    const safetyBucketResolvedEndAmount =
      anchoredSafetyEndAmount ??
      safetyBucketAnchorAmount ??
      safetyBucketProjectedEndAmount;
    const investmentBucketResolvedEndAmount =
      anchoredInvestmentEndAmount ??
      investmentBucketAnchorAmount ??
      investmentBucketProjectedEndAmount;
    const projectedWealthEndAmount =
      safetyBucketResolvedEndAmount !== undefined && investmentBucketResolvedEndAmount !== undefined
        ? roundCurrency(safetyBucketResolvedEndAmount + investmentBucketResolvedEndAmount)
        : undefined;
    if (safetyBucketResolvedEndAmount !== undefined) {
      safetyBucketEndAmount = safetyBucketResolvedEndAmount;
    }
    if (investmentBucketResolvedEndAmount !== undefined) {
      investmentBucketEndAmount = investmentBucketResolvedEndAmount;
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
      musicAllocationToSafetyAmount,
      musicAllocationToInvestmentAmount,
      salaryAllocationToSafetyAmount,
      salaryAllocationToInvestmentAmount,
      anchorAppliesWithinMonth,
      projectionIncomeAvailableAmount: incomeAvailableForProjection,
      projectionExpenseAmount: expenseAmountForProjection,
      safetyBucketStartAmount,
      safetyBucketCalculatedEndAmount: safetyBucketProjectedEndAmount,
      safetyBucketAnchorAmount,
      safetyBucketEndAmount: safetyBucketResolvedEndAmount,
      investmentBucketStartAmount,
      investmentBucketCalculatedEndAmount: investmentBucketProjectedEndAmount,
      investmentBucketAnchorAmount,
      investmentBucketEndAmount: investmentBucketResolvedEndAmount,
      projectedWealthCalculatedEndAmount,
      projectedWealthAnchorAmount,
      projectedWealthEndAmount,
      wealthAnchorApplied: Boolean(explicitWealthAnchor),
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
