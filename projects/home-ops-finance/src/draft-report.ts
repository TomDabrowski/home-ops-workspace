import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DebtSnapshot, ExpenseEntry, ImportDraft, IncomeEntry } from "./types.js";

interface MonthlySummary {
  monthKey: string;
  incomeTotal: number;
  expenseTotal: number;
  netFlow: number;
  incomeCount: number;
  expenseCount: number;
}

interface DebtLatest {
  debtAccountId: string;
  snapshotLabel: string;
  balance: number;
}

interface DraftReport {
  workbookPath: string;
  generatedAt: string;
  totals: {
    incomeTotal: number;
    expenseTotal: number;
    netFlow: number;
    incomeCount: number;
    expenseCount: number;
    debtSnapshotCount: number;
  };
  baselineSummary: {
    monthKey: string;
    netSalaryAmount: number;
    fixedExpensesAmount: number;
    baselineVariableAmount: number;
    annualReserveAmount: number;
    plannedSavingsAmount: number;
    availableBeforeIrregulars: number;
    computedAvailableFromParts: number;
    deltaToAnchor: number;
  } | null;
  baselineLineItems: Array<{
    id: string;
    label: string;
    amount: number;
    category: string;
  }>;
  topExpenseMonths: MonthlySummary[];
  topIncomeMonths: MonthlySummary[];
  recentMonths: MonthlySummary[];
  latestDebtBalances: DebtLatest[];
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

function summarizeMonths(incomeEntries: IncomeEntry[], expenseEntries: ExpenseEntry[]): MonthlySummary[] {
  const months = new Map<string, MonthlySummary>();

  for (const entry of incomeEntries) {
    const key = monthFromDate(entry.entryDate);
    const current = months.get(key) ?? {
      monthKey: key,
      incomeTotal: 0,
      expenseTotal: 0,
      netFlow: 0,
      incomeCount: 0,
      expenseCount: 0,
    };

    current.incomeTotal += entry.amount;
    current.incomeCount += 1;
    months.set(key, current);
  }

  for (const entry of expenseEntries) {
    const key = monthFromDate(entry.entryDate);
    const current = months.get(key) ?? {
      monthKey: key,
      incomeTotal: 0,
      expenseTotal: 0,
      netFlow: 0,
      incomeCount: 0,
      expenseCount: 0,
    };

    current.expenseTotal += entry.amount;
    current.expenseCount += 1;
    months.set(key, current);
  }

  return [...months.values()]
    .map((item) => ({
      ...item,
      incomeTotal: roundCurrency(item.incomeTotal),
      expenseTotal: roundCurrency(item.expenseTotal),
      netFlow: roundCurrency(item.incomeTotal - item.expenseTotal),
    }))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function latestDebtBalances(snapshots: DebtSnapshot[]): DebtLatest[] {
  const latest = new Map<string, DebtLatest>();

  for (const snapshot of snapshots) {
    latest.set(snapshot.debtAccountId, {
      debtAccountId: snapshot.debtAccountId,
      snapshotLabel: snapshot.snapshotLabel,
      balance: snapshot.balance,
    });
  }

  return [...latest.values()].sort((left, right) => left.debtAccountId.localeCompare(right.debtAccountId));
}

function buildMarkdown(report: DraftReport): string {
  const lines: string[] = [];

  lines.push("# Draft Report");
  lines.push("");
  lines.push(`Source workbook: \`${report.workbookPath}\``);
  lines.push(`Generated at: \`${report.generatedAt}\``);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Income entries: ${report.totals.incomeCount}`);
  lines.push(`- Expense entries: ${report.totals.expenseCount}`);
  lines.push(`- Imported income total: ${report.totals.incomeTotal.toFixed(2)} EUR`);
  lines.push(`- Imported expense total: ${report.totals.expenseTotal.toFixed(2)} EUR`);
  lines.push(`- Net imported flow: ${report.totals.netFlow.toFixed(2)} EUR`);
  lines.push(`- Debt snapshots: ${report.totals.debtSnapshotCount}`);
  if (report.baselineSummary) {
    lines.push("");
    lines.push("## Baseline Anchor");
    lines.push("");
    lines.push(
      `- ${report.baselineSummary.monthKey}: salary ${report.baselineSummary.netSalaryAmount.toFixed(2)} EUR, fixed ${report.baselineSummary.fixedExpensesAmount.toFixed(2)} EUR, variable ${report.baselineSummary.baselineVariableAmount.toFixed(2)} EUR, annual reserve ${report.baselineSummary.annualReserveAmount.toFixed(2)} EUR, savings ${report.baselineSummary.plannedSavingsAmount.toFixed(2)} EUR`,
    );
    lines.push(
      `- Available before irregulars: ${report.baselineSummary.availableBeforeIrregulars.toFixed(2)} EUR, recomputed ${report.baselineSummary.computedAvailableFromParts.toFixed(2)} EUR, delta ${report.baselineSummary.deltaToAnchor.toFixed(2)} EUR`,
    );
    lines.push("");
    lines.push("### Baseline Posten");
    lines.push("");
    for (const item of report.baselineLineItems) {
      lines.push(`- ${item.label}: ${item.amount.toFixed(2)} EUR (${item.category})`);
    }
  }
  lines.push("");
  lines.push("## Recent Months");
  lines.push("");

  for (const month of report.recentMonths) {
    lines.push(
      `- ${month.monthKey}: income ${month.incomeTotal.toFixed(2)} EUR, expenses ${month.expenseTotal.toFixed(2)} EUR, net ${month.netFlow.toFixed(2)} EUR`,
    );
  }

  lines.push("");
  lines.push("## Top Expense Months");
  lines.push("");

  for (const month of report.topExpenseMonths) {
    lines.push(
      `- ${month.monthKey}: expenses ${month.expenseTotal.toFixed(2)} EUR, income ${month.incomeTotal.toFixed(2)} EUR, net ${month.netFlow.toFixed(2)} EUR`,
    );
  }

  lines.push("");
  lines.push("## Top Income Months");
  lines.push("");

  for (const month of report.topIncomeMonths) {
    lines.push(
      `- ${month.monthKey}: income ${month.incomeTotal.toFixed(2)} EUR, expenses ${month.expenseTotal.toFixed(2)} EUR, net ${month.netFlow.toFixed(2)} EUR`,
    );
  }

  lines.push("");
  lines.push("## Latest Debt Balances");
  lines.push("");

  for (const debt of report.latestDebtBalances) {
    lines.push(`- ${debt.debtAccountId}: ${debt.balance.toFixed(2)} EUR (${debt.snapshotLabel})`);
  }

  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const inputPath = resolve(process.argv[2] ?? "data/import-draft.json");
  const outputJsonPath = resolve(process.argv[3] ?? "data/draft-report.json");
  const outputMarkdownPath = resolve(process.argv[4] ?? "data/draft-report.md");

  const draft = readDraft(inputPath);
  const monthSummaries = summarizeMonths(draft.incomeEntries, draft.expenseEntries);
  const debtBalances = latestDebtBalances(draft.debtSnapshots);
  const baseline = draft.monthlyBaselines[0] ?? null;
  const baselineSummary = baseline
    ? {
        monthKey: baseline.monthKey,
        netSalaryAmount: baseline.netSalaryAmount,
        fixedExpensesAmount: baseline.fixedExpensesAmount,
        baselineVariableAmount: baseline.baselineVariableAmount,
        annualReserveAmount: baseline.annualReserveAmount ?? 0,
        plannedSavingsAmount: baseline.plannedSavingsAmount,
        availableBeforeIrregulars: baseline.availableBeforeIrregulars,
        computedAvailableFromParts: roundCurrency(
          baseline.netSalaryAmount -
            baseline.fixedExpensesAmount -
            baseline.baselineVariableAmount -
            baseline.plannedSavingsAmount -
            (baseline.annualReserveAmount ?? 0),
        ),
        deltaToAnchor: roundCurrency(
          baseline.availableBeforeIrregulars -
            roundCurrency(
              baseline.netSalaryAmount -
                baseline.fixedExpensesAmount -
                baseline.baselineVariableAmount -
                baseline.plannedSavingsAmount -
                (baseline.annualReserveAmount ?? 0),
            ),
        ),
      }
    : null;

  const report: DraftReport = {
    workbookPath: draft.workbookPath,
    generatedAt: new Date().toISOString(),
    totals: {
      incomeTotal: roundCurrency(draft.incomeEntries.reduce((sum, entry) => sum + entry.amount, 0)),
      expenseTotal: roundCurrency(draft.expenseEntries.reduce((sum, entry) => sum + entry.amount, 0)),
      netFlow: roundCurrency(
        draft.incomeEntries.reduce((sum, entry) => sum + entry.amount, 0) -
          draft.expenseEntries.reduce((sum, entry) => sum + entry.amount, 0),
      ),
      incomeCount: draft.incomeEntries.length,
      expenseCount: draft.expenseEntries.length,
      debtSnapshotCount: draft.debtSnapshots.length,
    },
    baselineSummary,
    baselineLineItems: draft.baselineLineItems.map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      category: item.category,
    })),
    topExpenseMonths: [...monthSummaries]
      .sort((left, right) => right.expenseTotal - left.expenseTotal)
      .slice(0, 5),
    topIncomeMonths: [...monthSummaries]
      .sort((left, right) => right.incomeTotal - left.incomeTotal)
      .slice(0, 5),
    recentMonths: [...monthSummaries].slice(-12),
    latestDebtBalances: debtBalances,
  };

  writeFileSync(outputJsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeFileSync(outputMarkdownPath, buildMarkdown(report), "utf8");

  console.log(`Wrote report JSON to ${outputJsonPath}`);
  console.log(`Wrote report Markdown to ${outputMarkdownPath}`);
}

main();
