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
  const groupedRows = groupTransactions(actuals.transactions ?? [], selectedMonths, granularity);
  const categoryRows = categoryTotalsForMonths(actuals.transactions ?? [], selectedMonths);
  const selectedMonthCount = Math.max(1, selectedMonths.length);
  const categoryAverageRows = categoryRows
    .map((row) => ({
      category: displayCategory(row.category),
      amount: Math.round(row.amount / selectedMonthCount),
      totalAmount: row.amount,
    }))
    .filter((row) => row.amount > 0)
    .slice(0, 8);
  const totalExpense = categoryRows.reduce((sum, row) => sum + row.amount, 0);
  const averageExpense = totalExpense / selectedMonthCount;
  const tradingNetAmount = groupedRows.reduce((sum, row) => sum + row.tradingNetAmount, 0);

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
    amount: row.consumerExpenseAmount,
    average: average(groupedRows.map((entry) => entry.consumerExpenseAmount)),
  }));
  const consumptionTrend = trendPerPeriod(consumptionRows.map((row) => row.amount));
  if (consumptionMetaTarget) {
    consumptionMetaTarget.textContent = `Trend ${trendLabel(consumptionTrend, euro)} pro ${granularityLabel(granularity)} · Durchschnitt ${euro.format(average(consumptionRows.map((row) => row.amount)))} · Trading ausgeschlossen`;
  }

  const wealthRows = groupedRows.map((row) => ({
    period: row.label,
    amount: row.regularIncomeAmount - row.consumerExpenseAmount,
    average: average(groupedRows.map((entry) => entry.regularIncomeAmount - entry.consumerExpenseAmount)),
  }));
  const wealthTrend = trendPerPeriod(wealthRows.map((row) => row.amount));
  if (wealthMetaTarget) {
    wealthMetaTarget.textContent = `Tendenz ${trendLabel(wealthTrend, euro)} pro ${granularityLabel(granularity)} · Trading/Investment separat ${euro.format(tradingNetAmount)}`;
  }

  const incomeExpenseRows = groupedRows.slice(-10).map((row) => ({
    period: row.label,
    einnahmen: row.regularIncomeAmount,
    ausgaben: row.consumerExpenseAmount,
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
  renderLineChart(modules, "financeWealthTrendChart", input.wealthRows, "Vermögen");
}

function loadSapVizModules() {
  return new Promise((resolve) => {
    const sapUi = window.sap?.ui;
    if (!sapUi?.require) {
      resolve(null);
      return;
    }
    applySapUiTheme();
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

function applySapUiTheme() {
  const sapUi = window.sap?.ui;
  const theme = document.documentElement?.dataset?.theme === "dark" ? "sap_horizon_dark" : "sap_horizon";
  try {
    sapUi?.getCore?.().applyTheme?.(theme);
  } catch {
    // SAPUI5 chart theming is a best-effort layer inside the Web Components app.
  }
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
  const style = chartStyle();
  const chart = new VizFrame({
    width: "100%",
    height: chartHeight(vizType),
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
    general: { background: { color: "transparent" } },
    legend: {
      label: { style: { color: style.textColor } },
      title: { visible: false },
    },
    valueAxis: {
      label: { style: { color: style.mutedColor, fontSize: "13px" } },
      title: { visible: false },
      axisLine: { visible: false },
      gridline: { color: style.gridColor },
    },
    categoryAxis: {
      label: { style: { color: style.mutedColor, fontSize: "13px" } },
      title: { visible: false },
      axisLine: { color: style.gridColor },
    },
    plotArea: {
      colorPalette: style.palette,
      background: { color: "transparent" },
    },
    interaction: { selectability: { mode: "single" } },
    ...mergeVizProperties(config.properties, style),
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

function groupTransactions(transactions, months, granularity) {
  const groups = new Map();
  const selected = new Set(months);
  for (const entry of transactions) {
    if (!selected.has(entry.monthKey)) {
      continue;
    }
    const key = periodKey(entry.monthKey, granularity);
    const group = groups.get(key) ?? {
      key,
      label: periodLabel(key, granularity),
      regularIncomeAmount: 0,
      consumerExpenseAmount: 0,
      tradingNetAmount: 0,
      monthCount: 0,
    };
    const amount = Number(entry.amount ?? 0);
    if (isRegularIncome(entry)) {
      group.regularIncomeAmount += amount;
    } else if (isConsumerExpense(entry)) {
      group.consumerExpenseAmount += Math.abs(amount);
    } else if (isTradingOrInvestmentFlow(entry)) {
      group.tradingNetAmount += amount;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      monthCount: months.filter((monthKey) => periodKey(monthKey, granularity) === group.key).length,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
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

function isRegularIncome(entry) {
  if (!entry || Number(entry.amount ?? 0) <= 0 || entry.isTransfer || entry.excludedFromFreeIncome) {
    return false;
  }
  const subCategory = String(entry.subCategory ?? "");
  return entry.mainCategory === "Einnahmen" && /lohn|gehalt|rente|pension/i.test(subCategory);
}

function isTradingOrInvestmentFlow(entry) {
  const text = `${entry.mainCategory ?? ""} ${entry.subCategory ?? ""}`;
  return /kapitalertraege|kapitalanlage|sparen|finanzen|steuer/i.test(text);
}

function displayCategory(category) {
  return String(category ?? "")
    .replaceAll("Mobilitaet", "Mobilität")
    .replaceAll("regelmaessig", "regelmäßig");
}

function chartStyle() {
  const dark = document.documentElement?.dataset?.theme === "dark";
  return {
    textColor: dark ? "#f2f6fb" : "#17202a",
    mutedColor: dark ? "#c7d1dd" : "#516070",
    gridColor: dark ? "#44515f" : "#d7dde4",
    palette: [
      dark ? "#74bbff" : "#2892ef",
      dark ? "#79e1a0" : "#38b46d",
      dark ? "#ffd36e" : "#d89a26",
      dark ? "#ff9d7b" : "#ee6f4b",
      dark ? "#c8a5ff" : "#8f6bff",
      dark ? "#72e4df" : "#18bcb0",
      dark ? "#ff89b4" : "#df4e84",
      dark ? "#c6ea76" : "#93bd38",
      dark ? "#aab7c6" : "#718196",
    ],
  };
}

function mergeVizProperties(properties = {}, style) {
  return {
    ...properties,
    plotArea: {
      colorPalette: style.palette,
      background: { color: "transparent" },
      ...(properties.plotArea ?? {}),
    },
    legend: {
      label: { style: { color: style.textColor, fontSize: "13px" } },
      title: { visible: false },
      ...(properties.legend ?? {}),
    },
    valueAxis: {
      label: { style: { color: style.mutedColor, fontSize: "13px" } },
      title: { visible: false },
      axisLine: { visible: false },
      gridline: { color: style.gridColor },
      ...(properties.valueAxis ?? {}),
    },
    categoryAxis: {
      label: { style: { color: style.mutedColor, fontSize: "13px" } },
      title: { visible: false },
      axisLine: { color: style.gridColor },
      ...(properties.categoryAxis ?? {}),
    },
  };
}

function chartHeight(vizType) {
  const width = window.innerWidth || 1440;
  if (width <= 720) {
    return vizType === "donut" ? "300px" : "320px";
  }
  if (width <= 1240) {
    return vizType === "donut" ? "340px" : "360px";
  }
  return vizType === "donut" ? "400px" : "390px";
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
