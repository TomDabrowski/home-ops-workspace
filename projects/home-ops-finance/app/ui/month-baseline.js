// Shared month-baseline UI surfaces. These are not workflow-specific, but
// they belong to the month review screen rather than the main app shell.

export function renderBaselineSummaryForMonth(importDraft, monthKey, deps) {
  const {
    currentMonthlyPlan,
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
  const monthlyRow = currentMonthlyPlan()?.rows?.find((row) => row.monthKey === monthKey) ?? null;
  if (!baseline && !monthlyRow) {
    baselineSummary.innerHTML = "";
    return;
  }

  const entries = [
    ["Monat", monthKey],
    ["Nettogehalt", euro.format(monthlyRow?.netSalaryAmount ?? baseline?.netSalaryAmount ?? 0)],
    ["Fixkosten", euro.format(monthlyRow?.baselineFixedAmount ?? baseline?.fixedExpensesAmount ?? 0)],
    ["Variable Basis", euro.format(monthlyRow?.baselineVariableAmount ?? baseline?.baselineVariableAmount ?? 0)],
    ["Jahreskostenblock", euro.format(monthlyRow?.annualReserveAmount ?? baseline?.annualReserveAmount ?? 0)],
    ["Basis-Investment", euro.format(monthlyRow?.plannedSavingsAmount ?? baseline?.plannedSavingsAmount ?? 0)],
    {
      label: "Übrig nach Fixkosten",
      value: euro.format(
        (monthlyRow?.netSalaryAmount ?? baseline?.netSalaryAmount ?? 0) -
          (monthlyRow?.baselineFixedAmount ?? baseline?.fixedExpensesAmount ?? 0),
      ),
      formula: `${euro.format(monthlyRow?.netSalaryAmount ?? baseline?.netSalaryAmount ?? 0)} - ${euro.format(monthlyRow?.baselineFixedAmount ?? baseline?.fixedExpensesAmount ?? 0)} = ${euro.format((monthlyRow?.netSalaryAmount ?? baseline?.netSalaryAmount ?? 0) - (monthlyRow?.baselineFixedAmount ?? baseline?.fixedExpensesAmount ?? 0))}`,
    },
    {
      label: "Übrig nach allen Monatsblöcken",
      value: euro.format(monthlyRow?.baselineAvailableAmount ?? baseline?.computedAvailableFromParts ?? 0),
      formula: `${euro.format(monthlyRow?.netSalaryAmount ?? baseline?.netSalaryAmount ?? 0)} - ${euro.format(monthlyRow?.baselineFixedAmount ?? baseline?.fixedExpensesAmount ?? 0)} - ${euro.format(monthlyRow?.baselineVariableAmount ?? baseline?.baselineVariableAmount ?? 0)} - ${euro.format(monthlyRow?.annualReserveAmount ?? baseline?.annualReserveAmount ?? 0)} - ${euro.format(monthlyRow?.plannedSavingsAmount ?? baseline?.plannedSavingsAmount ?? 0)} = ${euro.format(monthlyRow?.baselineAvailableAmount ?? baseline?.computedAvailableFromParts ?? 0)}`,
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
