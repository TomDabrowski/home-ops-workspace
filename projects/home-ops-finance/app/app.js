const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function classForValue(value) {
  return value >= 0 ? "positive" : "negative";
}

function renderRows(targetId, rows, mapper) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = rows.map(mapper).join("");
}

function makeMoneyCell(value) {
  return `<span class="${classForValue(value)}">${euro.format(value)}</span>`;
}

function bindTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = [...document.querySelectorAll(".tab-panel")];

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === target));
    });
  }
}

async function load() {
  const [draftReport, monthlyPlan] = await Promise.all([
    fetch("/data/draft-report.json").then((response) => response.json()),
    fetch("/data/monthly-plan.json").then((response) => response.json()),
  ]);

  setText("workbookPath", draftReport.workbookPath);
  setText("generatedAt", draftReport.generatedAt);
  setText("netFlow", euro.format(draftReport.totals.netFlow));
  setText("incomeTotal", euro.format(draftReport.totals.incomeTotal));
  setText("expenseTotal", euro.format(draftReport.totals.expenseTotal));
  setText("debtSnapshotCount", String(draftReport.totals.debtSnapshotCount));

  const baseline = draftReport.baselineSummary;
  const baselineSummary = document.getElementById("baselineSummary");
  if (baselineSummary && baseline) {
    const entries = [
      ["Monat", baseline.monthKey],
      ["Nettogehalt", euro.format(baseline.netSalaryAmount)],
      ["Fixkosten", euro.format(baseline.fixedExpensesAmount)],
      ["Variable Basis", euro.format(baseline.baselineVariableAmount)],
      ["Jaehrliche Ruecklage", euro.format(baseline.annualReserveAmount)],
      ["Sparen", euro.format(baseline.plannedSavingsAmount)],
      ["Verfuegbar laut Workbook", euro.format(baseline.availableBeforeIrregulars)],
      ["Neu berechnet", euro.format(baseline.computedAvailableFromParts)],
      ["Differenz", euro.format(baseline.deltaToAnchor)],
    ];
    baselineSummary.innerHTML = entries
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join("");
  }

  renderRows("topExpenseMonths", draftReport.topExpenseMonths, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.incomeTotal)}</td>
      <td>${euro.format(row.expenseTotal)}</td>
      <td>${makeMoneyCell(row.netFlow)}</td>
    </tr>
  `);

  renderRows("topIncomeMonths", draftReport.topIncomeMonths, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.incomeTotal)}</td>
      <td>${euro.format(row.expenseTotal)}</td>
      <td>${makeMoneyCell(row.netFlow)}</td>
    </tr>
  `);

  renderRows("baselineProfiles", draftReport.baselineProfiles, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.availableBeforeIrregulars)}</td>
      <td>${euro.format(row.plannedSavingsAmount)}</td>
    </tr>
  `);

  renderRows("baselineLineItems", draftReport.baselineLineItems, (row) => `
    <tr>
      <td>${row.label}</td>
      <td>${row.category}</td>
      <td>${euro.format(row.amount)}</td>
    </tr>
  `);

  renderRows("monthlyRows", monthlyPlan.rows.slice(-24), (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${row.baselineProfile}</td>
      <td>${euro.format(row.baselineAvailableAmount)}</td>
      <td>${euro.format(row.importedIncomeAmount)}</td>
      <td>${euro.format(row.importedExpenseAmount)}</td>
      <td>${makeMoneyCell(row.netAfterImportedFlows)}</td>
    </tr>
  `);

  renderRows("debtRows", draftReport.latestDebtBalances, (row) => `
    <tr>
      <td>${row.debtAccountId}</td>
      <td>${euro.format(row.balance)}</td>
      <td>${row.snapshotLabel}</td>
    </tr>
  `);
}

bindTabs();
load().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="padding:16px;background:#fde7e4;color:#b42318">Fehler beim Laden der lokalen Finanzdaten.</div>`,
  );
});
