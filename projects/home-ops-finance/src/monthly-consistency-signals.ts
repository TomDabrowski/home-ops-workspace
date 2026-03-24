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

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

export function buildConsistencySignals(input: {
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
