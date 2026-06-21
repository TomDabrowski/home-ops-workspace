const chartState = new Map();

export function renderFinanzguruVizCharts(actuals, analysis, deps) {
  const {
    compareMonthKeys,
    formatMonthLabel,
    renderDetailEntries,
    euro,
  } = deps;

  const rangeSelect = document.getElementById("financeAnalyticsRange");
  const granularitySelect = document.getElementById("financeAnalyticsGranularity");
  const range = selectValue(rangeSelect, "12m");
  const granularity = selectValue(granularitySelect, "month");
  const chartIds = [
    "financeCategoryDonutChart",
    "financeIncomeExpenseChart",
    "financeConsumptionTrendChart",
    "financeWealthTrendChart",
  ];

  if (!analysis?.hasActuals || !actuals) {
    for (const id of chartIds) {
      renderChartFallback(id, "Noch keine Finanzguru-Istdaten.");
    }
    return;
  }

  const completeMonths = [...analysis.completeMonths].sort(compareMonthKeys);
  const selectedMonths = selectMonths(completeMonths, range);
  const groupedRows = groupMonthlySummaries(actuals.monthlySummaries ?? [], selectedMonths, granularity);
  const categoryRows = categoryTotalsForMonths(actuals.transactions ?? [], selectedMonths);
  const selectedMonthCount = Math.max(1, selectedMonths.length);
  const categoryAverageRows = categoryRows
    .map((row) => ({
      category: row.category,
      amount: Math.round(row.amount / selectedMonthCount),
      totalAmount: row.amount,
    }))
    .filter((row) => row.amount > 0)
    .slice(0, 8);
  const totalExpense = categoryRows.reduce((sum, row) => sum + row.amount, 0);
  const averageExpense = totalExpense / selectedMonthCount;

  const averageMetaTarget = document.getElementById("financeAverageChartMeta");
  const averageValueTarget = document.getElementById("financeAverageChartValue");
  const consumptionMetaTarget = document.getElementById("financeConsumptionTrendMeta");
  const wealthMetaTarget = document.getElementById("financeWealthTrendMeta");
  if (averageMetaTarget) {
    averageMetaTarget.textContent = `${selectedMonths.length} volle Monate · ${rangeLabel(range)}`;
  }
  if (averageValueTarget) {
    averageValueTarget.textContent = euro.format(averageExpense);
  }

  const consumptionRows = groupedRows.map((row) => ({
    period: row.label,
    amount: row.coreExpenseAmount,
    average: average(groupedRows.map((entry) => entry.coreExpenseAmount)),
  }));
  const consumptionTrend = trendPerPeriod(consumptionRows.map((row) => row.amount));
  if (consumptionMetaTarget) {
    consumptionMetaTarget.textContent = `Trend ${trendLabel(consumptionTrend, euro)} pro ${granularityLabel(granularity)} · Durchschnitt ${euro.format(average(consumptionRows.map((row) => row.amount)))}`;
  }

  const wealthRows = groupedRows.map((row) => ({
    period: row.label,
    amount: row.netAmount + row.investmentLikeAmount,
    average: average(groupedRows.map((entry) => entry.netAmount + entry.investmentLikeAmount)),
  }));
  const wealthTrend = trendPerPeriod(wealthRows.map((row) => row.amount));
  if (wealthMetaTarget) {
    wealthMetaTarget.textContent = `Tendenz ${trendLabel(wealthTrend, euro)} pro ${granularityLabel(granularity)} · Cash-Snapshot ${euro.format(analysis.cashSnapshotTotal)}`;
  }

  const incomeExpenseRows = groupedRows.slice(-10).map((row) => ({
    period: row.label,
    einnahmen: row.incomeAmount,
    ausgaben: row.expenseAmount,
  }));

  void renderVizFrames({
    categoryRows: categoryAverageRows,
    incomeExpenseRows,
    consumptionRows,
    wealthRows,
    euro,
    renderDetailEntries,
  });

  if (rangeSelect) {
    rangeSelect.onchange = () => renderFinanzguruVizCharts(actuals, analysis, deps);
  }
  if (granularitySelect) {
    granularitySelect.onchange = () => renderFinanzguruVizCharts(actuals, analysis, deps);
  }
}

