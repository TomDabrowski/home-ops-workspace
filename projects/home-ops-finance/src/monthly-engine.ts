import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { BaselineLineItem, ExpenseEntry, ImportDraft, IncomeEntry, MonthlyBaseline } from "./types.js";

export interface MonthlyPlanRow {
  monthKey: string;
  baselineProfile: "historical_liquidity" | "forecast_investing";
  netSalaryAmount: number;
  baselineFixedAmount: number;
  baselineVariableAmount: number;
  annualReserveAmount: number;
  plannedSavingsAmount: number;
  baselineAvailableAmount: number;
  importedIncomeAmount: number;
  importedExpenseAmount: number;
  netAfterImportedFlows: number;
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

    currentByKey.set(`${item.category}:${item.label}`, item);
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

export function sumExpensesForMonth(entries: ExpenseEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function selectIncomeEntriesForMonth(entries: IncomeEntry[], monthKey: string): IncomeEntry[] {
  return entries.filter((entry) => monthFromDate(entry.entryDate) === monthKey);
}

export function selectExpenseEntriesForMonth(entries: ExpenseEntry[], monthKey: string): ExpenseEntry[] {
  return entries.filter((entry) => monthFromDate(entry.entryDate) === monthKey);
}

export function buildMonthlyRows(draft: ImportDraft): MonthlyPlanRow[] {
  if (draft.monthlyBaselines.length === 0) {
    return [];
  }

  const monthKeys = uniqueMonthKeys(draft.incomeEntries, draft.expenseEntries);

  return monthKeys.map((monthKey) => {
    const selectedBaseline = selectBaselineForMonth(draft.monthlyBaselines, monthKey);
    const baseline = buildBaselineForMonth(selectedBaseline, monthKey);
    const activeLineItems = selectBaselineLineItemsForMonth(draft.baselineLineItems, monthKey);
    const fixedAmount = sumLineItems(activeLineItems, "fixed");
    const variableAmount = sumLineItems(activeLineItems, "variable");
    const annualReserveAmount = sumLineItems(activeLineItems, "annual_reserve");
    const plannedSavingsAmount = sumLineItems(activeLineItems, "savings");
    const importedIncomeAmount = sumIncomeForMonth(draft.incomeEntries, monthKey);
    const importedExpenseAmount = sumExpensesForMonth(draft.expenseEntries, monthKey);

    return {
      monthKey,
      baselineProfile: baseline.baselineProfile,
      netSalaryAmount: baseline.netSalaryAmount,
      baselineFixedAmount: fixedAmount,
      baselineVariableAmount: variableAmount,
      annualReserveAmount,
      plannedSavingsAmount,
      baselineAvailableAmount: roundCurrency(
        baseline.netSalaryAmount -
          fixedAmount -
          variableAmount -
          plannedSavingsAmount,
      ),
      importedIncomeAmount,
      importedExpenseAmount,
      netAfterImportedFlows: roundCurrency(
        baseline.netSalaryAmount -
          fixedAmount -
          variableAmount -
          plannedSavingsAmount +
          importedIncomeAmount -
          importedExpenseAmount,
      ),
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
      `- ${row.monthKey} (${row.baselineProfile}): baseline ${row.baselineAvailableAmount.toFixed(2)} EUR, imported income ${row.importedIncomeAmount.toFixed(2)} EUR, imported expenses ${row.importedExpenseAmount.toFixed(2)} EUR, result ${row.netAfterImportedFlows.toFixed(2)} EUR`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const inputPath = resolve(process.argv[2] ?? "data/import-draft.json");
  const outputJsonPath = resolve(process.argv[3] ?? "data/monthly-plan.json");
  const outputMarkdownPath = resolve(process.argv[4] ?? "data/monthly-plan.md");

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
