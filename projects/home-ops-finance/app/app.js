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

function renderValidationSignals(draftReport, monthlyPlan) {
  const target = document.getElementById("validationSignals");
  if (!target) return;

  const signals = [];
  const delta = draftReport.baselineSummary?.deltaToAnchor ?? 0;
  const negativeMonths = monthlyPlan.rows.filter((row) => row.netAfterImportedFlows < 0);
  const futureRows = monthlyPlan.rows.filter((row) => row.monthKey >= "2026-03");
  const latestDebt = draftReport.latestDebtBalances.reduce((sum, row) => sum + row.balance, 0);

  if (Math.abs(delta) > 0.01) {
    signals.push({
      level: "warn",
      title: "Baseline-Anker weicht vom Rechenweg ab",
      body: `Im Workbook liegt aktuell eine Differenz von ${euro.format(delta)} zwischen Ankerwert und neu berechneter Baseline. Das ist genau die Art Stelle, die wir in der App sichtbar halten wollen.`,
    });
  }

  if (negativeMonths.length > 0) {
    const worstMonth = [...negativeMonths].sort((left, right) => left.netAfterImportedFlows - right.netAfterImportedFlows)[0];
    signals.push({
      level: "warn",
      title: `${negativeMonths.length} Monate liegen nach Importen im Minus`,
      body: `Schwaechster Monat aktuell: ${worstMonth.monthKey} mit ${euro.format(worstMonth.netAfterImportedFlows)}. Diese Monate solltest du beim ersten Test besonders kontrollieren.`,
    });
  }

  if (futureRows.length > 0) {
    const positiveFuture = futureRows.filter((row) => row.netAfterImportedFlows >= 0).length;
    signals.push({
      level: "info",
      title: "Forecast-Phase ist bereits modelliert",
      body: `${positiveFuture} von ${futureRows.length} Zukunftsmonaten liegen in der aktuellen Rechnung nicht im Minus. Das hilft uns spaeter beim Abgleich gegen deine Prognose-Logik.`,
    });
  }

  signals.push({
    level: latestDebt > 0 ? "info" : "warn",
    title: "Letzte bekannte Schuldenstaende importiert",
    body: `Aktuell sind ${draftReport.latestDebtBalances.length} Schuldenkonten mit zusammen ${euro.format(latestDebt)} im Report sichtbar.`,
  });

  target.innerHTML = signals
    .map(
      (signal) => `
        <li>
          <span class="signal-label ${signal.level}">${signal.level === "warn" ? "Pruefen" : "Info"}</span>
          <strong>${signal.title}</strong>
          <p>${signal.body}</p>
        </li>
      `,
    )
    .join("");
}

function renderMonthHealth(monthlyPlan) {
  const target = document.getElementById("monthHealth");
  if (!target) return;

  const rows = monthlyPlan.rows;
  const negativeMonths = rows.filter((row) => row.netAfterImportedFlows < 0);
  const bestMonth = [...rows].sort((left, right) => right.netAfterImportedFlows - left.netAfterImportedFlows)[0];
  const worstMonth = [...rows].sort((left, right) => left.netAfterImportedFlows - right.netAfterImportedFlows)[0];
  const lastMonth = rows.at(-1);
  const entries = [
    ["Monate im Plan", String(rows.length)],
    ["Defizit-Monate", String(negativeMonths.length)],
    ["Bester Monat", bestMonth ? `${bestMonth.monthKey} · ${euro.format(bestMonth.netAfterImportedFlows)}` : "-"],
    ["Schwaechster Monat", worstMonth ? `${worstMonth.monthKey} · ${euro.format(worstMonth.netAfterImportedFlows)}` : "-"],
    ["Letzter Monat", lastMonth ? `${lastMonth.monthKey} · ${euro.format(lastMonth.netAfterImportedFlows)}` : "-"],
  ];

  target.innerHTML = entries
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function bindMonthFilters(monthlyPlan) {
  const buttons = [...document.querySelectorAll("#monthFilters .pill")];
  const allRows = monthlyPlan.rows.slice(-36);

  function render(filter) {
    const rows = allRows.filter((row) => {
      if (filter === "negative") return row.netAfterImportedFlows < 0;
      if (filter === "future") return row.monthKey >= "2026-03";
      return true;
    });

    renderRows("monthlyRows", rows, (row) => `
      <tr>
        <td>${row.monthKey}</td>
        <td>${row.baselineProfile}</td>
        <td>${euro.format(row.baselineAvailableAmount)}</td>
        <td>${euro.format(row.importedIncomeAmount)}</td>
        <td>${euro.format(row.importedExpenseAmount)}</td>
        <td>${makeMoneyCell(row.netAfterImportedFlows)}</td>
      </tr>
    `);
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter ?? "all";
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render(filter);
    });
  }

  render("all");
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

  renderRows("debtRows", draftReport.latestDebtBalances, (row) => `
    <tr>
      <td>${row.debtAccountId}</td>
      <td>${euro.format(row.balance)}</td>
      <td>${row.snapshotLabel}</td>
    </tr>
  `);

  renderValidationSignals(draftReport, monthlyPlan);
  renderMonthHealth(monthlyPlan);
  bindMonthFilters(monthlyPlan);
}

bindTabs();
load().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="padding:16px;background:#fde7e4;color:#b42318">Fehler beim Laden der lokalen Finanzdaten.</div>`,
  );
});
