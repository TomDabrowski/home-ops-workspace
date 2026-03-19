import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ExpenseEntry, ImportDraft, IncomeEntry, MonthlyBaseline } from "./types.js";

interface MonthlyPlanRow {
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

interface MonthlyPlanReport {
  workbookPath: string;
  generatedAt: string;
  anchorMonthKey: string;
  baselineMode: "exclude_annual_reserve_from_available";
  rows: MonthlyPlanRow[];
}

function readDraft(inputPath: string): ImportDraft {
  return JSON.parse(readFileSync(inputPath, "utf8")) as ImportDraft;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthFromDate(value: string): string {
  return value.slice(0, 7);
}

function uniqueMonthKeys(incomeEntries: IncomeEntry[], expenseEntries: ExpenseEntry[]): string[] {
  const keys = new Set<string>();

  for (const entry of incomeEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  for (const entry of expenseEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}

function compareMonthKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function buildBaselineForMonth(anchor: MonthlyBaseline, monthKey: string): MonthlyBaseline & {
  baselineProfile: "historical_liquidity" | "forecast_investing";
} {
  const annualReserveAmount = anchor.annualReserveAmount ?? 0;
  const historicalAvailable = roundCurrency(
    anchor.netSalaryAmount - anchor.fixedExpensesAmount - anchor.baselineVariableAmount,
  );

  if (compareMonthKeys(monthKey, anchor.monthKey) < 0) {
    return {
      ...anchor,
      monthKey,
      plannedSavingsAmount: 0,
      availableBeforeIrregulars: historicalAvailable,
      annualReserveAmount,
      baselineProfile: "historical_liquidity",
      notes: "Historical profile before the current investing baseline becomes active.",
    };
  }

  return {
    ...anchor,
    monthKey,
    annualReserveAmount,
    baselineProfile: "forecast_investing",
  };
}

function sumIncomeForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

function sumExpensesForMonth(entries: ExpenseEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

function buildMonthlyRows(draft: ImportDraft): MonthlyPlanRow[] {
  const anchor = draft.monthlyBaselines[0];
  if (!anchor) {
    return [];
  }

  const monthKeys = uniqueMonthKeys(draft.incomeEntries, draft.expenseEntries);

  return monthKeys.map((monthKey) => {
    const baseline = buildBaselineForMonth(anchor, monthKey);
    const annualReserveAmount = baseline.annualReserveAmount ?? 0;
    const importedIncomeAmount = sumIncomeForMonth(draft.incomeEntries, monthKey);
    const importedExpenseAmount = sumExpensesForMonth(draft.expenseEntries, monthKey);

    return {
      monthKey,
      baselineProfile: baseline.baselineProfile,
      netSalaryAmount: baseline.netSalaryAmount,
      baselineFixedAmount: baseline.fixedExpensesAmount,
      baselineVariableAmount: baseline.baselineVariableAmount,
      annualReserveAmount,
      plannedSavingsAmount: baseline.plannedSavingsAmount,
      baselineAvailableAmount: roundCurrency(
        baseline.netSalaryAmount -
          baseline.fixedExpensesAmount -
          baseline.baselineVariableAmount -
          baseline.plannedSavingsAmount,
      ),
      importedIncomeAmount,
      importedExpenseAmount,
      netAfterImportedFlows: roundCurrency(
        baseline.netSalaryAmount -
          baseline.fixedExpensesAmount -
          baseline.baselineVariableAmount -
          baseline.plannedSavingsAmount +
          importedIncomeAmount -
          importedExpenseAmount,
      ),
    };
  });
}

function buildMarkdown(report: MonthlyPlanReport): string {
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

main();
