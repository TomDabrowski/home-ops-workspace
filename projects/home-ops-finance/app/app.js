const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const reviewFocusMonthKey = "2026-01";
const retirementPlannerStorageKey = "home-ops-finance-retirement-planner-v1";

const reconciliationStorageKey = "home-ops-finance-reconciliation-v1";
const mappingStorageKey = "home-ops-finance-entry-mapping-v1";
const baselineOverridesStorageKey = "home-ops-finance-baseline-overrides-v1";
const monthlyExpenseOverridesStorageKey = "home-ops-finance-monthly-expense-overrides-v1";
const monthlyMusicIncomeOverridesStorageKey = "home-ops-finance-monthly-music-income-overrides-v1";
const musicTaxSettingsStorageKey = "home-ops-finance-music-tax-settings-v1";
const forecastSettingsStorageKey = "home-ops-finance-forecast-settings-v1";
const salarySettingsStorageKey = "home-ops-finance-salary-settings-v1";
const activeTabStorageKey = "home-ops-finance-active-tab-v1";
const monthReviewStorageKey = "home-ops-finance-month-review-v1";
const monthFilterStorageKey = "home-ops-finance-month-filter-v1";
const fallbackAccountOptions = [
  { id: "giro", label: "CHECK24 Alltag" },
  { id: "cash", label: "Trade Republic Cash" },
  { id: "savings", label: "Scalable Tagesgeld" },
  { id: "investment", label: "Trade Republic Investment" },
  { id: "business", label: "Accountable Geschäftskonto" },
  { id: "debt", label: "Alt: Schuldenkonto" },
  { id: "unknown", label: "Noch offen" },
];
let reconciliationStateCache = {};
let mappingStateCache = {};
let baselineOverridesCache = [];
let monthlyExpenseOverridesCache = [];
let monthlyMusicIncomeOverridesCache = [];
let reconciliationPersistence = "browser";
let mappingPersistence = "browser";
let baselinePersistence = "browser";
let monthlyExpensePersistence = "browser";
let monthlyMusicIncomePersistence = "browser";
let musicTaxPersistence = "browser";
let forecastPersistence = "browser";
let salaryPersistence = "browser";
let accountOptions = fallbackAccountOptions;
let statusHideTimer = null;
let musicTaxSettingsCache = null;
let forecastSettingsCache = null;
let salarySettingsCache = [];

function financeState() {
  return window.__financeState ?? null;
}

function currentImportDraft() {
  return financeState()?.importDraft ?? window.__importDraft;
}

function currentMonthlyPlan() {
  return financeState()?.monthlyPlan ?? null;
}

function statusDetailForMode(mode) {
  return mode === "project"
    ? "Die Änderung wurde in den Projektdateien gespeichert."
    : "Der Server war nicht erreichbar. Die Änderung liegt vorerst nur im Browser-Fallback.";
}

function quarterLabel(monthKey) {
  const month = Number(monthKey.slice(5, 7));
  return `Q${Math.floor((month - 1) / 3) + 1} ${monthKey.slice(0, 4)}`;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function showStatus(title, detail = "", tone = "success") {
  const bar = document.getElementById("appStatusBar");
  if (!bar) return;

  bar.hidden = false;
  const toneClass =
    tone === "warn" ? "is-warn" : tone === "info" ? "is-info" : "is-success";
  bar.className = `app-status ${toneClass}`;
  bar.innerHTML = `<strong>${title}</strong>${detail ? `<p>${detail}</p>` : ""}`;

  if (statusHideTimer) {
    window.clearTimeout(statusHideTimer);
  }

  if (tone === "info") {
    return;
  }

  statusHideTimer = window.setTimeout(() => {
    bar.hidden = true;
  }, 4200);
}

async function shutdownApp() {
  const button = document.getElementById("shutdownAppButton");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (!confirmAction("Home Ops Finance wirklich beenden?")) {
    return;
  }

  button.disabled = true;
  showStatus(
    "Home Ops Finance wird beendet",
    "Der lokale Server wird gestoppt. Das Browserfenster schließt sich danach, wenn dein Browser das erlaubt.",
    "info",
  );

  try {
    const response = await fetch("/api/shutdown", { method: "POST" });
    if (!response.ok) {
      throw new Error(`shutdown_failed_${response.status}`);
    }

    window.setTimeout(() => {
      window.close();
    }, 450);
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showStatus(
      "Beenden fehlgeschlagen",
      "Der Server konnte nicht gestoppt werden. Bitte die App normal beenden oder das Log prüfen.",
      "warn",
    );
  }
}

function bindAppControls() {
  const shutdownButton = document.getElementById("shutdownAppButton");
  if (shutdownButton instanceof HTMLButtonElement) {
    shutdownButton.onclick = () => {
      shutdownApp().catch((error) => {
        console.error(error);
        showStatus(
          "Beenden fehlgeschlagen",
          "Beim Schließen ist ein unerwarteter Fehler aufgetreten.",
          "warn",
        );
      });
    };
  }
}

function activeTabId() {
  return document.querySelector(".tab.is-active")?.dataset.tab ?? "months";
}

function activeMonthFilter() {
  return document.querySelector("#monthFilters .pill.is-active")?.dataset.filter ?? "focus";
}

function saveViewState(viewState = {}) {
  window.localStorage.setItem(activeTabStorageKey, viewState.tabId ?? activeTabId());
  if (viewState.monthKey) {
    window.localStorage.setItem(monthReviewStorageKey, viewState.monthKey);
  }
  window.localStorage.setItem(monthFilterStorageKey, viewState.monthFilter ?? activeMonthFilter());
}

function currentViewState() {
  const monthSelect = document.getElementById("monthReviewSelect");

  return {
    tabId: activeTabId(),
    monthKey:
      viewStateMonthValue(monthSelect) ??
      window.localStorage.getItem(monthReviewStorageKey) ??
      null,
    monthFilter: window.localStorage.getItem(monthFilterStorageKey) ?? activeMonthFilter(),
    scrollY: window.scrollY,
  };
}

function viewStateMonthValue(monthSelect) {
  return monthSelect instanceof HTMLSelectElement ? monthSelect.value : null;
}

function activateTab(tabId) {
  const targetTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  targetTab?.click();
}

function confirmAction(message) {
  return window.confirm(message);
}

async function fetchFinanceData() {
  const importDraftPromise = fetch("/data/import-draft-reviewed.json").then((response) =>
    response.ok ? response.json() : fetch("/data/import-draft.json").then((fallback) => fallback.json()),
  );
  const draftReportPromise = fetch("/data/draft-report-reviewed.json").then((response) =>
    response.ok ? response.json() : fetch("/data/draft-report.json").then((fallback) => fallback.json()),
  );
  const monthlyPlanPromise = fetch("/data/monthly-plan-reviewed.json").then((response) =>
    response.ok ? response.json() : fetch("/data/monthly-plan.json").then((fallback) => fallback.json()),
  );

  const [draftReport, monthlyPlan, importDraft, accounts] = await Promise.all([
    draftReportPromise,
    monthlyPlanPromise,
    importDraftPromise,
    fetch("/data/accounts.json").then((response) => response.ok ? response.json() : []),
  ]);

  return { draftReport, monthlyPlan, importDraft, accounts };
}

async function refreshFinanceView(status = null) {
  const viewState = currentViewState();
  await initializeWorkflowState();
  const nextState = await fetchFinanceData();
  renderApp(nextState, viewState);
  window.scrollTo({ top: viewState.scrollY });

  if (status) {
    showStatus(status.title, status.detail, status.tone);
  }
}

function defaultPlannerSettings(monthlyPlan) {
  const forecastRows = monthlyPlan.rows.filter((row) => row.monthKey >= "2026-03");
  const referenceRow = forecastRows[0] ?? monthlyPlan.rows.at(-1);
  const defaultMonthlySpend = referenceRow
    ? Math.round(referenceRow.baselineFixedAmount + referenceRow.baselineVariableAmount + referenceRow.annualReserveAmount)
    : 1700;

  return {
    currentAge: 35,
    targetAge: 50,
    retirementSpend: defaultMonthlySpend,
    withdrawalRate: 4,
    inflationRate: 2,
    salaryGrowthRate: 3,
    rentGrowthRate: 1,
    expenseGrowthRate: 2,
    musicGrowthRate: 0,
    musicTaxRate: 42,
  };
}

function readPlannerSettings(monthlyPlan) {
  const defaults = defaultPlannerSettings(monthlyPlan);

  try {
    const saved = JSON.parse(window.localStorage.getItem(retirementPlannerStorageKey) ?? "{}");
    return {
      currentAge: Number(saved.currentAge) || defaults.currentAge,
      targetAge: Number(saved.targetAge) || defaults.targetAge,
      retirementSpend: Number(saved.retirementSpend) || defaults.retirementSpend,
      withdrawalRate: Number(saved.withdrawalRate) || defaults.withdrawalRate,
      inflationRate: Number(saved.inflationRate) || defaults.inflationRate,
      salaryGrowthRate: Number(saved.salaryGrowthRate) || defaults.salaryGrowthRate,
      rentGrowthRate: Number(saved.rentGrowthRate) || defaults.rentGrowthRate,
      expenseGrowthRate: Number(saved.expenseGrowthRate) || defaults.expenseGrowthRate,
      musicGrowthRate: Number(saved.musicGrowthRate) || defaults.musicGrowthRate,
      musicTaxRate: Number(saved.musicTaxRate) || defaults.musicTaxRate,
    };
  } catch {
    return defaults;
  }
}

function writePlannerSettings(settings) {
  window.localStorage.setItem(retirementPlannerStorageKey, JSON.stringify(settings));
}

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

function renderEmptyRow(targetId, colspan, message) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">${message}</td></tr>`;
}

function makeMoneyCell(value) {
  return `<span class="${classForValue(value)}">${euro.format(value)}</span>`;
}

function planProfileLabel(value) {
  return value === "forecast_investing" ? "Zukunftsplanung" : "Vergangenheitsdaten";
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("de-DE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function currentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthKeyToDate(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function dateToMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(monthKey, count) {
  const date = monthKeyToDate(monthKey);
  date.setUTCMonth(date.getUTCMonth() + count);
  return dateToMonthKey(date);
}

function assumptionNumber(importDraft, key, fallback) {
  const assumption = importDraft.forecastAssumptions?.find((entry) => entry.key === key);
  return typeof assumption?.value === "number" ? assumption.value : fallback;
}

function futureForecastRows(monthlyPlan) {
  return monthlyPlan.rows.filter((row) => row.monthKey >= "2026-03" && row.projectedWealthEndAmount !== undefined);
}

function buildRecurringForecastTemplates(monthlyPlan) {
  const rows = futureForecastRows(monthlyPlan);
  const lastTwelve = rows.slice(-12);
  const templates = new Map();

  for (const row of lastTwelve) {
    templates.set(Number(row.monthKey.slice(5, 7)), row);
  }

  return {
    orderedRows: rows,
    templates,
  };
}

function rowTemplateForMonth(monthlyPlan, monthKey) {
  const { orderedRows, templates } = buildRecurringForecastTemplates(monthlyPlan);
  const existing = orderedRows.find((row) => row.monthKey === monthKey);
  if (existing) {
    return existing;
  }

  if (templates.size === 0) {
    return null;
  }

  return templates.get(Number(monthKey.slice(5, 7))) ?? orderedRows.at(-1) ?? null;
}

function growthFactor(ratePercent, elapsedMonths) {
  return Math.pow(1 + ratePercent / 100, elapsedMonths / 12);
}

function currentRentAmount(importDraft, monthKey) {
  const currentItems = importDraft.baselineLineItems
    .filter((item) => item.effectiveFrom <= monthKey && item.category === "fixed" && /miete/i.test(item.label))
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));

  return currentItems.at(-1)?.amount ?? 0;
}

function yearDelta(fromMonthKey, toMonthKey) {
  return (
    (Number(toMonthKey.slice(0, 4)) - Number(fromMonthKey.slice(0, 4))) * 12 +
    (Number(toMonthKey.slice(5, 7)) - Number(fromMonthKey.slice(5, 7)))
  );
}

