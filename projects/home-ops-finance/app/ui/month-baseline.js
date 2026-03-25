// Shared month-baseline UI surfaces. These are not workflow-specific, but
// they belong to the month review screen rather than the main app shell.

export function renderBaselineSummaryForMonth(importDraft, monthKey, deps) {
  const {
    selectBaselineForMonth,
    buildBaselineForMonth,
    euro,
    renderDetailEntries,
  } = deps;

  const baselineSummary = document.getElementById("baselineSummary");
  if (!baselineSummary) {
    return;
  }

  const baselineAnchor = selectBaselineForMonth(importDraft.monthlyBaselines, monthKey);
  const baseline = baselineAnchor ? buildBaselineForMonth(baselineAnchor, monthKey) : null;
  if (!baseline) {
    baselineSummary.innerHTML = "";
    return;
  }

  const entries = [
    ["Monat", monthKey],
    ["Nettogehalt", euro.format(baseline.netSalaryAmount)],
    ["Fixkosten", euro.format(baseline.fixedExpensesAmount)],
    ["Variable Basis", euro.format(baseline.baselineVariableAmount)],
    ["Jahreskostenblock", euro.format(baseline.annualReserveAmount)],
    ["Basis-Investment", euro.format(baseline.plannedSavingsAmount)],
    {
      label: "Übrig nach Fixkosten",
      value: euro.format(baseline.netSalaryAmount - baseline.fixedExpensesAmount),
      formula: `${euro.format(baseline.netSalaryAmount)} - ${euro.format(baseline.fixedExpensesAmount)} = ${euro.format(baseline.netSalaryAmount - baseline.fixedExpensesAmount)}`,
    },
    {
      label: "Übrig nach allen Monatsblöcken",
      value: euro.format(baseline.computedAvailableFromParts),
      formula: `${euro.format(baseline.netSalaryAmount)} - ${euro.format(baseline.fixedExpensesAmount)} - ${euro.format(baseline.baselineVariableAmount)} - ${euro.format(baseline.annualReserveAmount)} - ${euro.format(baseline.plannedSavingsAmount)} = ${euro.format(baseline.computedAvailableFromParts)}`,
    },
  ];

  baselineSummary.innerHTML = renderDetailEntries(entries);
}

export function renderSelectedMonthSharedUi(importDraft, monthKey, deps) {
  const {
    activeBaselineLineItemsForMonth,
    baselineCategoryLabel,
    baselineAmountLabel,
    renderRows,
    euro,
  } = deps;

  const visibleBaselineLineItems = activeBaselineLineItemsForMonth(importDraft, monthKey);
  const monthlyCostTotalTarget = document.getElementById("baselineActiveTotals");
  const monthlyCostTotal = visibleBaselineLineItems
    .filter((item) => item.category === "fixed" || item.category === "variable")
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

  if (monthlyCostTotalTarget) {
    monthlyCostTotalTarget.textContent = `Gesamtausgaben pro Monat ohne Jahreskosten: ${euro.format(monthlyCostTotal)}`;
  }

  renderRows("baselineLineItems", visibleBaselineLineItems, (row) => `
    <tr>
      <td>${row.label}${row.pendingStopLabel ? `<div class="cell-note">${row.pendingStopLabel}</div>` : ""}</td>
      <td>${baselineCategoryLabel(row.category)}</td>
      <td>${baselineAmountLabel(row, importDraft)}</td>
      <td><div class="filter-group">
        <button class="pill" type="button" data-baseline-edit="${row.id}">Ab Datum ändern</button>
        <button class="pill" type="button" data-baseline-stop="${row.id}">Ab Datum beenden</button>
      </div></td>
    </tr>
  `);
}