async function renderVizFrames(input) {
  const modules = await loadSapVizModules();
  if (!modules) {
    renderChartFallback("financeCategoryDonutChart", "SAPUI5 VizFrame konnte nicht geladen werden.");
    renderChartFallback("financeIncomeExpenseChart", "SAPUI5 VizFrame konnte nicht geladen werden.");
    renderChartFallback("financeConsumptionTrendChart", "SAPUI5 VizFrame konnte nicht geladen werden.");
    renderChartFallback("financeWealthTrendChart", "SAPUI5 VizFrame konnte nicht geladen werden.");
    return;
  }

  renderDonutChart(modules, "financeCategoryDonutChart", input.categoryRows, {
    onSelect: (row) => renderSelectedCategory(row, input),
  });
  renderColumnChart(modules, "financeIncomeExpenseChart", input.incomeExpenseRows);
  renderLineChart(modules, "financeConsumptionTrendChart", input.consumptionRows, "Konsum");
  renderLineChart(modules, "financeWealthTrendChart", input.wealthRows, "Vermoegen");
}

function loadSapVizModules() {
  return new Promise((resolve) => {
    const sapUi = window.sap?.ui;
    if (!sapUi?.require) {
      resolve(null);
      return;
    }
    sapUi.require(
      [
        "sap/viz/ui5/controls/VizFrame",
        "sap/viz/ui5/data/FlattenedDataset",
        "sap/viz/ui5/controls/common/feeds/FeedItem",
        "sap/ui/model/json/JSONModel",
      ],
      (VizFrame, FlattenedDataset, FeedItem, JSONModel) => resolve({
        VizFrame,
        FlattenedDataset,
        FeedItem,
        JSONModel,
      }),
      () => resolve(null),
    );
  });
}

function renderDonutChart(modules, hostId, rows, options = {}) {
  const host = resetChartHost(hostId);
  if (!host || rows.length === 0) {
    renderChartFallback(hostId, "Keine Kategorien im gewählten Zeitraum.");
    return;
  }

  const chart = createVizFrame(modules, hostId, "donut", rows, {
    dimensions: [{ name: "Kategorie", value: "{category}" }],
    measures: [{ name: "Ausgaben", value: "{amount}" }],
    feeds: [
      { uid: "size", type: "Measure", values: ["Ausgaben"] },
      { uid: "color", type: "Dimension", values: ["Kategorie"] },
    ],
    properties: {
      plotArea: {
        dataLabel: { visible: true, type: "percentage" },
      },
      legend: { visible: true },
    },
  });
  chart.attachSelectData((event) => {
    const selected = event.getParameter("data")?.[0]?.data;
    const category = selected?.Kategorie;
    const row = rows.find((entry) => entry.category === category);
    if (row) {
      options.onSelect?.(row);
    }
  });
  chart.placeAt(host);
}

function renderColumnChart(modules, hostId, rows) {
  const host = resetChartHost(hostId);
  if (!host || rows.length === 0) {
    renderChartFallback(hostId, "Keine Monatswerte im gewählten Zeitraum.");
    return;
  }

  createVizFrame(modules, hostId, "column", rows, {
    dimensions: [{ name: "Zeitraum", value: "{period}" }],
    measures: [
      { name: "Einnahmen", value: "{einnahmen}" },
      { name: "Ausgaben", value: "{ausgaben}" },
    ],
    feeds: [
      { uid: "valueAxis", type: "Measure", values: ["Einnahmen", "Ausgaben"] },
      { uid: "categoryAxis", type: "Dimension", values: ["Zeitraum"] },
    ],
    properties: {
      plotArea: { dataLabel: { visible: false } },
      valueAxis: { title: { visible: false } },
      categoryAxis: { title: { visible: false } },
      legend: { visible: true },
    },
  }).placeAt(host);
}

function renderLineChart(modules, hostId, rows, measureName) {
  const host = resetChartHost(hostId);
  if (!host || rows.length === 0) {
    renderChartFallback(hostId, "Keine Werte im gewählten Zeitraum.");
    return;
  }

  createVizFrame(modules, hostId, "line", rows, {
    dimensions: [{ name: "Zeitraum", value: "{period}" }],
    measures: [
      { name: measureName, value: "{amount}" },
      { name: "Durchschnitt", value: "{average}" },
    ],
    feeds: [
      { uid: "valueAxis", type: "Measure", values: [measureName, "Durchschnitt"] },
      { uid: "categoryAxis", type: "Dimension", values: ["Zeitraum"] },
    ],
    properties: {
      plotArea: { dataLabel: { visible: false } },
      valueAxis: { title: { visible: false } },
      categoryAxis: { title: { visible: false } },
      legend: { visible: true },
    },
  }).placeAt(host);
}

function createVizFrame(modules, hostId, vizType, rows, config) {
  const { VizFrame, FlattenedDataset, FeedItem, JSONModel } = modules;
  const chart = new VizFrame({
    width: "100%",
    height: "320px",
    vizType,
  });
  chart.setDataset(new FlattenedDataset({
    dimensions: config.dimensions,
    measures: config.measures,
    data: { path: "/items" },
  }));
  chart.setModel(new JSONModel({ items: rows }));
  for (const feed of config.feeds) {
    chart.addFeed(new FeedItem(feed));
  }
  chart.setVizProperties({
    title: { visible: false },
    interaction: { selectability: { mode: "single" } },
    ...config.properties,
  });
  chartState.set(hostId, chart);
  return chart;
}