function simulateForecast(importDraft, monthlyPlan, options = {}) {
  const forecastRows = futureForecastRows(monthlyPlan);
  const firstRow = forecastRows[0];
  if (!firstRow) {
    return [];
  }

  const months = options.months ?? forecastRows.length;
  const extraMusicGrossPerMonth = options.extraMusicGrossPerMonth ?? 0;
  const startMonthKey = options.startMonthKey ?? firstRow.monthKey;
  const safetyThreshold = assumptionNumber(importDraft, "safety_threshold", 10000);
  const musicThreshold = assumptionNumber(importDraft, "music_threshold", safetyThreshold);
  const musicInvestmentShare = assumptionNumber(importDraft, "music_investment_share_after_threshold", 0.6);
  const musicSafetyShare = assumptionNumber(importDraft, "music_safety_share_after_threshold", 0.4);
  const safetyAnnualReturn = assumptionNumber(importDraft, "savings_interest_annual", 0.02);
  const investmentAnnualReturn = assumptionNumber(importDraft, "investment_return_annual", 0.05);
  const safetyMonthlyReturn = safetyAnnualReturn / 12;
  const investmentMonthlyReturn = Math.pow(1 + investmentAnnualReturn, 1 / 12) - 1;
  const inflationRate = options.inflationRate ?? 0;
  const salaryGrowthRate = options.salaryGrowthRate ?? 0;
  const rentGrowthRate = options.rentGrowthRate ?? 0;
  const expenseGrowthRate = options.expenseGrowthRate ?? 0;
  const musicGrowthRate = options.musicGrowthRate ?? 0;
  const musicTaxRate = options.musicTaxRate ?? 0;
  const minimumMusicGrossPerMonth = options.minimumMusicGrossPerMonth ?? 0;
  const constantMusicGrossPerMonth = options.constantMusicGrossPerMonth;
  const rentBaseAmount = options.rentBaseAmount ?? currentRentAmount(importDraft, firstRow.monthKey);

  let safetyStartAmount = firstRow.safetyBucketStartAmount ?? 0;
  let investmentStartAmount = firstRow.investmentBucketStartAmount ?? 0;
  const results = [];

  for (let index = 0; index < months; index += 1) {
    const monthKey = addMonths(startMonthKey, index);
    const template = rowTemplateForMonth(monthlyPlan, monthKey);
    if (!template) {
      break;
    }

    const salaryFactor = growthFactor(salaryGrowthRate, index);
    const rentFactor = growthFactor(rentGrowthRate, index);
    const expenseFactor = growthFactor(expenseGrowthRate, index);
    const reserveFactor = growthFactor(inflationRate, index);
    const musicFactor = growthFactor(musicGrowthRate, index);
    const fixedAmountBase = template.baselineFixedAmount ?? 0;
    const variableAmountBase = template.baselineVariableAmount ?? 0;
    const annualReserveAmountBase = template.annualReserveAmount ?? 0;
    const netSalaryAmountBase = template.netSalaryAmount ?? 0;
    const plannedSavingsAmount = template.plannedSavingsAmount ?? 0;
    const otherFixedBase = Math.max(0, fixedAmountBase - rentBaseAmount);
    const fixedAmount = rentBaseAmount * rentFactor + otherFixedBase * expenseFactor;
    const variableAmount = variableAmountBase * expenseFactor;
    const annualReserveAmount = annualReserveAmountBase * reserveFactor;
    const netSalaryAmount = netSalaryAmountBase * salaryFactor;
    const baselineAvailableAmount = netSalaryAmount - fixedAmount - variableAmount - plannedSavingsAmount;
    const importedExpenseAmount = (template.importedExpenseAmount ?? 0) * expenseFactor;
    const baseMusicGross = template.musicIncomeAmount ?? 0;
    const forecastMusicGross = Math.max(0, (baseMusicGross + extraMusicGrossPerMonth) * musicFactor);
    const musicGross =
      typeof constantMusicGrossPerMonth === "number"
        ? Math.max(0, constantMusicGrossPerMonth)
        : Math.max(forecastMusicGross, minimumMusicGrossPerMonth);
    const musicNetAvailable = musicGross * (1 - musicTaxRate / 100);
    const salaryToSafety = Math.max(0, baselineAvailableAmount - importedExpenseAmount);
    const salaryToInvestment = Math.max(0, baselineAvailableAmount + plannedSavingsAmount - importedExpenseAmount);
    const musicToSafety = safetyStartAmount < musicThreshold ? musicNetAvailable : musicNetAvailable * musicSafetyShare;
    const musicToInvestment = safetyStartAmount >= musicThreshold ? musicNetAvailable * musicInvestmentShare : 0;
    const safetyEndAmount =
      safetyStartAmount * (1 + safetyMonthlyReturn) +
      (safetyStartAmount < safetyThreshold ? salaryToSafety : 0) +
      musicToSafety;
    const investmentEndAmount =
      investmentStartAmount * (1 + investmentMonthlyReturn) +
      plannedSavingsAmount +
      (safetyStartAmount >= safetyThreshold ? salaryToInvestment : 0) +
      musicToInvestment;

    results.push({
      monthKey,
      netSalaryAmount,
      fixedAmount,
      variableAmount,
      annualReserveAmount,
      plannedSavingsAmount,
      salaryToSafety,
      salaryToInvestment,
      baseMusicGross,
      forecastMusicGross,
      musicGross,
      musicNetAvailable,
      safetyStartAmount,
      investmentStartAmount,
      safetyEndAmount,
      investmentEndAmount,
      wealthEndAmount: safetyEndAmount + investmentEndAmount,
    });

    safetyStartAmount = safetyEndAmount;
    investmentStartAmount = investmentEndAmount;
  }

  return results;
}

function wealthMilestones(simulation, requiredNestEgg) {
  const lastWealth = simulation.at(-1)?.wealthEndAmount ?? 0;
  const maxGoal = Math.max(requiredNestEgg, lastWealth, 100000);
  const highestMilestone = Math.ceil(maxGoal / 25000) * 25000;
  const milestones = [];

  for (let amount = 25000; amount <= highestMilestone; amount += 25000) {
    const hit = simulation.find((row) => row.wealthEndAmount >= amount);
    milestones.push({
      amount,
      hitMonthKey: hit?.monthKey ?? null,
      hitWealthAmount: hit?.wealthEndAmount ?? null,
    });
  }

  return milestones;
}

function targetMonthFromAges(currentAge, targetAge, startMonthKey) {
  const monthDelta = Math.max(0, Math.round((targetAge - currentAge) * 12));
  return addMonths(startMonthKey, monthDelta);
}

function monthsUntilInclusive(startMonthKey, endMonthKey) {
  return Math.max(
    1,
    ((Number(endMonthKey.slice(0, 4)) - Number(startMonthKey.slice(0, 4))) * 12) +
      (Number(endMonthKey.slice(5, 7)) - Number(startMonthKey.slice(5, 7))) +
      1,
  );
}

function requiredConstantMusicForTarget(importDraft, monthlyPlan, targetMonthKey, requiredNestEgg, plannerAssumptions) {
  const forecastRows = futureForecastRows(monthlyPlan);
  if (forecastRows.length === 0) {
    return null;
  }

  const firstForecastMonthKey = forecastRows[0].monthKey;
  const months = monthsUntilInclusive(firstForecastMonthKey, targetMonthKey);

  const baselineRun = simulateForecast(importDraft, monthlyPlan, {
    months,
    constantMusicGrossPerMonth: 0,
    ...plannerAssumptions,
  });
  if ((baselineRun.at(-1)?.wealthEndAmount ?? 0) >= requiredNestEgg) {
    return {
      constantMusicGrossPerMonth: 0,
      simulation: baselineRun,
    };
  }

  let low = 0;
  let high = 20000;
  let bestRun = null;

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const mid = (low + high) / 2;
    const simulation = simulateForecast(importDraft, monthlyPlan, {
      months,
      constantMusicGrossPerMonth: mid,
      ...plannerAssumptions,
    });
    const wealthAtTarget = simulation.at(-1)?.wealthEndAmount ?? 0;

    if (wealthAtTarget >= requiredNestEgg) {
      high = mid;
      bestRun = simulation;
    } else {
      low = mid;
    }
  }

  return {
    constantMusicGrossPerMonth: Math.ceil(high / 10) * 10,
    simulation: bestRun ?? simulateForecast(importDraft, monthlyPlan, {
      months,
      constantMusicGrossPerMonth: high,
      ...plannerAssumptions,
    }),
  };
}

function firstMonthReaching(simulation, targetAmount) {
  return simulation.find((row) => row.wealthEndAmount >= targetAmount) ?? null;
}

function buildRetirementYearBreakdown(importDraft, monthlyPlan, plannerAssumptions, untilMonthKey) {
  const forecastRows = futureForecastRows(monthlyPlan);
  const firstRow = forecastRows[0];
  if (!firstRow) {
    return [];
  }

  const months = Math.max(1, yearDelta(firstRow.monthKey, untilMonthKey) + 1);
  const simulation = simulateForecast(importDraft, monthlyPlan, {
    months,
    constantMusicGrossPerMonth: 0,
    ...plannerAssumptions,
  });
  const grouped = new Map();

  for (const row of simulation) {
    const year = Number(row.monthKey.slice(0, 4));
    const entry = grouped.get(year) ?? {
      year,
      count: 0,
      netSalaryAmount: 0,
      rentAmount: 0,
      fixedOtherAmount: 0,
      variableAmount: 0,
      annualReserveAmount: 0,
      plannedSavingsAmount: 0,
      salaryToSafety: 0,
      salaryToInvestment: 0,
      availableBeforeMusic: 0,
    };

    const totalFixed = row.fixedAmount ?? 0;
    const rentAmount = currentRentAmount(importDraft, row.monthKey) * growthFactor(plannerAssumptions.rentGrowthRate ?? 0, yearDelta(firstRow.monthKey, row.monthKey));
    const fixedOtherAmount = Math.max(0, totalFixed - rentAmount);

    entry.count += 1;
    entry.netSalaryAmount += row.netSalaryAmount ?? 0;
    entry.rentAmount += rentAmount;
    entry.fixedOtherAmount += fixedOtherAmount;
    entry.variableAmount += row.variableAmount ?? 0;
    entry.annualReserveAmount += row.annualReserveAmount ?? 0;
    entry.plannedSavingsAmount += row.plannedSavingsAmount ?? 0;
    entry.salaryToSafety += row.salaryToSafety ?? 0;
    entry.salaryToInvestment += row.salaryToInvestment ?? 0;
    entry.availableBeforeMusic += (row.netSalaryAmount ?? 0) - totalFixed - (row.variableAmount ?? 0) - (row.annualReserveAmount ?? 0) - (row.plannedSavingsAmount ?? 0);

    grouped.set(year, entry);
  }

  return [...grouped.values()]
    .sort((left, right) => left.year - right.year)
    .map((entry) => ({
      year: entry.year,
      netSalaryAmount: entry.netSalaryAmount / entry.count,
      rentAmount: entry.rentAmount / entry.count,
      fixedOtherAmount: entry.fixedOtherAmount / entry.count,
      variableAmount: entry.variableAmount / entry.count,
      annualReserveAmount: entry.annualReserveAmount / entry.count,
      plannedSavingsAmount: entry.plannedSavingsAmount / entry.count,
      salaryToSafety: entry.salaryToSafety / entry.count,
      salaryToInvestment: entry.salaryToInvestment / entry.count,
      availableBeforeMusic: entry.availableBeforeMusic / entry.count,
    }));
}

function readReconciliationState() {
  return reconciliationStateCache;
}

function writeReconciliationState(state) {
  reconciliationStateCache = state;
  window.localStorage.setItem(reconciliationStorageKey, JSON.stringify(state));
}

function readMappingState() {
  return mappingStateCache;
}

function writeMappingState(state) {
  mappingStateCache = state;
  window.localStorage.setItem(mappingStorageKey, JSON.stringify(state));
}

function readBaselineOverrides() {
  return baselineOverridesCache;
}

function writeBaselineOverrides(state) {
  baselineOverridesCache = state;
  window.localStorage.setItem(baselineOverridesStorageKey, JSON.stringify(state));
}

function readMonthlyExpenseOverrides() {
  return monthlyExpenseOverridesCache;
}

function writeMonthlyExpenseOverrides(state) {
  monthlyExpenseOverridesCache = state;
  window.localStorage.setItem(monthlyExpenseOverridesStorageKey, JSON.stringify(state));
}

function readMonthlyMusicIncomeOverrides() {
  return monthlyMusicIncomeOverridesCache;
}

function writeMonthlyMusicIncomeOverrides(state) {
  monthlyMusicIncomeOverridesCache = state;
  window.localStorage.setItem(monthlyMusicIncomeOverridesStorageKey, JSON.stringify(state));
}

function readMusicTaxSettings() {
  return musicTaxSettingsCache;
}

function writeMusicTaxSettings(state) {
  musicTaxSettingsCache = state;
  window.localStorage.setItem(musicTaxSettingsStorageKey, JSON.stringify(state ?? {}));
}

function readForecastSettings() {
  return forecastSettingsCache;
}

function writeForecastSettings(state) {
  forecastSettingsCache = state;
  window.localStorage.setItem(forecastSettingsStorageKey, JSON.stringify(state ?? {}));
}

function readSalarySettings() {
  return salarySettingsCache;
}

function writeSalarySettings(state) {
  salarySettingsCache = state;
  window.localStorage.setItem(salarySettingsStorageKey, JSON.stringify(state ?? []));
}

async function loadStateFromApi(path, storageKey) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  const payload = await response.json();
  window.localStorage.setItem(storageKey, JSON.stringify(payload));
  return payload;
}

function loadStateFromLocalStorage(storageKey) {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
  } catch {
    return {};
  }
}

async function initializeWorkflowState() {
  try {
    reconciliationStateCache = await loadStateFromApi("/api/reconciliation-state", reconciliationStorageKey);
    reconciliationPersistence = "project";
  } catch {
    reconciliationStateCache = loadStateFromLocalStorage(reconciliationStorageKey);
    reconciliationPersistence = "browser";
  }

  try {
    mappingStateCache = await loadStateFromApi("/api/import-mappings", mappingStorageKey);
    mappingPersistence = "project";
  } catch {
    mappingStateCache = loadStateFromLocalStorage(mappingStorageKey);
    mappingPersistence = "browser";
  }

  try {
    const payload = await loadStateFromApi("/api/baseline-overrides", baselineOverridesStorageKey);
    baselineOverridesCache = Array.isArray(payload) ? payload : [];
    baselinePersistence = "project";
  } catch {
    const fallback = loadStateFromLocalStorage(baselineOverridesStorageKey);
    baselineOverridesCache = Array.isArray(fallback) ? fallback : [];
    baselinePersistence = "browser";
  }

  try {
    const payload = await loadStateFromApi("/api/monthly-expense-overrides", monthlyExpenseOverridesStorageKey);
    monthlyExpenseOverridesCache = Array.isArray(payload) ? payload : [];
    monthlyExpensePersistence = "project";
  } catch {
    const fallback = loadStateFromLocalStorage(monthlyExpenseOverridesStorageKey);
    monthlyExpenseOverridesCache = Array.isArray(fallback) ? fallback : [];
    monthlyExpensePersistence = "browser";
  }

  try {
    const payload = await loadStateFromApi("/api/monthly-music-income-overrides", monthlyMusicIncomeOverridesStorageKey);
    monthlyMusicIncomeOverridesCache = Array.isArray(payload) ? payload : [];
    monthlyMusicIncomePersistence = "project";
  } catch {
    const fallback = loadStateFromLocalStorage(monthlyMusicIncomeOverridesStorageKey);
    monthlyMusicIncomeOverridesCache = Array.isArray(fallback) ? fallback : [];
    monthlyMusicIncomePersistence = "browser";
  }

  try {
    const payload = await loadStateFromApi("/api/music-tax-settings", musicTaxSettingsStorageKey);
    musicTaxSettingsCache = payload && typeof payload === "object" ? payload : null;
    musicTaxPersistence = "project";
  } catch {
    const fallback = loadStateFromLocalStorage(musicTaxSettingsStorageKey);
    musicTaxSettingsCache = fallback && typeof fallback === "object" ? fallback : null;
    musicTaxPersistence = "browser";
  }

  try {
    const payload = await loadStateFromApi("/api/forecast-settings", forecastSettingsStorageKey);
    forecastSettingsCache = payload && typeof payload === "object" ? payload : null;
    forecastPersistence = "project";
  } catch {
    const fallback = loadStateFromLocalStorage(forecastSettingsStorageKey);
    forecastSettingsCache = fallback && typeof fallback === "object" ? fallback : null;
    forecastPersistence = "browser";
  }

  try {
    const payload = await loadStateFromApi("/api/salary-settings", salarySettingsStorageKey);
    salarySettingsCache = Array.isArray(payload) ? payload : [];
    salaryPersistence = "project";
  } catch {
    const fallback = loadStateFromLocalStorage(salarySettingsStorageKey);
    salarySettingsCache = Array.isArray(fallback) ? fallback : [];
    salaryPersistence = "browser";
  }
}

async function persistState(path, storageKey, state, modeSetter) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      throw new Error(`Failed to save ${path}`);
    }

    window.localStorage.setItem(storageKey, JSON.stringify(state));
    modeSetter("project");
    return { ok: true, mode: "project" };
  } catch {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
    modeSetter("browser");
    return { ok: false, mode: "browser" };
  }
}

function suggestionForSignal(signal) {
  if (signal.code === "baseline_anchor_mismatch") {
    return "Anchor-Werte und aktive Grundplan-Posten gegen den Workbook-Monat pruefen.";
  }
  if (signal.code === "baseline_deficit") {
    return "Grundplan pruefen: Basis-Investment, variable Basis und Fixkosten wirken fuer diesen Monat zu hoch.";
  }
  if (signal.code === "monthly_deficit") {
    return "Einzelne importierte Bewegungen und fehlende Zufluesse im Defizitmonat gegen das Workbook abgleichen.";
  }
  if (signal.code === "expense_over_baseline_available") {
    return "Ausgaben pruefen und entscheiden, ob sie in den Grundplan, die Ruecklage oder nur als Einzelereignis gehoeren.";
  }
  if (signal.code === "expense_spike") {
    return "Ausgabenspitze auf Sonderfall, falsche Zuordnung oder fehlende Gegenbuchung pruefen.";
  }

  return "Monat manuell im Workbook gegenpruefen.";
}

function defaultReconciliationForMonth(row) {
  return {
    status: row.consistencySignals.some((signal) => signal.severity === "warn") ? "open" : "resolved",
    note: "",
    actions: row.consistencySignals.map((signal) => ({
      code: signal.code,
      label: signal.title,
      done: false,
      suggestion: suggestionForSignal(signal),
    })),
    updatedAt: null,
  };
}

function reconciliationForMonth(row) {
  const state = readReconciliationState();
  const saved = state[row.monthKey];
  if (!saved) {
    return defaultReconciliationForMonth(row);
  }

  const defaults = defaultReconciliationForMonth(row);
  const savedActions = new Map((saved.actions ?? []).map((action) => [action.code, action]));
  return {
    status: saved.status ?? defaults.status,
    note: saved.note ?? "",
    actions: defaults.actions.map((action) => {
      const existing = savedActions.get(action.code);
      return existing
        ? { ...action, done: Boolean(existing.done) }
        : action;
    }),
    updatedAt: saved.updatedAt ?? null,
  };
}

async function saveReconciliationForMonth(monthKey, value) {
  const state = readReconciliationState();
  state[monthKey] = {
    ...value,
    updatedAt: new Date().toISOString(),
  };
  writeReconciliationState(state);
  return persistState("/api/reconciliation-state", reconciliationStorageKey, state, (mode) => {
    reconciliationPersistence = mode;
  });
}

function defaultExpenseAccount(entry) {
  if (entry.expenseType === "debt_payment") {
    return "debt";
  }
  if (entry.expenseType === "annual_reserve") {
    return "business";
  }
  if (entry.expenseCategoryId === "gear" || entry.expenseCategoryId === "tax") {
    return "business";
  }
  return "giro";
}

function defaultIncomeAccount(entry) {
  if (entry.kind === "sale" || entry.kind === "refund" || entry.kind === "gift") {
    return "giro";
  }
  if (entry.kind === "music") {
    return "giro";
  }
  return "unknown";
}

function defaultIncomeMapping(entry) {
  return {
    categoryId: entry.incomeStreamId,
    accountId: defaultIncomeAccount(entry),
    reviewed: false,
  };
}

function defaultExpenseMapping(entry) {
  return {
    categoryId: entry.expenseCategoryId,
    accountId: defaultExpenseAccount(entry),
    reviewed: false,
  };
}

function buildCategoryOptions(items) {
  return items.map((item) => ({ id: item.id, label: item.name }));
}

function buildAccountOptions(items) {
  if (!items || items.length === 0) {
    return fallbackAccountOptions;
  }

  return items
    .filter((item) => item.isActive !== false)
    .map((item) => ({ id: item.id, label: item.name }));
}