function resetChartHost(hostId) {
  const existing = chartState.get(hostId);
  if (existing?.destroy) {
    existing.destroy();
  }
  chartState.delete(hostId);
  const host = document.getElementById(hostId);
  if (host) {
    host.innerHTML = "";
  }
  return host;
}

function renderChartFallback(hostId, message) {
  const host = resetChartHost(hostId);
  if (host) {
    host.innerHTML = `<div class="chart-fallback">${escapeHtml(message)}</div>`;
  }
}

function renderSelectedCategory(row, input) {
  const target = document.getElementById("financeCategorySelection");
  if (!target) {
    return;
  }
  target.innerHTML = input.renderDetailEntries([
    ["Kategorie", row.category],
    ["Ø pro Monat", input.euro.format(row.amount)],
    ["Summe Zeitraum", input.euro.format(row.totalAmount)],
  ]);
}

function selectValue(element, fallback) {
  return typeof element?.value === "string" && element.value ? element.value : fallback;
}

function selectMonths(months, range) {
  if (range === "all") {
    return months;
  }
  const count = range === "6m" ? 6 : 12;
  return months.slice(-count);
}

function groupMonthlySummaries(summaries, months, granularity) {
  const groups = new Map();
  const selected = new Set(months);
  for (const summary of summaries) {
    if (!selected.has(summary.monthKey)) {
      continue;
    }
    const key = periodKey(summary.monthKey, granularity);
    const group = groups.get(key) ?? {
      key,
      label: periodLabel(key, granularity),
      incomeAmount: 0,
      expenseAmount: 0,
      coreExpenseAmount: 0,
      investmentLikeAmount: 0,
      transferAmount: 0,
      monthCount: 0,
      netAmount: 0,
    };
    group.incomeAmount += Number(summary.incomeAmount ?? 0);
    group.expenseAmount += Number(summary.expenseAmount ?? 0);
    group.coreExpenseAmount += Number(summary.coreExpenseAmount ?? 0);
    group.investmentLikeAmount += Number(summary.investmentLikeAmount ?? 0);
    group.transferAmount += Number(summary.transferAmount ?? 0);
    group.netAmount += Number(summary.incomeAmount ?? 0) - Number(summary.expenseAmount ?? 0);
    group.monthCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function categoryTotalsForMonths(transactions, months) {
  const selected = new Set(months);
  const totals = new Map();
  for (const entry of transactions) {
    if (!selected.has(entry.monthKey) || !isConsumerExpense(entry)) {
      continue;
    }
    const category = String(entry.mainCategory || "Sonstiges");
    totals.set(category, (totals.get(category) ?? 0) + Math.abs(Number(entry.amount ?? 0)));
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((left, right) => right.amount - left.amount);
}

function isConsumerExpense(entry) {
  if (!entry || Number(entry.amount ?? 0) >= 0 || entry.isTransfer || entry.excludedFromFreeIncome) {
    return false;
  }
  if (entry.mainCategory === "Sparen" || entry.mainCategory === "Finanzen" || entry.mainCategory === "Sonstiges") {
    return false;
  }
  if (entry.subCategory === "Kapitalanlage" || entry.subCategory === "Sparen") {
    return false;
  }
  return true;
}

function periodKey(monthKey, granularity) {
  const year = String(monthKey).slice(0, 4);
  const month = Number(String(monthKey).slice(5, 7));
  if (granularity === "year") {
    return year;
  }
  if (granularity === "quarter") {
    return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  }
  return monthKey;
}

function periodLabel(key, granularity) {
  if (granularity === "month") {
    return key.slice(2);
  }
  return key;
}

function rangeLabel(range) {
  if (range === "6m") {
    return "letzte 6 Monate";
  }
  if (range === "all") {
    return "alle vollen Monate";
  }
  return "letzte 12 Monate";
}

function granularityLabel(granularity) {
  if (granularity === "quarter") {
    return "Quartal";
  }
  if (granularity === "year") {
    return "Jahr";
  }
  return "Monat";
}

function trendPerPeriod(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length < 2) {
    return 0;
  }
  const n = finiteValues.length;
  const meanX = (n - 1) / 2;
  const meanY = average(finiteValues);
  let numerator = 0;
  let denominator = 0;
  finiteValues.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator > 0 ? numerator / denominator : 0;
}

function trendLabel(value, euro) {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${euro.format(value)}`;
}

function average(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length > 0 ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