function optionMarkup(options, selectedValue) {
  return options
    .map((option) => `<option value="${option.id}" ${option.id === selectedValue ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

function incomeStreamLabel(importDraft, streamId) {
  return importDraft.incomeStreams.find((item) => item.id === streamId)?.name ?? streamId;
}

function expenseCategoryLabel(importDraft, categoryId) {
  return importDraft.expenseCategories.find((item) => item.id === categoryId)?.name ?? categoryId;
}

function baselineCategoryLabel(category) {
  const labels = {
    fixed: "Fixkosten",
    variable: "Variable Basis",
    annual_reserve: "Jahreskostenblock",
    savings: "Geplantes Investment",
  };
  return labels[category] ?? category;
}

function sourcePreview(notes) {
  if (!notes) {
    return "Keine zusätzliche Herkunftsnotiz.";
  }

  return notes.length > 160 ? `${notes.slice(0, 157)}...` : notes;
}

function incomeMappingForEntry(entry) {
  const state = readMappingState();
  return state[entry.id] ?? defaultIncomeMapping(entry);
}

function expenseMappingForEntry(entry) {
  const state = readMappingState();
  return state[entry.id] ?? defaultExpenseMapping(entry);
}

async function saveMappings(entries) {
  const state = readMappingState();

  for (const entry of entries) {
    const categoryField = document.querySelector(`[data-mapping-category="${entry.id}"]`);
    const accountField = document.querySelector(`[data-mapping-account="${entry.id}"]`);
    const reviewedField = document.querySelector(`[data-mapping-reviewed="${entry.id}"]`);

    state[entry.id] = {
      categoryId: categoryField?.value ?? "",
      accountId: accountField?.value ?? "unknown",
      reviewed: Boolean(reviewedField?.checked),
      updatedAt: new Date().toISOString(),
    };
  }

  writeMappingState(state);
  return persistState("/api/import-mappings", mappingStorageKey, state, (mode) => {
    mappingPersistence = mode;
  });
}

function renderSignalItems(signals, emptyMessage) {
  if (!signals || signals.length === 0) {
    return `<li class="signal-empty">${emptyMessage}</li>`;
  }

  return signals
    .map(
      (signal) => `
        <li>
          <span class="signal-label ${signal.severity}">${signal.severity === "warn" ? "Prüfen" : "Info"}</span>
          <strong>${signal.title}</strong>
          <p>${signal.detail}</p>
        </li>
      `,
    )
    .join("");
}

function renderValidationSignals(draftReport, monthlyPlan) {
  const target = document.getElementById("validationSignals");
  if (!target) return;

  const signals = [];
  const delta = draftReport.baselineSummary?.deltaToAnchor ?? 0;
  const negativeMonths = monthlyPlan.rows.filter((row) => row.netAfterImportedFlows < 0);
  const suspiciousMonths = monthlyPlan.rows.filter((row) => row.consistencySignals.some((signal) => signal.severity === "warn"));
  const futureRows = monthlyPlan.rows.filter((row) => row.monthKey >= "2026-03");

  if (Math.abs(delta) > 0.01) {
    signals.push({
      level: "warn",
      title: "Grundplan und Workbook passen noch nicht sauber zusammen",
      body: `Zwischen Workbook und aktueller Berechnung liegt noch eine Differenz von ${euro.format(delta)}. Das ist ein guter Kandidat für eine kurze Prüfung im Monatsbereich.`,
    });
  }

  if (negativeMonths.length > 0) {
    const worstMonth = [...negativeMonths].sort((left, right) => left.netAfterImportedFlows - right.netAfterImportedFlows)[0];
    signals.push({
      level: "warn",
      title: `${negativeMonths.length} Monate liegen nach Importen im Minus`,
      body: `Schwächster Monat aktuell: ${worstMonth.monthKey} mit ${euro.format(worstMonth.netAfterImportedFlows)}. Diese Monate solltest du zuerst kurz durchgehen.`,
    });
  }

  if (suspiciousMonths.length > 0) {
    const worstMatch = [...suspiciousMonths].sort(
      (left, right) => right.consistencySignals.filter((signal) => signal.severity === "warn").length -
        left.consistencySignals.filter((signal) => signal.severity === "warn").length,
    )[0];
    signals.push({
      level: "warn",
      title: `${suspiciousMonths.length} Monate haben automatische Warnsignale`,
      body: `${worstMatch.monthKey} hat aktuell ${worstMatch.consistencySignals.filter((signal) => signal.severity === "warn").length} Warnhinweise. Von dort lohnt sich der Einstieg in die Monatsprüfung.`,
    });
  }

  if (futureRows.length > 0) {
    const positiveFuture = futureRows.filter((row) => row.netAfterImportedFlows >= 0).length;
    signals.push({
      level: "info",
      title: "Zukunftsphase ist bereits vorgerechnet",
      body: `${positiveFuture} von ${futureRows.length} Zukunftsmonaten liegen in der aktuellen Rechnung nicht im Minus. Das ist die Basis für deine weitere Planung.`,
    });
  }

  const anchorChecks = (currentImportDraft()?.forecastWealthAnchors ?? [])
    .map((anchor) => {
      const row = monthlyPlan.rows.find((item) => item.monthKey === anchor.monthKey);
      if (!row || row.projectedWealthEndAmount === undefined) {
        return null;
      }

      return {
        monthKey: anchor.monthKey,
        delta: Math.round((row.projectedWealthEndAmount - anchor.totalWealthAmount) * 100) / 100,
      };
    })
    .filter(Boolean);
  const offAnchors = anchorChecks.filter((item) => Math.abs(item.delta) > 50);

  if (offAnchors.length > 0) {
    const worstAnchor = [...offAnchors].sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0];
    signals.push({
      level: "warn",
      title: `${offAnchors.length} Workbook-Kontrollmonate weichen merklich ab`,
      body: `${worstAnchor.monthKey} liegt aktuell um ${euro.format(worstAnchor.delta)} neben dem Excel-Anker. Das ist ein guter technischer Kontrollpunkt für die Migration.`,
    });
  }

  target.innerHTML = signals
    .map(
      (signal) => `
        <li>
          <span class="signal-label ${signal.level}">${signal.level === "warn" ? "Prüfen" : "Info"}</span>
          <strong>${signal.title}</strong>
          <p>${signal.body}</p>
        </li>
      `,
    )
    .join("");
}

function renderWorkbookAnchorChecks(importDraft, monthlyPlan) {
  const target = document.getElementById("workbookAnchorChecks");
  if (!target) return;

  const anchors = (importDraft.forecastWealthAnchors ?? []).slice().sort((left, right) => left.monthKey.localeCompare(right.monthKey));
  if (anchors.length === 0) {
    target.innerHTML = `<p class="empty-state">Noch keine expliziten Kontrollmonate aus dem Workbook gefunden.</p>`;
    return;
  }

  target.innerHTML = anchors
    .map((anchor) => {
      const row = monthlyPlan.rows.find((item) => item.monthKey === anchor.monthKey);
      const appTotal = row?.projectedWealthEndAmount;
      const delta = typeof appTotal === "number" && typeof anchor.totalWealthAmount === "number"
        ? Math.round((appTotal - anchor.totalWealthAmount) * 100) / 100
        : null;
      const tone = delta === null ? "info" : Math.abs(delta) > 50 ? "warn" : "info";
      return `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${anchor.monthKey}</strong>
              <p>Excel-Anker aus Zeile ${anchor.sourceRowNumber} · ${anchor.sourceSheet}</p>
            </div>
            <span class="signal-label ${tone}">${tone === "warn" ? "Prüfen" : "Passt"}</span>
          </div>
          <div class="detail-strip">
            <div><span>Excel Gesamt</span><strong>${typeof anchor.totalWealthAmount === "number" ? euro.format(anchor.totalWealthAmount) : "-"}</strong></div>
            <div><span>App Gesamt</span><strong>${typeof appTotal === "number" ? euro.format(appTotal) : "-"}</strong></div>
            <div><span>Differenz</span><strong>${delta === null ? "-" : euro.format(delta)}</strong></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderMonthHealth(monthlyPlan) {
  const target = document.getElementById("monthHealth");
  if (!target) return;

  const rows = monthlyPlan.rows;
  const negativeMonths = rows.filter((row) => row.netAfterImportedFlows < 0);
  const warningMonths = rows.filter((row) => row.consistencySignals.some((signal) => signal.severity === "warn"));
  const bestMonth = [...rows].sort((left, right) => right.netAfterImportedFlows - left.netAfterImportedFlows)[0];
  const worstMonth = [...rows].sort((left, right) => left.netAfterImportedFlows - right.netAfterImportedFlows)[0];
  const lastMonth = rows.at(-1);
  const entries = [
    ["Monate im Plan", String(rows.length)],
    ["Defizit-Monate", String(negativeMonths.length)],
    ["Warn-Monate", String(warningMonths.length)],
    ["Bester Monat", bestMonth ? `${bestMonth.monthKey} · ${euro.format(bestMonth.netAfterImportedFlows)}` : "-"],
    ["Schwächster Monat", worstMonth ? `${worstMonth.monthKey} · ${euro.format(worstMonth.netAfterImportedFlows)}` : "-"],
    ["Letzter Monat", lastMonth ? `${lastMonth.monthKey} · ${euro.format(lastMonth.netAfterImportedFlows)}` : "-"],
  ];

  target.innerHTML = entries
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function reviewPriorityRows(monthlyPlan) {
  const prioritized = monthlyPlan.rows
    .filter((row) => row.consistencySignals.some((signal) => signal.severity === "warn"))
    .map((row) => ({
      ...row,
      warningCount: row.consistencySignals.filter((signal) => signal.severity === "warn").length,
      priorityScore:
        (row.monthKey >= reviewFocusMonthKey ? 1000000 : 0) +
        row.consistencySignals.filter((signal) => signal.severity === "warn").length * 100000 +
        Math.abs(Math.min(row.netAfterImportedFlows, 0)) +
        row.importedExpenseAmount,
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore);

  const focusRows = prioritized.filter((row) => row.monthKey >= reviewFocusMonthKey).slice(0, 9);
  return focusRows.length > 0 ? focusRows : prioritized.slice(0, 9);
}

function renderPriorityMonths(monthlyPlan) {
  const target = document.getElementById("priorityMonths");
  const monthSelect = document.getElementById("monthReviewSelect");
  if (!target || !monthSelect) return;

  const rows = reviewPriorityRows(monthlyPlan);
  target.innerHTML = rows
    .map((row, index) => `
      <article class="priority-card">
        <div class="priority-meta">
          <span class="priority-pill warn">Priorität ${index + 1}</span>
          <span class="priority-pill">${planProfileLabel(row.baselineProfile)}</span>
        </div>
        <h3>${row.monthKey}</h3>
        <p>${row.warningCount} Warnhinweise · Monatssaldo ${euro.format(row.netAfterImportedFlows)} · Ausgaben ${euro.format(row.importedExpenseAmount)}</p>
        <button class="pill" type="button" data-priority-month="${row.monthKey}">Im Review öffnen</button>
      </article>
    `)
    .join("");

  for (const button of target.querySelectorAll("[data-priority-month]")) {
    button.addEventListener("click", () => {
      const monthKey = button.getAttribute("data-priority-month");
      if (!monthKey) return;
      monthSelect.value = monthKey;
      renderMonthReview(currentImportDraft(), monthlyPlan, monthKey);
      saveViewState({ monthKey });
      const monthsTab = document.querySelector('.tab[data-tab="months"]');
      monthsTab?.click();
    });
  }
}

function openMonthReview(monthlyPlan, monthKey) {
  const monthSelect = document.getElementById("monthReviewSelect");
  if (!(monthSelect instanceof HTMLSelectElement)) {
    return;
  }

  monthSelect.value = monthKey;
  saveViewState({ monthKey });
  renderMonthReview(currentImportDraft(), monthlyPlan, monthKey);
  updateMonthNavigator(monthlyPlan, monthKey);
}

function updateMonthNavigator(monthlyPlan, monthKey) {
  const currentLabel = document.getElementById("monthReviewCurrentLabel");
  const prevButton = document.getElementById("monthPrevButton");
  const nextButton = document.getElementById("monthNextButton");
  const monthKeys = monthlyPlan.rows.map((row) => row.monthKey);
  const currentIndex = monthKeys.indexOf(monthKey);

  if (currentLabel) {
    currentLabel.textContent = formatMonthLabel(monthKey);
  }

  if (prevButton instanceof HTMLButtonElement) {
    const prevMonth = currentIndex > 0 ? monthKeys[currentIndex - 1] : null;
    prevButton.disabled = !prevMonth;
    prevButton.onclick = () => {
      if (prevMonth) {
        openMonthReview(monthlyPlan, prevMonth);
      }
    };
  }

  if (nextButton instanceof HTMLButtonElement) {
    const nextMonth = currentIndex >= 0 && currentIndex < monthKeys.length - 1 ? monthKeys[currentIndex + 1] : null;
    nextButton.disabled = !nextMonth;
    nextButton.onclick = () => {
      if (nextMonth) {
        openMonthReview(monthlyPlan, nextMonth);
      }
    };
  }
}

function bindMonthFilters(monthlyPlan, initialFilter = "focus") {
  const buttons = [...document.querySelectorAll("#monthFilters .pill")];
  const allRows = monthlyPlan.rows;
  const tableTarget = document.getElementById("monthlyRows");

  function render(filter) {
    const rows = allRows.filter((row) => {
      if (filter === "focus") return row.monthKey >= reviewFocusMonthKey;
      if (filter === "negative") return row.netAfterImportedFlows < 0;
      if (filter === "warning") return row.consistencySignals.some((signal) => signal.severity === "warn");
      if (filter === "future") return row.monthKey >= "2026-03";
      return true;
    });

  renderRows("monthlyRows", rows, (row) => `
      <tr data-month-open="${row.monthKey}">
        <td><button class="pill" type="button" data-month-open="${row.monthKey}">${row.monthKey}</button></td>
        <td>${planProfileLabel(row.baselineProfile)}</td>
        <td>${euro.format(row.baselineAvailableAmount)}</td>
        <td>${euro.format(row.musicIncomeAmount)}</td>
        <td>${euro.format(row.importedIncomeAvailableAmount)}</td>
        <td>${euro.format(row.importedExpenseAmount)}</td>
        <td>${row.projectedWealthEndAmount !== undefined ? euro.format(row.projectedWealthEndAmount) : "-"}</td>
        <td>${makeMoneyCell(row.netAfterImportedFlows)}</td>
        <td><button class="pill" type="button" data-month-open="${row.monthKey}">${row.consistencySignals.length} öffnen</button></td>
      </tr>
    `);
  }

  for (const button of buttons) {
    button.onclick = () => {
      const filter = button.dataset.filter ?? "all";
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      saveViewState({ monthFilter: filter });
      render(filter);
    };
  }

  const selectedFilter = buttons.some((button) => button.dataset.filter === initialFilter) ? initialFilter : "focus";
  buttons.forEach((item) => item.classList.toggle("is-active", item.dataset.filter === selectedFilter));
  render(selectedFilter);

  if (tableTarget) {
    tableTarget.onclick = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const trigger = target.closest("[data-month-open]");
      if (!(trigger instanceof HTMLElement)) {
        return;
      }

      const monthKey = trigger.getAttribute("data-month-open");
      if (!monthKey) {
        return;
      }

      openMonthReview(monthlyPlan, monthKey);
      document.getElementById("monthReviewSummary")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
}

function activeBaselineLineItemsForMonth(importDraft, monthKey) {
  const activeItems = importDraft.baselineLineItems.filter((item) => item.effectiveFrom <= monthKey);
  const latestByKey = new Map();

  for (const item of activeItems.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))) {
    const key = `${item.category}:${item.label}`;
    if (Number(item.amount) <= 0) {
      latestByKey.delete(key);
      continue;
    }

    latestByKey.set(key, item);
  }

  return [...latestByKey.values()];
}

function buildMonthReviewData(importDraft, monthlyPlan, monthKey) {
  const row = monthlyPlan.rows.find((item) => item.monthKey === monthKey);
  if (!row) return null;

  return {
    row,
    baselineLineItems: activeBaselineLineItemsForMonth(importDraft, monthKey),
    incomeEntries: importDraft.incomeEntries.filter((entry) => entry.entryDate.slice(0, 7) === monthKey),
    expenseEntries: importDraft.expenseEntries.filter((entry) => entry.entryDate.slice(0, 7) === monthKey),
  };
}

function manualExpensesForMonth(monthKey) {
  return readMonthlyExpenseOverrides()
    .filter((entry) => entry.monthKey === monthKey && entry.isActive !== false)
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
}

function manualMusicIncomeOverridesForMonth(monthKey) {
  return readMonthlyMusicIncomeOverrides()
    .filter((entry) => entry.monthKey === monthKey && entry.isActive !== false)
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
}

function musicIncomeEntryForMonth(importDraft, monthKey) {
  const exact = importDraft.incomeEntries.find((entry) => entry.incomeStreamId === "music-income" && entry.entryDate.slice(0, 7) === monthKey);
  if (exact) {
    return exact;
  }

  const all = importDraft.incomeEntries
    .filter((entry) => entry.incomeStreamId === "music-income")
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
  const latestBefore = [...all].reverse().find((entry) => entry.entryDate.slice(0, 7) <= monthKey);
  return latestBefore ?? all[0] ?? null;
}

function musicIncomeProfileForMonth(importDraft, monthKey) {
  const source = musicIncomeEntryForMonth(importDraft, monthKey);
  const gross = Number(source?.amount ?? 0);
  const reserve = Number(source?.reserveAmount ?? 0);
  const reserveRatio = gross > 0 ? reserve / gross : 0;

  return {
    source,
    reserveRatio,
    reserveAmountForGross(amount) {
      return roundCurrency(Math.max(0, amount * reserveRatio));
    },
    availableAmountForGross(amount) {
      return roundCurrency(amount - Math.max(0, amount * reserveRatio));
    },
  };
}

function renderMonthlyExpenseEditor(importDraft, monthKey) {
  const descriptionField = document.getElementById("monthlyExpenseDescription");
  const amountField = document.getElementById("monthlyExpenseAmount");
  const dateField = document.getElementById("monthlyExpenseDate");
  const categoryField = document.getElementById("monthlyExpenseCategory");
  const accountField = document.getElementById("monthlyExpenseAccount");
  const notesField = document.getElementById("monthlyExpenseNotes");
  const metaTarget = document.getElementById("monthlyExpenseMeta");
  const saveButton = document.getElementById("saveMonthlyExpenseButton");
  const listTarget = document.getElementById("monthlyExpenseList");

  if (
    !descriptionField ||
    !amountField ||
    !dateField ||
    !categoryField ||
    !accountField ||
    !notesField ||
    !metaTarget ||
    !saveButton ||
    !listTarget
  ) {
    return;
  }

  const items = manualExpensesForMonth(monthKey);
  categoryField.innerHTML = optionMarkup(buildCategoryOptions(importDraft.expenseCategories), categoryField.value || "other");
  accountField.innerHTML = optionMarkup(accountOptions, accountField.value || "giro");
  if (!dateField.value) {
    dateField.value = monthKey;
  }

  if (items.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch keine manuellen Ausgaben für diesen Monat.</p>`;
  } else {
    listTarget.innerHTML = items
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${entry.description}</strong>
              <p>${entry.entryDate} · ${euro.format(entry.amount)}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-monthly-expense-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-monthly-expense-delete="${entry.id}">Löschen</button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `)
      .join("");
  }

  const persistenceLabel = monthlyExpensePersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = items.length > 0
    ? `${items.length} manuelle Ausgaben im Monat · Speicherort: ${persistenceLabel}`
    : `Noch keine manuelle Monatsausgabe gespeichert · Speicherort: ${persistenceLabel}`;

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const description = descriptionField.value.trim();
    const amount = Number(amountField.value);
    const entryDate = dateField.value || `${monthKey}-01`;
    const notes = notesField.value.trim();

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      metaTarget.textContent = "Bitte Beschreibung und positiven Betrag eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(isEditing
      ? `Monatsausgabe "${description}" für ${entryDate} wirklich aktualisieren?`
      : `Monatsausgabe "${description}" für ${entryDate} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: editingId || `manual-expense-${Date.now()}`,
      monthKey,
      entryDate,
      description,
      amount,
      expenseCategoryId: categoryField.value || "other",
      accountId: accountField.value || "giro",
      expenseType: "variable",
      isActive: true,
      notes,
      updatedAt: new Date().toISOString(),
    };

    const nextState = editingId
      ? readMonthlyExpenseOverrides().map((entry) => (entry.id === editingId ? nextEntry : entry))
      : [...readMonthlyExpenseOverrides(), nextEntry];

    const result = await saveMonthlyExpenseOverrides(nextState);
    await refreshFinanceView({
      title: isEditing ? "Monatsausgabe aktualisiert" : "Monatsausgabe gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };

  for (const button of listTarget.querySelectorAll("[data-monthly-expense-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-monthly-expense-edit");
      const entry = readMonthlyExpenseOverrides().find((item) => item.id === id);
      if (!entry) return;
      saveButton.dataset.editingId = entry.id;
      saveButton.textContent = "Monatsausgabe aktualisieren";
      descriptionField.value = entry.description;
      amountField.value = String(entry.amount);
      dateField.value = entry.entryDate;
      categoryField.value = entry.expenseCategoryId || "other";
      accountField.value = entry.accountId || "giro";
      notesField.value = entry.notes || "";
      metaTarget.textContent = `Bearbeitungsmodus aktiv für ${entry.description}`;
    });
  }

  for (const button of listTarget.querySelectorAll("[data-monthly-expense-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-monthly-expense-delete");
      if (!id) return;
      const entry = readMonthlyExpenseOverrides().find((item) => item.id === id);
      if (!entry || !confirmAction(`Monatsausgabe "${entry.description}" vom ${entry.entryDate} wirklich löschen?`)) {
        return;
      }
      const nextState = readMonthlyExpenseOverrides().map((entry) =>
        entry.id === id ? { ...entry, isActive: false, updatedAt: new Date().toISOString() } : entry,
      );
      const result = await saveMonthlyExpenseOverrides(nextState);
      await refreshFinanceView({
        title: "Monatsausgabe gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }
}

function renderMonthlyMusicIncomeEditor(importDraft, monthKey) {
  const amountField = document.getElementById("musicIncomeActualAmount");
  const dateField = document.getElementById("musicIncomeActualDate");
  const notesField = document.getElementById("musicIncomeActualNotes");
  const metaTarget = document.getElementById("musicIncomeActualMeta");
  const saveButton = document.getElementById("saveMusicIncomeActualButton");
  const listTarget = document.getElementById("musicIncomeActualList");
  const summaryTarget = document.getElementById("musicIncomeActualSummary");

  if (!amountField || !dateField || !notesField || !metaTarget || !saveButton || !listTarget || !summaryTarget) {
    return;
  }

  const items = manualMusicIncomeOverridesForMonth(monthKey);
  const profile = musicIncomeProfileForMonth(importDraft, monthKey);
  const referenceGross = Number(profile.source?.amount ?? 0);
  const referenceReserve = Number(profile.source?.reserveAmount ?? 0);
  const referenceFree = Number(profile.source?.availableAmount ?? roundCurrency(referenceGross - referenceReserve));

  if (!dateField.value) {
    dateField.value = `${monthKey}-01`;
  }

  summaryTarget.innerHTML = [
    `<div class="mapping-card"><strong>Forecast aktuell</strong><p>${referenceGross > 0 ? `${euro.format(referenceGross)} brutto` : "Noch kein Musik-Forecast für diesen Monat."}</p></div>`,
    `<div class="mapping-card"><strong>Automatische Ableitung</strong><p>${referenceGross > 0 ? `Reserve ${euro.format(referenceReserve)} · frei verfügbar ${euro.format(referenceFree)}.` : "Wenn du einen Ist-Wert speicherst, wird ohne Monatsforecast vorerst keine Reserve abgezogen."}</p></div>`,
    `<div class="mapping-card"><strong>Wirkung</strong><p>Dein Ist-Wert ersetzt den Forecast nur für diesen Monat. Andere Monate bleiben unverändert.</p></div>`,
  ].join("");

  if (items.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch kein Musik-Istwert für diesen Monat gespeichert.</p>`;
  } else {
    listTarget.innerHTML = items
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${euro.format(entry.amount)} brutto</strong>
              <p>${entry.monthKey} · Reserve ${euro.format(entry.reserveAmount ?? 0)} · frei ${euro.format(entry.availableAmount ?? 0)}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-music-income-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-music-income-delete="${entry.id}">Löschen</button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `)
      .join("");
  }

  const persistenceLabel = monthlyMusicIncomePersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = items.length > 0
    ? `${items.length} Musik-Istwert(e) im Monat · Speicherort: ${persistenceLabel}`
    : `Noch kein Musik-Istwert gespeichert · Speicherort: ${persistenceLabel}`;

  for (const button of listTarget.querySelectorAll("[data-music-income-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-music-income-edit");
      const entry = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!entry) return;
      saveButton.dataset.editingId = entry.id;
      saveButton.textContent = "Musik-Istwert aktualisieren";
      amountField.value = String(entry.amount);
      dateField.value = entry.monthKey;
      notesField.value = entry.notes || "";
      metaTarget.textContent = `Bearbeitungsmodus aktiv für ${euro.format(entry.amount)} brutto`;
    });
  }

  for (const button of listTarget.querySelectorAll("[data-music-income-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-music-income-delete");
      if (!id) return;
      const entry = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!entry || !confirmAction(`Musik-Istwert ${euro.format(entry.amount)} für ${entry.monthKey} wirklich löschen?`)) {
        return;
      }

      const nextState = readMonthlyMusicIncomeOverrides().map((item) =>
        item.id === id ? { ...item, isActive: false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      await refreshFinanceView({
        title: "Musik-Istwert gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const amount = Number(amountField.value);
    const selectedMonthKey = dateField.value || monthKey;
    const notes = notesField.value.trim();

    if (!Number.isFinite(amount) || amount < 0) {
      metaTarget.textContent = "Bitte einen gültigen Bruttobetrag eintragen.";
      return;
    }

    const reserveAmount = profile.reserveAmountForGross(amount);
    const availableAmount = roundCurrency(amount - reserveAmount);
    const isEditing = Boolean(editingId);

    if (!confirmAction(isEditing
      ? `Musik-Istwert ${euro.format(amount)} für ${selectedMonthKey} wirklich aktualisieren?`
      : `Musik-Istwert ${euro.format(amount)} für ${selectedMonthKey} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: editingId || `manual-music-income-${Date.now()}`,
      monthKey: selectedMonthKey,
      entryDate: `${selectedMonthKey}-01`,
      amount,
      reserveAmount,
      availableAmount,
      accountId: "giro",
      isActive: true,
      notes,
      updatedAt: new Date().toISOString(),
    };

    const nextState = editingId
      ? readMonthlyMusicIncomeOverrides().map((item) => (item.id === editingId ? nextEntry : item))
      : [...readMonthlyMusicIncomeOverrides(), nextEntry];

    const result = await saveMonthlyMusicIncomeOverrides(nextState);
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Musik-Istwert speichern";
    amountField.value = "";
    dateField.value = monthKey;
    notesField.value = "";
    await refreshFinanceView({
      title: isEditing ? "Musik-Istwert aktualisiert" : "Musik-Istwert gespeichert",
      detail: `${statusDetailForMode(result.mode)} Reserve ${euro.format(reserveAmount)}, frei ${euro.format(availableAmount)}.`,
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

function renderMonthReview(importDraft, monthlyPlan, monthKey) {
  const review = buildMonthReviewData(importDraft, monthlyPlan, monthKey);
  if (!review) return;

  const summary = document.getElementById("monthReviewSummary");
  if (summary) {
    const variableExpensesTotal = roundCurrency(
      (review.row.baselineVariableAmount ?? 0) + (review.row.importedExpenseAmount ?? 0),
    );
    const entries = [
      ["Monat", `${review.row.monthKey} · Stand Monatsende`],
      ["Fixe Ausgaben", euro.format(review.row.baselineFixedAmount)],
      ["Variable Ausgaben", euro.format(variableExpensesTotal)],
      ["Cash-Rücklage Ende", review.row.safetyBucketEndAmount !== undefined ? euro.format(review.row.safetyBucketEndAmount) : "-"],
      ["Investment Ende", review.row.investmentBucketEndAmount !== undefined ? euro.format(review.row.investmentBucketEndAmount) : "-"],
      ["Gesamtvermögen Ende", review.row.projectedWealthEndAmount !== undefined ? euro.format(review.row.projectedWealthEndAmount) : "-"],
    ];

    summary.innerHTML = entries
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join("");
  }

  renderRows("monthReviewBaselineItems", review.baselineLineItems, (item) => `
    <tr>
      <td>${item.label}</td>
      <td>${baselineCategoryLabel(item.category)}</td>
      <td>${euro.format(item.amount)}</td>
    </tr>
  `);

  if (review.incomeEntries.length > 0) {
    renderRows("monthReviewIncomeRows", review.incomeEntries, (entry) => `
      <tr>
        <td>${entry.entryDate}</td>
        <td>${incomeStreamLabel(importDraft, entry.incomeStreamId)}</td>
        <td>${euro.format(entry.amount)}</td>
      </tr>
    `);
  } else {
    renderEmptyRow("monthReviewIncomeRows", 3, "Keine importierten Einnahmen für diesen Monat.");
  }

  if (review.expenseEntries.length > 0) {
    renderRows("monthReviewExpenseRows", review.expenseEntries, (entry) => `
      <tr>
        <td>${entry.entryDate}</td>
        <td>${entry.description}</td>
        <td>${euro.format(entry.amount)}</td>
      </tr>
    `);
  } else {
    renderEmptyRow("monthReviewExpenseRows", 3, "Keine importierten Ausgaben für diesen Monat.");
  }

  const signalsTarget = document.getElementById("monthReviewSignals");
  if (signalsTarget) {
    signalsTarget.innerHTML = renderSignalItems(
      review.row.consistencySignals,
      "Für diesen Monat wurden aktuell keine automatischen Hinweise gefunden.",
    );
  }

  renderReconciliation(review.row);
  renderEntryMappings(importDraft, review);
  renderMonthlyExpenseEditor(importDraft, monthKey);
  renderMonthlyMusicIncomeEditor(importDraft, monthKey);
}

function renderReconciliation(row) {
  const statusSelect = document.getElementById("reconciliationStatus");
  const noteField = document.getElementById("reconciliationNote");
  const actionsTarget = document.getElementById("reconciliationActions");
  const metaTarget = document.getElementById("reconciliationMeta");
  const saveButton = document.getElementById("saveReconciliationButton");

  if (!statusSelect || !noteField || !actionsTarget || !metaTarget || !saveButton) {
    return;
  }

  const reconciliation = reconciliationForMonth(row);
  statusSelect.value = reconciliation.status;
  noteField.value = reconciliation.note;

  if (reconciliation.actions.length === 0) {
    actionsTarget.innerHTML = `<p class="empty-state">Keine offenen Aktionen vorgeschlagen. Du kannst den Monat direkt als erledigt markieren und eine kurze Notiz hinterlegen.</p>`;
  } else {
    actionsTarget.innerHTML = reconciliation.actions
      .map(
        (action, index) => `
          <div class="reconciliation-action">
            <label>
              <input type="checkbox" data-action-index="${index}" ${action.done ? "checked" : ""}>
              <span>${action.label}</span>
            </label>
            <p>${action.suggestion}</p>
          </div>
        `,
      )
      .join("");
  }

  const persistenceLabel = reconciliationPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = reconciliation.updatedAt
    ? `Zuletzt gespeichert: ${new Date(reconciliation.updatedAt).toLocaleString("de-DE")} · Speicherort: ${persistenceLabel}`
    : `Noch nicht gespeichert · Speicherort: ${persistenceLabel}`;

  saveButton.onclick = async () => {
    if (!confirmAction(`Reconciliation für ${row.monthKey} wirklich speichern?`)) {
      return;
    }

    const nextValue = {
      status: statusSelect.value,
      note: noteField.value.trim(),
      actions: reconciliation.actions.map((action, index) => {
        const checkbox = actionsTarget.querySelector(`input[data-action-index="${index}"]`);
        return {
          ...action,
          done: Boolean(checkbox?.checked),
        };
      }),
    };

    if (nextValue.actions.length > 0 && nextValue.actions.every((action) => action.done) && nextValue.status === "open") {
      nextValue.status = "resolved";
      statusSelect.value = "resolved";
    }

    const result = await saveReconciliationForMonth(row.monthKey, nextValue);
    await refreshFinanceView({
      title: `Reconciliation für ${row.monthKey} gespeichert`,
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

function renderEntryMappings(importDraft, review) {
  const incomeTarget = document.getElementById("incomeMappingRows");
  const expenseTarget = document.getElementById("expenseMappingRows");
  const metaTarget = document.getElementById("mappingMeta");
  const saveButton = document.getElementById("saveMappingButton");

  if (!incomeTarget || !expenseTarget || !metaTarget || !saveButton) {
    return;
  }

  const incomeOptions = buildCategoryOptions(importDraft.incomeStreams);
  const expenseOptions = buildCategoryOptions(importDraft.expenseCategories);

  if (review.incomeEntries.length === 0) {
    incomeTarget.innerHTML = `<p class="empty-state">Keine Einnahmen zum Korrigieren in diesem Monat.</p>`;
  } else {
    incomeTarget.innerHTML = review.incomeEntries
      .map((entry) => {
        const mapping = incomeMappingForEntry(entry);
        return `
          <div class="mapping-card">
            <div class="mapping-card-head">
              <div>
                <strong>${incomeStreamLabel(importDraft, entry.incomeStreamId)}</strong>
                <p>${entry.entryDate} · ${euro.format(entry.amount)}</p>
              </div>
            </div>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
            <div class="mapping-fields">
              <label class="select-wrap">
                <span>Kategorie</span>
                <select data-mapping-category="${entry.id}">
                  ${optionMarkup(incomeOptions, mapping.categoryId)}
                </select>
              </label>
              <label class="select-wrap">
                <span>Zielkonto</span>
                <select data-mapping-account="${entry.id}">
                  ${optionMarkup(accountOptions, mapping.accountId)}
                </select>
              </label>
              <label class="mapping-check">
                <input type="checkbox" data-mapping-reviewed="${entry.id}" ${mapping.reviewed ? "checked" : ""}>
                <span>Geprüft</span>
              </label>
            </div>
          </div>
        `;
      })
      .join("");
  }

  if (review.expenseEntries.length === 0) {
    expenseTarget.innerHTML = `<p class="empty-state">Keine Ausgaben zum Korrigieren in diesem Monat.</p>`;
  } else {
    expenseTarget.innerHTML = review.expenseEntries
      .map((entry) => {
        const mapping = expenseMappingForEntry(entry);
        return `
          <div class="mapping-card">
            <div class="mapping-card-head">
              <div>
                <strong>${entry.description}</strong>
                <p>${entry.entryDate} · ${euro.format(entry.amount)}</p>
              </div>
            </div>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
            <div class="mapping-fields">
              <label class="select-wrap">
                <span>Kategorie</span>
                <select data-mapping-category="${entry.id}">
                  ${optionMarkup(expenseOptions, mapping.categoryId)}
                </select>
              </label>
              <label class="select-wrap">
                <span>Zielkonto</span>
                <select data-mapping-account="${entry.id}">
                  ${optionMarkup(accountOptions, mapping.accountId)}
                </select>
              </label>
              <label class="mapping-check">
                <input type="checkbox" data-mapping-reviewed="${entry.id}" ${mapping.reviewed ? "checked" : ""}>
                <span>Geprüft</span>
              </label>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const mappingState = readMappingState();
  const monthEntryIds = [...review.incomeEntries, ...review.expenseEntries].map((entry) => entry.id);
  const monthMappings = monthEntryIds.map((id) => mappingState[id]).filter(Boolean);
  const reviewedCount = monthMappings.filter((entry) => entry.reviewed).length;
  const latestUpdate = monthMappings
    .map((entry) => entry.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  const persistenceLabel = mappingPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = latestUpdate
    ? `${reviewedCount}/${monthEntryIds.length} Zeilen geprüft · zuletzt gespeichert: ${new Date(latestUpdate).toLocaleString("de-DE")} · Speicherort: ${persistenceLabel}`
    : `${reviewedCount}/${monthEntryIds.length} Zeilen geprüft · noch keine Mapping-Korrekturen gespeichert · Speicherort: ${persistenceLabel}`;

  saveButton.onclick = async () => {
    if (!confirmAction(`Mappings für ${review.row.monthKey} wirklich speichern?`)) {
      return;
    }

    const result = await saveMappings([...review.incomeEntries, ...review.expenseEntries]);
    await refreshFinanceView({
      title: `Mappings für ${review.row.monthKey} gespeichert`,
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

function bindMonthReview(importDraft, monthlyPlan, preferredMonthKey = null) {
  const select = document.getElementById("monthReviewSelect");
  if (!select) return;

  const monthKeys = monthlyPlan.rows.map((row) => row.monthKey);
  select.innerHTML = monthKeys
    .slice()
    .reverse()
    .map((monthKey) => `<option value="${monthKey}">${monthKey}</option>`)
    .join("");

  const currentMonthKey = new Date().toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).slice(0, 7);
  const initialMonth =
    monthKeys.find((monthKey) => monthKey === preferredMonthKey) ??
    monthKeys.find((monthKey) => monthKey === currentMonthKey) ??
    monthKeys.find((monthKey) => monthKey >= reviewFocusMonthKey) ??
    monthKeys.at(-1);
  if (initialMonth) {
    select.value = initialMonth;
    saveViewState({ monthKey: initialMonth });
    renderMonthReview(importDraft, monthlyPlan, initialMonth);
    updateMonthNavigator(monthlyPlan, initialMonth);
  }

  select.onchange = () => {
    saveViewState({ monthKey: select.value });
    openMonthReview(monthlyPlan, select.value);
  };
}

async function saveBaselineOverrides(state) {
  writeBaselineOverrides(state);
  return persistState("/api/baseline-overrides", baselineOverridesStorageKey, state, (mode) => {
    baselinePersistence = mode;
  });
}

async function saveMonthlyExpenseOverrides(state) {
  writeMonthlyExpenseOverrides(state);
  return persistState("/api/monthly-expense-overrides", monthlyExpenseOverridesStorageKey, state, (mode) => {
    monthlyExpensePersistence = mode;
  });
}

async function saveMonthlyMusicIncomeOverrides(state) {
  writeMonthlyMusicIncomeOverrides(state);
  return persistState("/api/monthly-music-income-overrides", monthlyMusicIncomeOverridesStorageKey, state, (mode) => {
    monthlyMusicIncomePersistence = mode;
  });
}

async function saveMusicTaxSettings(state) {
  writeMusicTaxSettings(state);
  return persistState("/api/music-tax-settings", musicTaxSettingsStorageKey, state, (mode) => {
    musicTaxPersistence = mode;
  });
}

async function saveForecastSettings(state) {
  writeForecastSettings(state);
  return persistState("/api/forecast-settings", forecastSettingsStorageKey, state, (mode) => {
    forecastPersistence = mode;
  });
}

async function saveSalarySettings(state) {
  writeSalarySettings(state);
  return persistState("/api/salary-settings", salarySettingsStorageKey, state, (mode) => {
    salaryPersistence = mode;
  });
}

function renderForecastPlanner(importDraft) {
  const safetyField = document.getElementById("forecastSafetyThreshold");
  const musicField = document.getElementById("forecastMusicThreshold");
  const notesField = document.getElementById("forecastNotes");
  const metaTarget = document.getElementById("forecastMeta");
  const summaryTarget = document.getElementById("forecastSummary");
  const saveButton = document.getElementById("saveForecastButton");

  if (!safetyField || !musicField || !notesField || !metaTarget || !summaryTarget || !saveButton) {
    return;
  }

  const stored = readForecastSettings();
  const safetyThreshold = Number(
    stored?.safetyThreshold ??
    assumptionNumber(importDraft, "safety_threshold", 10000),
  );
  const musicThreshold = Number(
    stored?.musicThreshold ??
    assumptionNumber(importDraft, "music_threshold", safetyThreshold),
  );

  safetyField.value = String(safetyThreshold);
  musicField.value = String(musicThreshold);
  notesField.value = stored?.notes ?? "";

  const persistenceLabel = forecastPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = stored?.updatedAt
    ? `Zuletzt gespeichert: ${new Date(stored.updatedAt).toLocaleString("de-DE")} · Speicherort: ${persistenceLabel}`
    : `Noch keine eigene Schwelle gespeichert · Speicherort: ${persistenceLabel}`;

  summaryTarget.innerHTML = [
    `<div class="mapping-card"><strong>Cash-Ziel</strong><p>Bis ${euro.format(safetyThreshold)} bleibt freies Gehalt im Sicherheitskonto. Darüber wandert der Gehaltsüberschuss automatisch ins Investment.</p></div>`,
    `<div class="mapping-card"><strong>Musik-Schwelle</strong><p>Ab ${euro.format(musicThreshold)} wird Musik nicht mehr komplett im Cash geparkt, sondern nach deiner Split-Logik verteilt.</p></div>`,
    `<div class="mapping-card"><strong>Workbook-Herkunft</strong><p>Beide Werte stammen ursprünglich aus dem Vermögensblatt der Excel und sind jetzt hier zentral anpassbar.</p></div>`,
  ].join("");

  saveButton.onclick = async () => {
    const nextSafetyThreshold = Number(safetyField.value);
    const nextMusicThreshold = Number(musicField.value);
    const notes = notesField.value.trim();

    if (!Number.isFinite(nextSafetyThreshold) || nextSafetyThreshold < 0 || !Number.isFinite(nextMusicThreshold) || nextMusicThreshold < 0) {
      metaTarget.textContent = "Bitte gültige Schwellen eintragen.";
      return;
    }

    if (!confirmAction(`Cash-Ziel ${euro.format(nextSafetyThreshold)} und Musik-Schwelle ${euro.format(nextMusicThreshold)} wirklich speichern?`)) {
      return;
    }

    const result = await saveForecastSettings({
      safetyThreshold: nextSafetyThreshold,
      musicThreshold: nextMusicThreshold,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await refreshFinanceView({
      title: "Schwellen gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

function renderSalaryPlanner(importDraft) {
  const amountField = document.getElementById("salaryAmount");
  const effectiveFromField = document.getElementById("salaryEffectiveFrom");
  const notesField = document.getElementById("salaryNotes");
  const metaTarget = document.getElementById("salaryMeta");
  const listTarget = document.getElementById("salaryList");
  const saveButton = document.getElementById("saveSalaryButton");

  if (!amountField || !effectiveFromField || !notesField || !metaTarget || !listTarget || !saveButton) {
    return;
  }

  const settings = [...readSalarySettings()].sort((left, right) =>
    (left.effectiveFrom ?? "").localeCompare(right.effectiveFrom ?? ""),
  );
  const suggestedMonth =
    importDraft.monthlyBaselines.find((entry) => entry.monthKey >= "2026-01")?.monthKey ??
    importDraft.monthlyBaselines.at(-1)?.monthKey ??
    reviewFocusMonthKey;

  function resetForm() {
    amountField.value = "";
    effectiveFromField.value = suggestedMonth;
    notesField.value = "";
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Gehaltsstand speichern";
  }

  if (!effectiveFromField.value) {
    effectiveFromField.value = suggestedMonth;
  }

  if (settings.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch keine eigenen Gehaltsstände gespeichert.</p>`;
  } else {
    listTarget.innerHTML = settings
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${euro.format(entry.netSalaryAmount)} netto</strong>
              <p>Ab ${entry.effectiveFrom} · ${entry.isActive === false ? "deaktiviert" : "aktiv"}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-salary-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-salary-toggle="${entry.id}">
                ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
              </button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `)
      .join("");
  }

  const persistenceLabel = salaryPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = settings.length > 0
    ? `${settings.length} Gehaltsstände gespeichert · Speicherort: ${persistenceLabel}`
    : `Noch keine Gehaltsänderung gespeichert · Speicherort: ${persistenceLabel}`;

  for (const button of listTarget.querySelectorAll("[data-salary-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-salary-edit");
      const entry = readSalarySettings().find((item) => item.id === id);
      if (!entry) return;

      saveButton.dataset.editingId = entry.id;
      amountField.value = String(entry.netSalaryAmount ?? "");
      effectiveFromField.value = entry.effectiveFrom ?? suggestedMonth;
      notesField.value = entry.notes ?? "";
      saveButton.textContent = "Gehaltsstand aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${euro.format(entry.netSalaryAmount)} ab ${entry.effectiveFrom}`;
    });
  }

  for (const button of listTarget.querySelectorAll("[data-salary-toggle]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-salary-toggle");
      if (!id) return;
      const entry = readSalarySettings().find((item) => item.id === id);
      if (!entry || !confirmAction(`Gehaltsstand ${euro.format(entry.netSalaryAmount)} ab ${entry.effectiveFrom} wirklich ${entry.isActive === false ? "aktivieren" : "deaktivieren"}?`)) {
        return;
      }

      const nextState = readSalarySettings().map((item) =>
        item.id === id
          ? { ...item, isActive: item.isActive === false, updatedAt: new Date().toISOString() }
          : item,
      );

      const result = await saveSalarySettings(nextState);
      await refreshFinanceView({
        title: `Gehaltsstand ${entry.isActive === false ? "aktiviert" : "deaktiviert"}`,
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const netSalaryAmount = Number(amountField.value);
    const effectiveFrom = effectiveFromField.value;
    const notes = notesField.value.trim();

    if (!Number.isFinite(netSalaryAmount) || netSalaryAmount <= 0 || !effectiveFrom) {
      metaTarget.textContent = "Bitte Nettogehalt und gültig-ab-Monat eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(isEditing
      ? `Gehaltsstand ${euro.format(netSalaryAmount)} ab ${effectiveFrom} wirklich aktualisieren?`
      : `Gehaltsstand ${euro.format(netSalaryAmount)} ab ${effectiveFrom} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: editingId || `salary-${Date.now()}`,
      netSalaryAmount,
      effectiveFrom,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    const nextState = editingId
      ? readSalarySettings().map((item) => (item.id === editingId ? nextEntry : item))
      : [...readSalarySettings(), nextEntry];

    const result = await saveSalarySettings(nextState);
    resetForm();
    await refreshFinanceView({
      title: isEditing ? "Gehaltsstand aktualisiert" : "Gehaltsstand gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

function renderMusicTaxPlanner(importDraft) {
  const amountField = document.getElementById("musicTaxQuarterlyAmount");
  const effectiveFromField = document.getElementById("musicTaxEffectiveFrom");
  const notesField = document.getElementById("musicTaxNotes");
  const metaTarget = document.getElementById("musicTaxMeta");
  const summaryTarget = document.getElementById("musicTaxSummary");
  const saveButton = document.getElementById("saveMusicTaxButton");

  if (!amountField || !effectiveFromField || !notesField || !metaTarget || !summaryTarget || !saveButton) {
    return;
  }

  const stored = readMusicTaxSettings();
  const workbookDefault = assumptionNumber(importDraft, "music_tax_prepayment_quarterly_amount", 501);
  const currentAmount = Number(stored?.quarterlyPrepaymentAmount ?? workbookDefault);
  const currentEffectiveFrom =
    stored?.effectiveFrom ??
    importDraft.monthlyBaselines.find((entry) => entry.monthKey >= "2026-01")?.monthKey ??
    "2026-03";

  amountField.value = Number.isFinite(currentAmount) ? String(currentAmount) : String(workbookDefault);
  effectiveFromField.value = currentEffectiveFrom;
  notesField.value = stored?.notes ?? "";

  const persistenceLabel = musicTaxPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = stored?.updatedAt
    ? `Zuletzt gespeichert: ${new Date(stored.updatedAt).toLocaleString("de-DE")} · Speicherort: ${persistenceLabel}`
    : `Noch keine eigene Steuer-Vorauszahlung gespeichert · Speicherort: ${persistenceLabel}`;

  const quarterMonths = currentMonthlyPlan()?.rows
    .map((row) => row.monthKey)
    .filter((monthKey, index, all) =>
      monthKey >= currentEffectiveFrom &&
      ["03", "06", "09", "12"].includes(monthKey.slice(5, 7)) &&
      all.indexOf(monthKey) === index,
    )
    .slice(0, 4) ?? [];

  summaryTarget.innerHTML = [
    `<div class="mapping-card"><strong>Aktuell geplant</strong><p>${euro.format(currentAmount)} pro Quartal ab ${currentEffectiveFrom}.</p></div>`,
    `<div class="mapping-card"><strong>Betroffene Quartale zuerst</strong><p>${quarterMonths.length > 0 ? quarterMonths.map(quarterLabel).join(" · ") : "Noch keine künftigen Quartalsmonate im Plan."}</p></div>`,
    `<div class="mapping-card"><strong>Wichtig</strong><p>Zusätzliche echte Nachzahlungen oder Erstattungen kannst du weiterhin als normale Monatsausgabe bzw. Einnahme pflegen.</p></div>`,
  ].join("");

  saveButton.onclick = async () => {
    const quarterlyPrepaymentAmount = Number(amountField.value);
    const effectiveFrom = effectiveFromField.value;
    const notes = notesField.value.trim();

    if (!Number.isFinite(quarterlyPrepaymentAmount) || quarterlyPrepaymentAmount < 0 || !effectiveFrom) {
      metaTarget.textContent = "Bitte gültigen Quartalsbetrag und gültig-ab-Monat eintragen.";
      return;
    }

    if (!confirmAction(`Quartals-Steuer-Vorauszahlung von ${euro.format(quarterlyPrepaymentAmount)} ab ${effectiveFrom} wirklich speichern?`)) {
      return;
    }

    const result = await saveMusicTaxSettings({
      quarterlyPrepaymentAmount,
      effectiveFrom,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await refreshFinanceView({
      title: "Steuer-Plan gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

function renderFixedCostPlanner(importDraft) {
  const labelField = document.getElementById("fixedCostLabel");
  const categoryField = document.getElementById("fixedCostCategory");
  const amountField = document.getElementById("fixedCostAmount");
  const effectiveFromField = document.getElementById("fixedCostEffectiveFrom");
  const notesField = document.getElementById("fixedCostNotes");
  const saveButton = document.getElementById("saveFixedCostButton");
  const listTarget = document.getElementById("fixedCostList");
  const metaTarget = document.getElementById("fixedCostMeta");

  if (!labelField || !categoryField || !amountField || !effectiveFromField || !notesField || !saveButton || !listTarget || !metaTarget) {
    return;
  }

  const overrides = [...readBaselineOverrides()].sort((left, right) =>
    (left.effectiveFrom ?? "").localeCompare(right.effectiveFrom ?? ""),
  );
  let editingId = saveButton.dataset.editingId ?? "";
  const sourceLineItemId = saveButton.dataset.sourceLineItemId ?? "";

  function resetForm() {
    labelField.value = "";
    categoryField.value = "fixed";
    categoryField.disabled = false;
    amountField.value = "";
    effectiveFromField.value = suggestedMonth;
    notesField.value = "";
    labelField.readOnly = false;
    saveButton.dataset.editingId = "";
    saveButton.dataset.sourceLineItemId = "";
    saveButton.dataset.stopMode = "";
    saveButton.textContent = "Grundplan-Posten speichern";
  }

  if (overrides.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch keine zusätzlichen Zukunfts-Fixkosten angelegt.</p>`;
  } else {
    listTarget.innerHTML = overrides
      .map((entry) => {
        const isStopEntry = Number(entry.amount) === 0 && entry.sourceLineItemId;
        return `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${entry.label}</strong>
              <p>${baselineCategoryLabel(entry.category ?? "fixed")} · ab ${entry.effectiveFrom} · ${isStopEntry ? "endet ab diesem Monat" : `${euro.format(entry.amount)} pro Monat`} · ${entry.isActive === false ? "deaktiviert" : "aktiv"}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-fixed-cost-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-fixed-cost-toggle="${entry.id}">
                ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
              </button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `;
      })
      .join("");
  }

  const persistenceLabel = baselinePersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = overrides.length > 0
    ? `${overrides.length} Grundplan-Änderungen gespeichert · Speicherort: ${persistenceLabel}`
    : `Noch keine zusätzlichen Grundplan-Änderungen gespeichert · Speicherort: ${persistenceLabel}`;

  const suggestedMonth =
    importDraft.monthlyBaselines[importDraft.monthlyBaselines.length - 1]?.monthKey ?? reviewFocusMonthKey;
  if (!effectiveFromField.value) {
    effectiveFromField.value = suggestedMonth;
  }

  for (const button of listTarget.querySelectorAll("[data-fixed-cost-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-fixed-cost-edit");
      const entry = readBaselineOverrides().find((item) => item.id === id);
      if (!entry) return;

      editingId = entry.id;
      saveButton.dataset.editingId = entry.id;
      saveButton.dataset.sourceLineItemId = entry.sourceLineItemId ?? "";
      saveButton.dataset.stopMode = "";
      labelField.value = entry.label ?? "";
      categoryField.value = entry.category ?? "fixed";
      amountField.value = entry.amount > 0 ? String(entry.amount ?? "") : "";
      effectiveFromField.value = entry.effectiveFrom ?? suggestedMonth;
      notesField.value = entry.notes ?? "";
      labelField.readOnly = Boolean(entry.sourceLineItemId);
      saveButton.textContent = "Fixkosten aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${entry.label}`;
    });
  }

  for (const button of listTarget.querySelectorAll("[data-fixed-cost-toggle]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-fixed-cost-toggle");
      if (!id) return;
      const entry = readBaselineOverrides().find((item) => item.id === id);
      if (!entry || !confirmAction(`Fixkosten "${entry.label}" wirklich ${entry.isActive === false ? "aktivieren" : "deaktivieren"}?`)) {
        return;
      }

      const nextOverrides = readBaselineOverrides().map((entry) =>
        entry.id === id
          ? { ...entry, isActive: entry.isActive === false, updatedAt: new Date().toISOString() }
          : entry,
      );

      const result = await saveBaselineOverrides(nextOverrides);
      await refreshFinanceView({
        title: `Fixkosten ${entry.isActive === false ? "aktiviert" : "deaktiviert"}`,
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const label = labelField.value.trim();
    const category = categoryField.value || "fixed";
    const amount = Number(amountField.value);
    const effectiveFrom = effectiveFromField.value;
    const notes = notesField.value.trim();
    const stopMode = saveButton.dataset.stopMode === "true";

    if (!label || !effectiveFrom || (!stopMode && (!Number.isFinite(amount) || amount <= 0))) {
      metaTarget.textContent = "Bitte Name, positiven Monatsbetrag und gültig-ab-Monat eintragen.";
      return;
    }

    const isEditing = Boolean(editingId || sourceLineItemId);
    if (!confirmAction(
      stopMode
        ? `Posten "${label}" ab ${effectiveFrom} wirklich beenden?`
        : isEditing
          ? `Grundplan-Posten "${label}" ab ${effectiveFrom} wirklich aktualisieren?`
          : `Neuen Grundplan-Posten "${label}" ab ${effectiveFrom} wirklich speichern?`,
    )) {
      return;
    }

    const nextOverrides = stopMode
      ? [
          ...readBaselineOverrides(),
          {
            id: `fixed-stop-${sourceLineItemId || label}-${Date.now()}`,
            label,
            amount: 0,
            effectiveFrom,
            sourceLineItemId: sourceLineItemId || undefined,
            category,
            cadence: "monthly",
            isActive: true,
            notes: notes || `Beendet bestehenden Posten ab ${effectiveFrom}.`,
            updatedAt: new Date().toISOString(),
          },
        ]
      : editingId
      ? readBaselineOverrides().map((entry) =>
          entry.id === editingId
            ? {
                ...entry,
                label,
                amount,
                effectiveFrom,
                category,
                sourceLineItemId: sourceLineItemId || entry.sourceLineItemId,
                notes,
                isActive: true,
                updatedAt: new Date().toISOString(),
              }
            : entry,
        )
      : [
          ...readBaselineOverrides(),
          {
            id: `fixed-custom-${Date.now()}`,
            label,
            amount,
            effectiveFrom,
            category,
            sourceLineItemId: sourceLineItemId || undefined,
            cadence: "monthly",
            isActive: true,
            notes,
            updatedAt: new Date().toISOString(),
          },
        ];

    const result = await saveBaselineOverrides(nextOverrides);
    resetForm();
    await refreshFinanceView({
      title: stopMode
        ? "Grundplan-Posten beendet"
        : isEditing
          ? "Grundplan-Posten aktualisiert"
          : "Grundplan-Posten gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };

  const baselineTarget = document.getElementById("baselineLineItems");
  if (baselineTarget) {
    baselineTarget.onclick = async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const editButton = target.closest("[data-baseline-edit]");
      if (editButton instanceof HTMLElement) {
        const id = editButton.getAttribute("data-baseline-edit");
        const source = importDraft.baselineLineItems.find((item) => item.id === id);
        if (!source) return;

        saveButton.dataset.editingId = "";
        saveButton.dataset.sourceLineItemId = source.id;
        saveButton.dataset.stopMode = "";
        labelField.value = source.label ?? "";
        categoryField.value = source.category ?? "fixed";
        amountField.value = String(source.amount ?? "");
        effectiveFromField.value = suggestedMonth;
        notesField.value = `Ändert bestehenden Posten ab ${suggestedMonth}.`;
        labelField.readOnly = true;
        categoryField.disabled = true;
        saveButton.textContent = "Grundplan-Override speichern";
        metaTarget.textContent = `Bearbeitungsmodus aktiv für bestehenden Posten: ${source.label}`;
        labelField.scrollIntoView({ behavior: "smooth", block: "center" });
        amountField.focus();
        return;
      }

      const stopButton = target.closest("[data-baseline-stop]");
      if (stopButton instanceof HTMLElement) {
        const id = stopButton.getAttribute("data-baseline-stop");
        const source = importDraft.baselineLineItems.find((item) => item.id === id);
        if (!source) return;
        saveButton.dataset.editingId = "";
        saveButton.dataset.sourceLineItemId = source.id;
        saveButton.dataset.stopMode = "true";
        labelField.value = source.label ?? "";
        categoryField.value = source.category ?? "fixed";
        amountField.value = "";
        effectiveFromField.value = effectiveFromField.value || suggestedMonth;
        notesField.value = `Beendet bestehenden Posten ab ${effectiveFromField.value || suggestedMonth}.`;
        labelField.readOnly = true;
        categoryField.disabled = true;
        saveButton.textContent = "Beenden ab Monat speichern";
        metaTarget.textContent = `Beenden-Modus aktiv für ${source.label}. Wähle jetzt im Feld "Gültig ab" den Monat aus und speichere dann.`;
        effectiveFromField.scrollIntoView({ behavior: "smooth", block: "center" });
        effectiveFromField.focus();
      }
    };
  }
}

function renderGoals(importDraft, monthlyPlan) {
  const currentAgeInput = document.getElementById("plannerCurrentAge");
  const targetAgeInput = document.getElementById("plannerTargetAge");
  const retirementSpendInput = document.getElementById("plannerRetirementSpend");
  const withdrawalRateInput = document.getElementById("plannerWithdrawalRate");
  const inflationRateInput = document.getElementById("plannerInflationRate");
  const salaryGrowthRateInput = document.getElementById("plannerSalaryGrowthRate");
  const rentGrowthRateInput = document.getElementById("plannerRentGrowthRate");
  const expenseGrowthRateInput = document.getElementById("plannerExpenseGrowthRate");
  const musicGrowthRateInput = document.getElementById("plannerMusicGrowthRate");
  const musicTaxRateInput = document.getElementById("plannerMusicTaxRate");
  const applyButton = document.getElementById("applyRetirementPlannerButton");
  const errorBox = document.getElementById("plannerErrorBox");
  const assumptionsTarget = document.getElementById("plannerAssumptions");
  const summaryTarget = document.getElementById("goalSummary");
  const milestonesTarget = document.getElementById("goalMilestones");
  const retirementTarget = document.getElementById("retirementPlan");
  const retirementSummaryTarget = document.getElementById("retirementSummary");
  const retirementSignalsTarget = document.getElementById("retirementSignals");
  const retirementYearRowsTarget = document.getElementById("retirementYearRows");

  if (
    !currentAgeInput ||
    !targetAgeInput ||
    !retirementSpendInput ||
    !withdrawalRateInput ||
    !inflationRateInput ||
    !salaryGrowthRateInput ||
    !rentGrowthRateInput ||
    !expenseGrowthRateInput ||
    !musicGrowthRateInput ||
    !musicTaxRateInput ||
    !applyButton ||
    !errorBox ||
    !assumptionsTarget ||
    !summaryTarget ||
    !milestonesTarget ||
    !retirementTarget ||
    !retirementSummaryTarget ||
    !retirementSignalsTarget ||
    !retirementYearRowsTarget
  ) {
    return;
  }

  const plannerSettings = readPlannerSettings(monthlyPlan);
  currentAgeInput.value = plannerSettings.currentAge;
  targetAgeInput.value = plannerSettings.targetAge;
  retirementSpendInput.value = plannerSettings.retirementSpend;
  withdrawalRateInput.value = plannerSettings.withdrawalRate;
  inflationRateInput.value = plannerSettings.inflationRate;
  salaryGrowthRateInput.value = plannerSettings.salaryGrowthRate;
  rentGrowthRateInput.value = plannerSettings.rentGrowthRate;
  expenseGrowthRateInput.value = plannerSettings.expenseGrowthRate;
  musicGrowthRateInput.value = plannerSettings.musicGrowthRate;
  musicTaxRateInput.value = plannerSettings.musicTaxRate;

  function setPlannerError(messages = []) {
    if (messages.length === 0) {
      errorBox.hidden = true;
      errorBox.innerHTML = "";
      return;
    }

    errorBox.hidden = false;
    errorBox.innerHTML = `<strong>Bitte prüfen:</strong><br>${messages.join("<br>")}`;
  }

  function readPlannerFormValues() {
    return {
      currentAge: Number(currentAgeInput.value),
      targetAge: Number(targetAgeInput.value),
      retirementSpend: Number(retirementSpendInput.value),
      withdrawalRate: Number(withdrawalRateInput.value),
      inflationRate: Number(inflationRateInput.value),
      salaryGrowthRate: Number(salaryGrowthRateInput.value),
      rentGrowthRate: Number(rentGrowthRateInput.value),
      expenseGrowthRate: Number(expenseGrowthRateInput.value),
      musicGrowthRate: Number(musicGrowthRateInput.value),
      musicTaxRate: Number(musicTaxRateInput.value),
    };
  }

  function validatePlannerValues(raw) {
    const messages = [];
    if (!Number.isFinite(raw.currentAge) || raw.currentAge < 18 || raw.currentAge > 80) {
      messages.push("`Aktuelles Alter` muss zwischen 18 und 80 liegen.");
    }
    if (!Number.isFinite(raw.targetAge) || raw.targetAge < 18 || raw.targetAge > 90) {
      messages.push("`Zielalter Rente` muss zwischen 18 und 90 liegen.");
    }
    if (Number.isFinite(raw.currentAge) && Number.isFinite(raw.targetAge) && raw.targetAge < raw.currentAge) {
      messages.push("`Zielalter Rente` darf nicht kleiner sein als `Aktuelles Alter`.");
    }
    if (!Number.isFinite(raw.retirementSpend) || raw.retirementSpend < 0) {
      messages.push("`Bedarf pro Monat in Rente` muss 0 oder größer sein.");
    }
    if (!Number.isFinite(raw.withdrawalRate) || raw.withdrawalRate <= 0 || raw.withdrawalRate > 10) {
      messages.push("`Entnahmerate` muss größer als 0 und höchstens 10 sein.");
    }
    if (!Number.isFinite(raw.inflationRate) || raw.inflationRate < 0) {
      messages.push("`Inflation p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.salaryGrowthRate) || raw.salaryGrowthRate < 0) {
      messages.push("`Gehaltserhöhung p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.rentGrowthRate) || raw.rentGrowthRate < 0) {
      messages.push("`Mieterhöhung p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.expenseGrowthRate) || raw.expenseGrowthRate < 0) {
      messages.push("`Vers. & sonstige Kosten p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.musicGrowthRate) || raw.musicGrowthRate < 0) {
      messages.push("`Musikwachstum p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.musicTaxRate) || raw.musicTaxRate < 0 || raw.musicTaxRate > 60) {
      messages.push("`Steuersatz Musik` muss zwischen 0 und 60 liegen.");
    }
    return messages;
  }

  function update() {
    const raw = readPlannerFormValues();
    const validationErrors = validatePlannerValues(raw);
    if (validationErrors.length > 0) {
      setPlannerError(validationErrors);
      return;
    }

    setPlannerError([]);

    const settings = {
      currentAge: raw.currentAge,
      targetAge: raw.targetAge,
      retirementSpend: raw.retirementSpend,
      withdrawalRate: raw.withdrawalRate,
      inflationRate: raw.inflationRate,
      salaryGrowthRate: raw.salaryGrowthRate,
      rentGrowthRate: raw.rentGrowthRate,
      expenseGrowthRate: raw.expenseGrowthRate,
      musicGrowthRate: raw.musicGrowthRate,
      musicTaxRate: raw.musicTaxRate,
    };
    writePlannerSettings(settings);
    currentAgeInput.value = settings.currentAge;
    targetAgeInput.value = settings.targetAge;

    const plannerAssumptions = {
      inflationRate: settings.inflationRate,
      salaryGrowthRate: settings.salaryGrowthRate,
      rentGrowthRate: settings.rentGrowthRate,
      expenseGrowthRate: settings.expenseGrowthRate,
      musicGrowthRate: settings.musicGrowthRate,
      musicTaxRate: settings.musicTaxRate,
    };
    const firstForecastMonthKey = futureForecastRows(monthlyPlan)[0]?.monthKey ?? "2026-03";
    const targetMonthKey = targetMonthFromAges(settings.currentAge, settings.targetAge, firstForecastMonthKey);
    const retirementMonths = monthsUntilInclusive(firstForecastMonthKey, targetMonthKey);
    const baseSimulation = simulateForecast(importDraft, monthlyPlan, { months: retirementMonths, ...plannerAssumptions });
    const targetYears = Math.max(0, (settings.targetAge - settings.currentAge));
    const retirementSpendAtTarget =
      settings.retirementSpend * Math.pow(1 + settings.inflationRate / 100, targetYears);
    const requiredNestEgg = (retirementSpendAtTarget * 12) / (settings.withdrawalRate / 100);
    const targetRun = requiredConstantMusicForTarget(
      importDraft,
      monthlyPlan,
      targetMonthKey,
      requiredNestEgg,
      plannerAssumptions,
    );
    const baselineAtTarget = firstMonthReaching(baseSimulation, requiredNestEgg);
    const milestoneRows = wealthMilestones(baseSimulation, requiredNestEgg);
    const currentWealth = baseSimulation[0]
      ? baseSimulation[0].safetyStartAmount + baseSimulation[0].investmentStartAmount
      : 0;
    const latestProjectedWealth = baseSimulation.at(-1)?.wealthEndAmount ?? 0;
    const constantMusicNeeded = targetRun?.constantMusicGrossPerMonth ?? 0;
    const targetPathAverageGross =
      targetRun?.simulation.length
        ? targetRun.simulation.reduce((sum, row) => sum + row.musicGross, 0) / targetRun.simulation.length
        : 0;
    const targetPathAverageNet =
      targetRun?.simulation.length
        ? targetRun.simulation.reduce((sum, row) => sum + row.musicNetAvailable, 0) / targetRun.simulation.length
        : 0;
    const targetResult = targetRun?.simulation.at(-1) ?? null;
    const yearBreakdown = buildRetirementYearBreakdown(
      importDraft,
      monthlyPlan,
      plannerAssumptions,
      targetMonthKey,
    );

    assumptionsTarget.textContent =
      `Annahmen gerade aktiv: Inflation ${settings.inflationRate.toFixed(1)} %, Gehalt +${settings.salaryGrowthRate.toFixed(1)} % p.a., Miete +${settings.rentGrowthRate.toFixed(1)} % p.a., Versicherungen und sonstige Kosten +${settings.expenseGrowthRate.toFixed(1)} % p.a., Musik +${settings.musicGrowthRate.toFixed(1)} % p.a., Musiksteuer konservativ ${settings.musicTaxRate.toFixed(1)} %. Dieser Reiter rechnet nur bis zum Zielmonat der Rente; danach wird hier bewusst kein weiteres Arbeitsgehalt mehr fortgeschrieben.`;

    summaryTarget.innerHTML = [
      ["Startvermögen", euro.format(currentWealth)],
      ["Zielmonat Rente", formatMonthLabel(targetMonthKey)],
      ["Bedarf in Zieljahren", euro.format(retirementSpendAtTarget)],
      ["Nest Egg noetig", euro.format(requiredNestEgg)],
      ["Vermögen im Zielmonat", euro.format(latestProjectedWealth)],
      ["Musik konstant nötig", euro.format(constantMusicNeeded)],
      ["Musik brutto im Zielpfad", euro.format(targetPathAverageGross)],
      ["Musik netto im Zielpfad", euro.format(targetPathAverageNet)],
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join("");

    milestonesTarget.innerHTML = milestoneRows
      .map((item) => `
        <article class="milestone-item">
          <strong>${euro.format(item.amount)}</strong>
          <p>${
            item.hitMonthKey
              ? `Erreicht in ${formatMonthLabel(item.hitMonthKey)} mit ca. ${euro.format(item.hitWealthAmount)}.`
              : `Bis ${formatMonthLabel(targetMonthKey)} innerhalb dieses Renten-Zielpfads noch nicht erreicht.`
          }</p>
        </article>
      `)
      .join("");

    const retirementItems = [];
    retirementItems.push(`
      <li>
        <strong>Rentenziel: ${formatMonthLabel(targetMonthKey)}</strong>
        <p>Für inflationsbereinigt ca. ${euro.format(retirementSpendAtTarget)} pro Monat bei ${settings.withdrawalRate.toFixed(1)} % Entnahmerate brauchst du dann rund ${euro.format(requiredNestEgg)} Gesamtvermögen.</p>
      </li>
    `);

    if (baselineAtTarget) {
      retirementItems.push(`
        <li>
          <strong>Mit aktuellem Plan erreichbar</strong>
          <p>Ohne zusätzliche Musikannahme wird das Ziel voraussichtlich in ${formatMonthLabel(baselineAtTarget.monthKey)} erreicht.</p>
        </li>
      `);
    } else {
      retirementItems.push(`
        <li>
          <strong>Mit aktuellem Plan noch nicht erreichbar</strong>
          <p>Bis ${formatMonthLabel(targetMonthKey)} reicht der heutige Forecast allein noch nicht aus.</p>
        </li>
      `);
    }

    if (targetRun) {
      retirementItems.push(`
        <li>
          <strong>Konstanter Musikbetrag</strong>
          <p>Damit das Ziel klappt, rechnet das Modell jetzt mit einem festen Musikumsatz von ${euro.format(constantMusicNeeded)} brutto pro Monat von heute bis zum Zielmonat. Davon werden hier konservativ ${settings.musicTaxRate.toFixed(1)} % Steuer abgezogen, ohne Gegenrechnung über Ausgaben.</p>
        </li>
      `);
    }

    if (targetResult) {
      retirementItems.push(`
        <li>
          <strong>Projektion im Zielmonat</strong>
          <p>Mit dieser Annahme liegst du in ${formatMonthLabel(targetMonthKey)} bei etwa ${euro.format(targetResult.wealthEndAmount)} Gesamtvermögen.</p>
        </li>
      `);
    }

    retirementTarget.innerHTML = `<ul class="signal-list">${retirementItems.join("")}</ul>`;

    retirementSummaryTarget.innerHTML = [
      ["Heute", `${settings.currentAge.toFixed(0)} Jahre`],
      ["Zielalter", `${settings.targetAge.toFixed(0)} Jahre`],
      ["Zielmonat", formatMonthLabel(targetMonthKey)],
      ["Konstante Musik nötig", euro.format(constantMusicNeeded)],
      ["Steuer auf Musik", `${settings.musicTaxRate.toFixed(1)} %`],
      ["Basis-Investment heute", euro.format(yearBreakdown[0]?.plannedSavingsAmount ?? 0)],
      ["Verfügbar ohne Musik heute", euro.format(yearBreakdown[0]?.availableBeforeMusic ?? 0)],
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join("");

    const signalItems = [];
    signalItems.push({
      title: "Ohne Musik sichtbar machen",
      body: "Die Jahrestabelle blendet Musik absichtlich aus. Damit siehst du, wie stark dein Sockel allein durch Gehalt, Kostensteigerungen und Sparlogik trägt.",
    });
    if (yearBreakdown.length > 1) {
      const first = yearBreakdown[0];
      const last = yearBreakdown.at(-1);
      signalItems.push({
        title: "Verfügbare Basis verändert sich jedes Jahr",
        body: `Von ${euro.format(first?.availableBeforeMusic ?? 0)} auf ${euro.format(last?.availableBeforeMusic ?? 0)} pro Monat bis ${last?.year}. Das hilft beim Einschätzen, wie viel Druck wirklich auf Musik liegt.`,
      });
    }
    signalItems.push({
      title: "Versicherungen und sonstige Kosten",
      body: "Diese laufen aktuell gemeinsam in einer konservativen Wachstumsannahme. Wenn du willst, splitte ich als Nächstes Versicherungen, Energie und Sonstiges separat.",
    });
    signalItems.push({
      title: "Horizont endet beim Rentenziel",
      body: `Alle Werte in diesem Reiter enden bei ${formatMonthLabel(targetMonthKey)}. Ab dann ist hier bewusst keine weitere Arbeitsphase mehr unterstellt.`,
    });

    retirementSignalsTarget.innerHTML = signalItems
      .map((item) => `
        <li>
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </li>
      `)
      .join("");

    retirementYearRowsTarget.innerHTML = yearBreakdown
      .map((row) => `
        <tr>
          <td>${row.year}</td>
          <td>${euro.format(row.netSalaryAmount)}</td>
          <td>${euro.format(row.rentAmount)}</td>
          <td>${euro.format(row.fixedOtherAmount)}</td>
          <td>${euro.format(row.variableAmount)}</td>
          <td>${euro.format(row.annualReserveAmount)}</td>
          <td>${euro.format(row.plannedSavingsAmount)}</td>
          <td>${euro.format(row.salaryToSafety)}</td>
          <td>${euro.format(row.salaryToInvestment)}</td>
          <td>${makeMoneyCell(row.availableBeforeMusic)}</td>
        </tr>
      `)
      .join("");
  }

  applyButton.addEventListener("click", () => {
    try {
      update();
    } catch (error) {
      console.error(error);
      setPlannerError(["Die Rentenberechnung konnte gerade nicht aktualisiert werden. Bitte Eingaben prüfen und erneut versuchen."]);
    }
  });

  try {
    update();
  } catch (error) {
    console.error(error);
    setPlannerError(["Die gespeicherten Rentenwerte konnten nicht geladen werden. Bitte Eingaben prüfen und mit `Werte übernehmen` neu rechnen."]);
  }
}

function bindTabs(tabHooks = {}) {
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = [...document.querySelectorAll(".tab-panel")];

  for (const tab of tabs) {
    tab.onclick = () => {
      const target = tab.dataset.tab;
      tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === target));
      saveViewState({ tabId: target ?? "overview" });
      const hook = target ? tabHooks[target] : undefined;
      if (typeof hook === "function") {
        hook();
      }
    };
  }
}

function renderApp({ draftReport, monthlyPlan, importDraft, accounts }, viewState = {}) {
  accountOptions = buildAccountOptions(accounts);
  window.__importDraft = importDraft;
  window.__financeState = { draftReport, monthlyPlan, importDraft, accounts };

  setText("workbookPath", draftReport.workbookPath);
  setText("generatedAt", draftReport.generatedAt);
  setText("netFlow", euro.format(draftReport.totals.netFlow));
  setText("incomeTotal", euro.format(draftReport.totals.incomeTotal));
  setText("expenseTotal", euro.format(draftReport.totals.expenseTotal));

  const baseline = draftReport.baselineSummary;
  const baselineSummary = document.getElementById("baselineSummary");
  if (baselineSummary && baseline) {
    const entries = [
      ["Monat", baseline.monthKey],
      ["Nettogehalt", euro.format(baseline.netSalaryAmount)],
      ["Fixkosten", euro.format(baseline.fixedExpensesAmount)],
      ["Variable Basis", euro.format(baseline.baselineVariableAmount)],
      ["Jahreskostenblock aus Workbook", euro.format(baseline.annualReserveAmount)],
      ["Basis-Investment", euro.format(baseline.plannedSavingsAmount)],
      ["Verfügbar laut Workbook", euro.format(baseline.availableBeforeIrregulars)],
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

  const visibleBaselineLineItems = activeBaselineLineItemsForMonth(importDraft, currentMonthKey());
  renderRows("baselineLineItems", visibleBaselineLineItems, (row) => `
    <tr>
      <td>${row.label}</td>
      <td>${baselineCategoryLabel(row.category)}</td>
      <td>${euro.format(row.amount)}</td>
      <td><div class="filter-group">
        <button class="pill" type="button" data-baseline-edit="${row.id}">Ab Datum ändern</button>
        <button class="pill" type="button" data-baseline-stop="${row.id}">Ab Datum beenden</button>
      </div></td>
    </tr>
  `);
  renderFixedCostPlanner(importDraft);
  renderForecastPlanner(importDraft);
  renderSalaryPlanner(importDraft);
  renderMusicTaxPlanner(importDraft);

  let retirementInitialized = false;
  const initRetirement = () => {
    if (retirementInitialized) return;
    renderGoals(importDraft, monthlyPlan);
    retirementInitialized = true;
  };

  renderValidationSignals(draftReport, monthlyPlan);
  renderWorkbookAnchorChecks(importDraft, monthlyPlan);
  renderMonthHealth(monthlyPlan);
  renderPriorityMonths(monthlyPlan);
  bindMonthFilters(monthlyPlan, viewState.monthFilter ?? window.localStorage.getItem(monthFilterStorageKey) ?? "focus");
  bindMonthReview(
    importDraft,
    monthlyPlan,
    viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? null,
  );
  bindTabs({ retirement: initRetirement });

  activateTab(viewState.tabId ?? window.localStorage.getItem(activeTabStorageKey) ?? "months");
}

async function load() {
  await initializeWorkflowState();
  const state = await fetchFinanceData();
  renderApp(state);
  bindAppControls();
}

load().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="padding:16px;background:#fde7e4;color:#b42318">Fehler beim Laden der lokalen Finanzdaten.</div>`,
  );
});
