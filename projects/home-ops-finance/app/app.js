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
const wealthSnapshotsStorageKey = "home-ops-finance-wealth-snapshots-v1";
const householdItemsStorageKey = "home-ops-finance-household-items-v1";
const activeTabStorageKey = "home-ops-finance-active-tab-v1";
const monthReviewStorageKey = "home-ops-finance-month-review-v1";
const monthFilterStorageKey = "home-ops-finance-month-filter-v1";
const developerModeStorageKey = "home-ops-finance-developer-mode-v1";
const clientSessionStorageKey = "home-ops-finance-client-session-v1";
const clientHeartbeatMs = 15000;
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
let wealthSnapshotsPersistence = "browser";
let householdPersistence = "browser";
let accountOptions = fallbackAccountOptions;
let statusHideTimer = null;
let musicTaxSettingsCache = null;
let forecastSettingsCache = null;
let salarySettingsCache = [];
let wealthSnapshotsCache = [];
let householdStateCache = { items: [], insuranceCoverageAmount: 0, insuranceCoverageLabel: "" };
let clientSessionId = null;
let clientHeartbeatTimer = null;
let closeSignalSent = false;
let expandedMonthExpenseId = null;
let expandedMonthIncomeId = null;

function financeState() {
  return window.__financeState ?? null;
}

function currentImportDraft() {
  return financeState()?.importDraft ?? window.__importDraft;
}

function currentMonthlyPlan() {
  return financeState()?.monthlyPlan ?? null;
}

function currentSelectedMonthKey() {
  const monthSelect = document.getElementById("monthReviewSelect");
  return viewStateMonthValue(monthSelect) ?? window.localStorage.getItem(monthReviewStorageKey) ?? null;
}

function readDeveloperMode() {
  return window.localStorage.getItem(developerModeStorageKey) === "true";
}

function writeDeveloperMode(enabled) {
  window.localStorage.setItem(developerModeStorageKey, enabled ? "true" : "false");
}

function applyDeveloperModeUi(enabled) {
  const button = document.getElementById("developerModeButton");
  if (button) {
    button.textContent = enabled ? "Entwicklermodus an" : "Entwicklermodus aus";
    button.classList.toggle("is-active", enabled);
  }

  for (const element of document.querySelectorAll("[data-dev-only=\"true\"]")) {
    element.hidden = !enabled;
  }

  const activeTab = activeTabId();
  if (!enabled && (activeTab === "imports" || activeTab === "overview")) {
    activateTab("months");
    saveViewState({ tabId: "months" });
  }
}

function todayIsoDate() {
  return new Date().toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function rerenderSelectedMonthContext() {
  const importDraft = currentImportDraft();
  const monthlyPlan = currentMonthlyPlan();
  const monthKey = currentSelectedMonthKey();
  if (!importDraft || !monthlyPlan || !monthKey) {
    return;
  }

  renderBaselineSummaryForMonth(importDraft, monthKey);
  renderSelectedMonthSharedUi(importDraft, monthKey);
  renderFixedCostPlanner(importDraft, monthKey);
  renderSalaryPlanner(importDraft);
  renderMusicTaxPlanner(importDraft);
  renderMonthReview(importDraft, monthlyPlan, monthKey);
}

function renderBaselineSummaryForMonth(importDraft, monthKey) {
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
    [
      "Übrig nach Fixkosten",
      euro.format(baseline.netSalaryAmount - baseline.fixedExpensesAmount),
    ],
    [
      "Übrig nach allen Monatsblöcken",
      euro.format(baseline.computedAvailableFromParts),
    ],
  ];

  baselineSummary.innerHTML = entries
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function renderSelectedMonthSharedUi(importDraft, monthKey) {
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

function statusDetailForMode(mode) {
  return mode === "project"
    ? "Die Änderung wurde in den Projektdateien gespeichert."
    : "Der Server war nicht erreichbar. Die Änderung liegt vorerst nur im Browser-Fallback.";
}

function persistenceModeLabel(mode) {
  if (mode === "project") {
    return "Projektdatei";
  }
  if (mode === "project_readonly") {
    return "Projektdatei (nur geladen)";
  }
  return "Browser-Fallback";
}

function quarterLabel(monthKey) {
  const month = Number(monthKey.slice(5, 7));
  return `Q${Math.floor((month - 1) / 3) + 1} ${monthKey.slice(0, 4)}`;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function focusAndSelectField(field) {
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) {
    return;
  }

  window.requestAnimationFrame(() => {
    field.focus();
    if (typeof field.setSelectionRange === "function") {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
  });
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

function getClientSessionId() {
  if (clientSessionId) {
    return clientSessionId;
  }

  const stored = window.sessionStorage.getItem(clientSessionStorageKey);
  if (stored) {
    clientSessionId = stored;
    return clientSessionId;
  }

  clientSessionId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `finance-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(clientSessionStorageKey, clientSessionId);
  return clientSessionId;
}

function sendClientSessionEvent(action, useBeacon = false) {
  const payload = JSON.stringify({
    clientId: getClientSessionId(),
    action,
  });

  if (useBeacon && typeof navigator.sendBeacon === "function") {
    const body = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/client-session", body);
    return Promise.resolve();
  }

  return fetch("/api/client-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: useBeacon,
  });
}

function stopClientHeartbeat() {
  if (clientHeartbeatTimer) {
    window.clearInterval(clientHeartbeatTimer);
    clientHeartbeatTimer = null;
  }
}

function signalTabClosed() {
  if (closeSignalSent) {
    return;
  }

  closeSignalSent = true;
  stopClientHeartbeat();
  sendClientSessionEvent("close", true).catch(() => {});
}

async function startClientSessionLifecycle() {
  closeSignalSent = false;
  await sendClientSessionEvent("open");
  stopClientHeartbeat();
  clientHeartbeatTimer = window.setInterval(() => {
    sendClientSessionEvent("heartbeat").catch(() => {});
  }, clientHeartbeatMs);

  window.addEventListener("pagehide", signalTabClosed);
  window.addEventListener("beforeunload", signalTabClosed);
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
  if (!readDeveloperMode() && (tabId === "imports" || tabId === "overview")) {
    tabId = "months";
  }
  const targetTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  targetTab?.click();
}

function isMonthScopedTab(tabId) {
  return tabId === "months" || tabId === "music" || tabId === "baseline" || tabId === "imports";
}

function updateMonthNavVisibility(tabId) {
  const monthNav = document.querySelector(".month-nav-bar");
  if (!(monthNav instanceof HTMLElement)) {
    return;
  }

  monthNav.hidden = !isMonthScopedTab(tabId);
}

function confirmAction(message) {
  return window.confirm(message);
}

async function fetchFinanceData() {
  const fetchJson = (path) => fetch(path, { cache: "no-store" }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }

    return response.json();
  });
  const fetchJsonWithFallback = (preferredPath, fallbackPath) =>
    fetchJson(preferredPath).catch(() => fetchJson(fallbackPath));

  const importDraftPromise = fetchJsonWithFallback("/data/import-draft-reviewed.json", "/data/import-draft.json");
  const draftReportPromise = fetchJsonWithFallback("/data/draft-report-reviewed.json", "/data/draft-report.json");
  const monthlyPlanPromise = fetchJsonWithFallback("/data/monthly-plan-reviewed.json", "/data/monthly-plan.json");

  const [draftReport, monthlyPlan, importDraft, accounts] = await Promise.all([
    draftReportPromise,
    monthlyPlanPromise,
    importDraftPromise,
    fetch("/data/accounts.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),
  ]);

  return applyLocalWorkflowState({ draftReport, monthlyPlan, importDraft, accounts });
}

function monthFromDate(value) {
  return String(value ?? "").slice(0, 7);
}

function compareMonthKeys(left, right) {
  return String(left).localeCompare(String(right));
}

function uniqueMonthKeys(incomeEntries, expenseEntries) {
  const keys = new Set();

  for (const entry of incomeEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  for (const entry of expenseEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  return [...keys].sort(compareMonthKeys);
}

function selectBaselineLineItemsForMonth(lineItems, monthKey) {
  const currentByKey = new Map();

  for (const item of [...(lineItems ?? [])].sort((left, right) => compareMonthKeys(left.effectiveFrom, right.effectiveFrom))) {
    if (compareMonthKeys(item.effectiveFrom, monthKey) > 0) {
      continue;
    }

    const key = `${item.category}:${item.label}`;
    if (Number(item.amount) <= 0) {
      currentByKey.delete(key);
      continue;
    }

    currentByKey.set(key, item);
  }

  return [...currentByKey.values()];
}

function sumLineItems(items, category) {
  return roundCurrency(
    items
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
  );
}

function selectBaselineForMonth(baselines, monthKey) {
  const sorted = [...(baselines ?? [])].sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
  let selected = sorted[0];

  for (const baseline of sorted) {
    if (compareMonthKeys(baseline.monthKey, monthKey) <= 0) {
      selected = baseline;
    } else {
      break;
    }
  }

  return selected;
}

function buildBaselineForMonth(anchor, monthKey) {
  if (!anchor) {
    return null;
  }

  if (anchor.plannedSavingsAmount === 0) {
    return { ...anchor, monthKey, baselineProfile: "historical_liquidity" };
  }

  return { ...anchor, monthKey, baselineProfile: "forecast_investing" };
}

function sumIncomeForMonth(entries, monthKey) {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
  );
}

function sumIncomeReserveForMonth(entries, monthKey) {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + Number(entry.reserveAmount ?? 0), 0),
  );
}

function sumIncomeAvailableForMonth(entries, monthKey) {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + Number(entry.availableAmount ?? (entry.amount ?? 0) - (entry.reserveAmount ?? 0)), 0),
  );
}

function sumMusicIncomeForMonth(entries, monthKey) {
  return roundCurrency(
    entries
      .filter((entry) => entry.incomeStreamId === "music-income" && monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
  );
}

function sumExpensesForMonth(entries, monthKey) {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
  );
}

function wealthBucket(importDraft, kind) {
  return importDraft.wealthBuckets?.find((bucket) => bucket.kind === kind);
}

function wealthAnchorForMonth(importDraft, monthKey) {
  return importDraft.forecastWealthAnchors?.find((anchor) => anchor.monthKey === monthKey);
}

function monthlyReturnFromAnnualRate(rate, mode) {
  if (mode === "compound") {
    return Math.pow(1 + rate, 1 / 12) - 1;
  }

  return rate / 12;
}

function formatCurrency(value) {
  return `${Number(value ?? 0).toFixed(2)} EUR`;
}

function formatPercent(value, digits = 1) {
  return `${(Number(value ?? 0) * 100).toFixed(digits)} %`;
}

function buildConsistencySignals(input) {
  const signals = [];
  const mismatchEntries = [
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

function latestDebtBalances(snapshots) {
  const latest = new Map();

  for (const snapshot of snapshots ?? []) {
    latest.set(snapshot.debtAccountId, {
      debtAccountId: snapshot.debtAccountId,
      snapshotLabel: snapshot.snapshotLabel,
      balance: snapshot.balance,
    });
  }

  return [...latest.values()].sort((left, right) => String(left.debtAccountId).localeCompare(String(right.debtAccountId)));
}

function summarizeMonths(incomeEntries, expenseEntries) {
  const months = new Map();

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

    current.incomeTotal += Number(entry.amount ?? 0);
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

    current.expenseTotal += Number(entry.amount ?? 0);
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
    .sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
}

function draftReportFromImportDraft(importDraft, baseReport) {
  const monthSummaries = summarizeMonths(importDraft.incomeEntries, importDraft.expenseEntries);
  const baseline = importDraft.monthlyBaselines?.[importDraft.monthlyBaselines.length - 1] ?? null;
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

  return {
    ...baseReport,
    workbookPath: importDraft.workbookPath ?? baseReport.workbookPath,
    generatedAt: new Date().toISOString(),
    totals: {
      incomeTotal: roundCurrency(importDraft.incomeEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)),
      expenseTotal: roundCurrency(importDraft.expenseEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)),
      netFlow: roundCurrency(
        importDraft.incomeEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0) -
          importDraft.expenseEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
      ),
      incomeCount: importDraft.incomeEntries.length,
      expenseCount: importDraft.expenseEntries.length,
      debtSnapshotCount: (importDraft.debtSnapshots ?? []).length,
    },
    baselineSummary,
    baselineProfiles: (importDraft.monthlyBaselines ?? []).map((item) => ({
      monthKey: item.monthKey,
      netSalaryAmount: item.netSalaryAmount,
      fixedExpensesAmount: item.fixedExpensesAmount,
      baselineVariableAmount: item.baselineVariableAmount,
      annualReserveAmount: item.annualReserveAmount ?? 0,
      plannedSavingsAmount: item.plannedSavingsAmount,
      availableBeforeIrregulars: item.availableBeforeIrregulars,
    })),
    baselineLineItems: (importDraft.baselineLineItems ?? [])
      .filter((item) => Number(item.amount) > 0)
      .map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        category: item.category,
      })),
    topExpenseMonths: [...monthSummaries].sort((left, right) => right.expenseTotal - left.expenseTotal).slice(0, 5),
    topIncomeMonths: [...monthSummaries].sort((left, right) => right.incomeTotal - left.incomeTotal).slice(0, 5),
    recentMonths: [...monthSummaries].slice(-12),
    latestDebtBalances: latestDebtBalances(importDraft.debtSnapshots),
  };
}

function monthlyPlanFromImportDraft(importDraft, basePlan) {
  if (!Array.isArray(importDraft.monthlyBaselines) || importDraft.monthlyBaselines.length === 0) {
    return basePlan;
  }

  const monthKeys = uniqueMonthKeys(importDraft.incomeEntries, importDraft.expenseEntries);
  const safetyThreshold = assumptionNumber(importDraft, "safety_threshold", 10000);
  const musicThreshold = assumptionNumber(importDraft, "music_threshold", safetyThreshold);
  const safetyStartDefault = wealthBucket(importDraft, "safety")?.currentAmount ?? 0;
  const investmentStartDefault = wealthBucket(importDraft, "investment")?.currentAmount ?? 0;
  const safetyMonthlyReturn = monthlyReturnFromAnnualRate(
    wealthBucket(importDraft, "safety")?.expectedAnnualReturn ?? assumptionNumber(importDraft, "savings_interest_annual", 0.02),
    "simple_division",
  );
  const investmentMonthlyReturn = monthlyReturnFromAnnualRate(
    wealthBucket(importDraft, "investment")?.expectedAnnualReturn ?? assumptionNumber(importDraft, "investment_return_annual", 0.05),
    "compound",
  );
  const firstPlannedMonthKey =
    importDraft.incomeEntries
      .filter((entry) => entry.isPlanned)
      .map((entry) => monthFromDate(entry.entryDate))
      .sort(compareMonthKeys)[0] ??
    importDraft.expenseEntries
      .filter((entry) => entry.isPlanned)
      .map((entry) => monthFromDate(entry.entryDate))
      .sort(compareMonthKeys)[0];

  let safetyBucketEndAmount = safetyStartDefault;
  let investmentBucketEndAmount = investmentStartDefault;

  const rows = monthKeys.map((monthKey) => {
    const selectedBaseline = selectBaselineForMonth(importDraft.monthlyBaselines, monthKey);
    const baseline = buildBaselineForMonth(selectedBaseline, monthKey);
    const activeLineItems = selectBaselineLineItemsForMonth(importDraft.baselineLineItems, monthKey);
    const fixedAmount = sumLineItems(activeLineItems, "fixed");
    const variableAmount = sumLineItems(activeLineItems, "variable");
    const annualReserveAmount = sumLineItems(activeLineItems, "annual_reserve");
    const plannedSavingsAmount = sumLineItems(activeLineItems, "savings");
    const importedIncomeAmount = sumIncomeForMonth(importDraft.incomeEntries, monthKey);
    const importedIncomeReserveAmount = sumIncomeReserveForMonth(importDraft.incomeEntries, monthKey);
    const importedIncomeAvailableAmount = sumIncomeAvailableForMonth(importDraft.incomeEntries, monthKey);
    const musicIncomeAmount = sumMusicIncomeForMonth(importDraft.incomeEntries, monthKey);
    const importedExpenseAmount = sumExpensesForMonth(importDraft.expenseEntries, monthKey);
    const baselineAvailableAmount = roundCurrency(
      baseline.netSalaryAmount - fixedAmount - variableAmount - plannedSavingsAmount,
    );
    const netAfterImportedFlows = roundCurrency(
      baseline.netSalaryAmount -
        fixedAmount -
        variableAmount -
        plannedSavingsAmount +
        importedIncomeAvailableAmount -
        importedExpenseAmount,
    );
    const monthAvailableBeforeExpensesAmount = roundCurrency(baselineAvailableAmount + importedIncomeAvailableAmount);
    const baselineAnchorAvailableAmount = roundCurrency(selectedBaseline.availableBeforeIrregulars);
    const baselineAnchorDeltaAmount = roundCurrency(baselineAvailableAmount - baselineAnchorAvailableAmount);
    const baselineFixedDeltaAmount = roundCurrency(fixedAmount - selectedBaseline.fixedExpensesAmount);
    const baselineVariableDeltaAmount = roundCurrency(variableAmount - selectedBaseline.baselineVariableAmount);
    const annualReserveDeltaAmount = roundCurrency(annualReserveAmount - (selectedBaseline.annualReserveAmount ?? 0));
    const plannedSavingsDeltaAmount = roundCurrency(plannedSavingsAmount - selectedBaseline.plannedSavingsAmount);
    const importedVariableThresholdAmount = roundCurrency(Math.max(baselineAvailableAmount, variableAmount));
    const salaryAllocationToSafetyAmount = roundCurrency(
      Math.max(0, baseline.netSalaryAmount - fixedAmount - variableAmount - plannedSavingsAmount),
    );
    const salaryAllocationToInvestmentAmount = roundCurrency(plannedSavingsAmount);
    const useForecastRouting = firstPlannedMonthKey ? compareMonthKeys(monthKey, firstPlannedMonthKey) >= 0 : false;
    const safetyBucketStartAmount = useForecastRouting ? safetyBucketEndAmount : undefined;
    const investmentBucketStartAmount = useForecastRouting ? investmentBucketEndAmount : undefined;
    const explicitWealthAnchor = wealthAnchorForMonth(importDraft, monthKey);
    const currentSafetyAmount = safetyBucketStartAmount ?? 0;
    const musicSafetyGapAmount = Math.max(0, musicThreshold - currentSafetyAmount);
    const musicAllocationToSafetyAmount = roundCurrency(
      !useForecastRouting ? 0 : Math.min(importedIncomeAvailableAmount, musicSafetyGapAmount),
    );
    const musicAllocationToInvestmentAmount = roundCurrency(
      !useForecastRouting ? 0 : Math.max(0, importedIncomeAvailableAmount - musicAllocationToSafetyAmount),
    );
    const safetyBucketProjectedEndAmount = useForecastRouting
      ? roundCurrency(
          (safetyBucketStartAmount ?? 0) * (1 + safetyMonthlyReturn) +
            salaryAllocationToSafetyAmount +
            musicAllocationToSafetyAmount,
        )
      : undefined;
    const investmentBucketProjectedEndAmount = useForecastRouting
      ? roundCurrency(
          (investmentBucketStartAmount ?? 0) * (1 + investmentMonthlyReturn) +
            salaryAllocationToInvestmentAmount +
            musicAllocationToInvestmentAmount,
        )
      : undefined;
    const projectedWealthCalculatedEndAmount =
      safetyBucketProjectedEndAmount !== undefined && investmentBucketProjectedEndAmount !== undefined
        ? roundCurrency(safetyBucketProjectedEndAmount + investmentBucketProjectedEndAmount)
        : undefined;
    const safetyBucketAnchorAmount = explicitWealthAnchor?.safetyBucketAmount;
    const investmentBucketAnchorAmount = explicitWealthAnchor?.investmentBucketAmount;
    const projectedWealthAnchorAmount =
      safetyBucketAnchorAmount !== undefined && investmentBucketAnchorAmount !== undefined
        ? roundCurrency(safetyBucketAnchorAmount + investmentBucketAnchorAmount)
        : explicitWealthAnchor?.totalWealthAmount;
    const safetyBucketResolvedEndAmount = safetyBucketAnchorAmount ?? safetyBucketProjectedEndAmount;
    const investmentBucketResolvedEndAmount = investmentBucketAnchorAmount ?? investmentBucketProjectedEndAmount;
    const projectedWealthEndAmount =
      safetyBucketResolvedEndAmount !== undefined && investmentBucketResolvedEndAmount !== undefined
        ? roundCurrency(safetyBucketResolvedEndAmount + investmentBucketResolvedEndAmount)
        : undefined;

    if (safetyBucketResolvedEndAmount !== undefined) {
      safetyBucketEndAmount = safetyBucketResolvedEndAmount;
    }
    if (investmentBucketResolvedEndAmount !== undefined) {
      investmentBucketEndAmount = investmentBucketResolvedEndAmount;
    }

    return {
      monthKey,
      baselineProfile: baseline.baselineProfile,
      baselineAnchorMonthKey: selectedBaseline.monthKey,
      netSalaryAmount: baseline.netSalaryAmount,
      baselineFixedAmount: fixedAmount,
      baselineVariableAmount: variableAmount,
      annualReserveAmount,
      plannedSavingsAmount,
      baselineAvailableAmount,
      monthAvailableBeforeExpensesAmount,
      baselineAnchorAvailableAmount,
      baselineAnchorDeltaAmount,
      baselineFixedDeltaAmount,
      baselineVariableDeltaAmount,
      annualReserveDeltaAmount,
      plannedSavingsDeltaAmount,
      importedIncomeAmount,
      importedIncomeReserveAmount,
      importedIncomeAvailableAmount,
      musicIncomeAmount,
      musicAllocationToSafetyAmount,
      musicAllocationToInvestmentAmount,
      salaryAllocationToSafetyAmount,
      salaryAllocationToInvestmentAmount,
      safetyBucketStartAmount,
      safetyBucketCalculatedEndAmount: safetyBucketProjectedEndAmount,
      safetyBucketAnchorAmount,
      safetyBucketEndAmount: safetyBucketResolvedEndAmount,
      investmentBucketStartAmount,
      investmentBucketCalculatedEndAmount: investmentBucketProjectedEndAmount,
      investmentBucketAnchorAmount,
      investmentBucketEndAmount: investmentBucketResolvedEndAmount,
      projectedWealthCalculatedEndAmount,
      projectedWealthAnchorAmount,
      projectedWealthEndAmount,
      wealthAnchorApplied: Boolean(explicitWealthAnchor),
      importedExpenseAmount,
      netAfterImportedFlows,
      consistencySignals: buildConsistencySignals({
        monthKey,
        baselineAnchorMonthKey: selectedBaseline.monthKey,
        baselineAvailableAmount,
        baselineAnchorAvailableAmount,
        baselineAnchorDeltaAmount,
        baselineFixedDeltaAmount,
        baselineVariableDeltaAmount,
        annualReserveDeltaAmount,
        plannedSavingsDeltaAmount,
        importedExpenseAmount,
        importedVariableThresholdAmount,
        importedIncomeAvailableAmount,
        monthAvailableBeforeExpensesAmount,
        netAfterImportedFlows,
      }),
    };
  });

  return {
    ...basePlan,
    workbookPath: importDraft.workbookPath ?? basePlan.workbookPath,
    generatedAt: new Date().toISOString(),
    anchorMonthKey: importDraft.monthlyBaselines[0]?.monthKey ?? basePlan.anchorMonthKey,
    rows,
  };
}

function buildLocalExpenseOverrides() {
  return readMonthlyExpenseOverrides()
    .filter((entry) => entry.isActive !== false)
    .map((entry) => ({
      id: entry.id,
      entryDate: entry.entryDate,
      description: entry.description,
      amount: Number(entry.amount ?? 0),
      expenseCategoryId: entry.expenseCategoryId ?? "other",
      accountId: entry.accountId ?? "giro",
      expenseType: entry.expenseType ?? "variable",
      isRecurring: false,
      isPlanned: entry.monthKey >= "2026-01",
      notes: entry.notes,
    }));
}

function buildLocalMusicIncomeOverrides() {
  return readMonthlyMusicIncomeOverrides()
    .filter((entry) => entry.isActive !== false)
    .map((entry) => ({
      id: entry.id,
      incomeStreamId: "music-income",
      accountId: entry.accountId ?? "giro",
      entryDate: entry.entryDate,
      amount: Number(entry.amount ?? 0),
      reserveAmount: Number(entry.reserveAmount ?? 0),
      availableAmount: roundCurrency(Number(entry.availableAmount ?? (entry.amount ?? 0) - (entry.reserveAmount ?? 0))),
      kind: "music",
      isRecurring: false,
      isPlanned: entry.monthKey >= "2026-01",
      notes: entry.notes,
    }));
}

function buildLocalWealthSnapshotAnchors() {
  return readWealthSnapshots()
    .filter((entry) => entry.isActive !== false)
    .sort((left, right) => String(left.snapshotDate).localeCompare(String(right.snapshotDate)))
    .map((entry) => ({
      monthKey: String(entry.snapshotDate).slice(0, 7),
      safetyBucketAmount: Number(entry.cashAmount ?? 0),
      investmentBucketAmount: Number(entry.investmentAmount ?? 0),
      totalWealthAmount: roundCurrency(Number(entry.cashAmount ?? 0) + Number(entry.investmentAmount ?? 0)),
      sourceSheet: "manual_snapshot",
      sourceRowNumber: 0,
      isManualAnchor: true,
      snapshotDate: entry.snapshotDate,
      notes: entry.notes,
    }));
}

function buildLocalSalaryBaselines(importDraft) {
  const salarySettings = readSalarySettings()
    .filter((entry) => entry.isActive !== false)
    .sort((left, right) => String(left.effectiveFrom ?? "").localeCompare(String(right.effectiveFrom ?? "")));

  if (salarySettings.length === 0 || !Array.isArray(importDraft.monthlyBaselines) || importDraft.monthlyBaselines.length === 0) {
    return importDraft.monthlyBaselines ?? [];
  }

  const monthKeys = new Set([
    ...importDraft.monthlyBaselines.map((entry) => entry.monthKey),
    ...salarySettings.map((entry) => entry.effectiveFrom),
  ]);

  return [...monthKeys]
    .sort(compareMonthKeys)
    .map((monthKey) => {
      const baseline = selectBaselineForMonth(importDraft.monthlyBaselines, monthKey);
      const salary = [...salarySettings].reverse().find((entry) => compareMonthKeys(entry.effectiveFrom, monthKey) <= 0);
      if (!baseline) {
        return null;
      }

      return {
        ...baseline,
        monthKey,
        netSalaryAmount: Number(salary?.netSalaryAmount ?? baseline.netSalaryAmount ?? 0),
      };
    })
    .filter(Boolean);
}

function mergeClientWorkflowIntoImportDraft(importDraft) {
  let nextDraft = importDraft;

  const salaryBaselines = buildLocalSalaryBaselines(nextDraft);
  if (salaryBaselines.length > 0) {
    nextDraft = {
      ...nextDraft,
      monthlyBaselines: salaryBaselines,
    };
  }

  const expenseOverrides = buildLocalExpenseOverrides();
  if (expenseOverrides.length > 0) {
    const expensesById = new Map((nextDraft.expenseEntries ?? []).map((entry) => [entry.id, entry]));
    for (const entry of expenseOverrides) {
      expensesById.set(entry.id, entry);
    }
    nextDraft = {
      ...nextDraft,
      expenseEntries: [...expensesById.values()].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate))),
    };
  }

  const musicIncomeOverrides = buildLocalMusicIncomeOverrides();
  if (musicIncomeOverrides.length > 0) {
    const overrideMonths = new Set(musicIncomeOverrides.map((entry) => monthFromDate(entry.entryDate)));
    nextDraft = {
      ...nextDraft,
      incomeEntries: [
        ...(nextDraft.incomeEntries ?? []).filter(
          (entry) => !(entry.incomeStreamId === "music-income" && overrideMonths.has(monthFromDate(entry.entryDate))),
        ),
        ...musicIncomeOverrides,
      ].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate))),
    };
  }

  const wealthSnapshotAnchors = buildLocalWealthSnapshotAnchors();
  if (wealthSnapshotAnchors.length > 0) {
    const overrideMonths = new Set(wealthSnapshotAnchors.map((entry) => entry.monthKey));
    nextDraft = {
      ...nextDraft,
      forecastWealthAnchors: [
        ...wealthSnapshotAnchors,
        ...(nextDraft.forecastWealthAnchors ?? []).filter((entry) => !overrideMonths.has(entry.monthKey)),
      ],
    };
  }

  return nextDraft;
}

function applyLocalWorkflowState(state) {
  const importDraft = mergeClientWorkflowIntoImportDraft(state.importDraft);
  const draftReport = draftReportFromImportDraft(importDraft, state.draftReport);
  const monthlyPlan = monthlyPlanFromImportDraft(importDraft, state.monthlyPlan);

  return {
    ...state,
    importDraft,
    draftReport,
    monthlyPlan,
  };
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
    const baselineAvailableAmount = netSalaryAmount - fixedAmount - variableAmount - annualReserveAmount - plannedSavingsAmount;
    const importedExpenseAmount = (template.importedExpenseAmount ?? 0) * expenseFactor;
    const baseMusicGross = template.musicIncomeAmount ?? 0;
    const forecastMusicGross = Math.max(0, (baseMusicGross + extraMusicGrossPerMonth) * musicFactor);
    const musicGross =
      typeof constantMusicGrossPerMonth === "number"
        ? Math.max(0, constantMusicGrossPerMonth)
        : Math.max(forecastMusicGross, minimumMusicGrossPerMonth);
    const musicNetAvailable = musicGross * (1 - musicTaxRate / 100);
    const salaryToSafety = Math.max(0, baselineAvailableAmount - importedExpenseAmount);
    const salaryToInvestment = Math.max(0, plannedSavingsAmount);
    const musicSafetyGapAmount = Math.max(0, musicThreshold - safetyStartAmount);
    const musicToSafety = Math.min(musicNetAvailable, musicSafetyGapAmount);
    const musicToInvestment = Math.max(0, musicNetAvailable - musicToSafety);
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
      cashEndAmount: 0,
      investmentEndAmount: 0,
      wealthEndAmount: 0,
    };
    entry.cashEndAmount = row.safetyEndAmount ?? 0;
    entry.investmentEndAmount = row.investmentEndAmount ?? 0;
    entry.wealthEndAmount = row.wealthEndAmount ?? 0;

    grouped.set(year, entry);
  }

  return [...grouped.values()]
    .sort((left, right) => left.year - right.year)
    .map((entry) => ({
      year: entry.year,
      cashEndAmount: entry.cashEndAmount,
      investmentEndAmount: entry.investmentEndAmount,
      wealthEndAmount: entry.wealthEndAmount,
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

function readWealthSnapshots() {
  return wealthSnapshotsCache;
}

function writeWealthSnapshots(state) {
  wealthSnapshotsCache = state;
  window.localStorage.setItem(wealthSnapshotsStorageKey, JSON.stringify(state ?? []));
}

function normalizeHouseholdState(state) {
  if (!state || typeof state !== "object") {
    return { items: [], insuranceCoverageAmount: 0, insuranceCoverageLabel: "" };
  }

  const items = Array.isArray(state.items)
    ? state.items.filter((item) => item && typeof item === "object")
    : [];

  return {
    items,
    insuranceCoverageAmount: Number(state.insuranceCoverageAmount ?? 0),
    insuranceCoverageLabel: String(state.insuranceCoverageLabel ?? ""),
    updatedAt: state.updatedAt ?? null,
  };
}

function readHouseholdState() {
  return householdStateCache;
}

function writeHouseholdState(state) {
  householdStateCache = normalizeHouseholdState(state);
  window.localStorage.setItem(householdItemsStorageKey, JSON.stringify(householdStateCache));
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

async function loadJsonDocument(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return response.json();
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

  try {
    const payload = await loadStateFromApi("/api/wealth-snapshots", wealthSnapshotsStorageKey);
    wealthSnapshotsCache = Array.isArray(payload) ? payload : [];
    wealthSnapshotsPersistence = "project";
  } catch {
    const fallback = loadStateFromLocalStorage(wealthSnapshotsStorageKey);
    wealthSnapshotsCache = Array.isArray(fallback) ? fallback : [];
    wealthSnapshotsPersistence = "browser";
  }

  try {
    const payload = await loadStateFromApi("/api/household-items", householdItemsStorageKey);
    householdStateCache = normalizeHouseholdState(payload);
    householdPersistence = "project";
  } catch {
    try {
      const payload = await loadJsonDocument("/data/household-items.json");
      householdStateCache = normalizeHouseholdState(payload);
      householdPersistence = "project_readonly";
      window.localStorage.setItem(householdItemsStorageKey, JSON.stringify(householdStateCache));
    } catch {
      const fallback = loadStateFromLocalStorage(householdItemsStorageKey);
      householdStateCache = normalizeHouseholdState(fallback);
      householdPersistence = "browser";
    }
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
    return "Grundplan-Posten und Monatswerte fuer diesen Monat gemeinsam pruefen.";
  }
  if (signal.code === "baseline_deficit") {
    return "Grundplan pruefen: Basis-Investment, variable Basis und Fixkosten wirken fuer diesen Monat zu hoch.";
  }
  if (signal.code === "monthly_deficit") {
    return "Einzelne Bewegungen und fehlende Zufluesse im Defizitmonat gemeinsam pruefen.";
  }
  if (signal.code === "expense_over_baseline_available") {
    return "Ausgaben pruefen und entscheiden, ob sie in den Grundplan, die Ruecklage oder nur als Einzelereignis gehoeren.";
  }
  if (signal.code === "expense_spike") {
    return "Ausgabenspitze auf Sonderfall, falsche Zuordnung oder fehlende Gegenbuchung pruefen.";
  }

  return "Monat kurz manuell pruefen.";
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

function baselineLineItemKey(item) {
  return `${item.category}:${item.label}`;
}

function formatDisplayDate(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return String(value);
}

function normalizeComparisonLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function annualReserveDueDateForItem(importDraft, item) {
  if (!importDraft || item.category !== "annual_reserve") {
    return null;
  }

  const itemLabel = normalizeComparisonLabel(item.label);
  if (!itemLabel) {
    return null;
  }

  const itemTokens = itemLabel.split(" ").filter(Boolean);
  const candidates = (importDraft.expenseEntries ?? [])
    .filter((entry) => {
      const description = normalizeComparisonLabel(entry.description);
      if (!description) {
        return false;
      }
      return itemTokens.every((token) => description.includes(token)) || description.includes(itemLabel);
    })
    .sort((left, right) => String(right.entryDate ?? "").localeCompare(String(left.entryDate ?? "")));

  return candidates[0]?.entryDate ?? null;
}

function formatRecurringDayMonth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    return "";
  }

  return String(value).slice(8, 10) + "." + String(value).slice(5, 7) + ".";
}

function baselineAmountLabel(item, importDraft = null) {
  const monthlyAmount = euro.format(item.amount);
  if (item.category === "annual_reserve") {
    const dueDate = annualReserveDueDateForItem(importDraft, item);
    const recurringDueDate = formatRecurringDayMonth(dueDate);
    const dueDateLabel = recurringDueDate ? ` · Abbuchung immer am ${recurringDueDate}` : "";
    return `${monthlyAmount} (${euro.format(Number(item.amount ?? 0) * 12)} p.a.${dueDateLabel})`;
  }

  return monthlyAmount;
}

function storedAmountFromEditorValue(category, rawAmount) {
  if (category === "annual_reserve") {
    return roundCurrency(rawAmount / 12);
  }

  return roundCurrency(rawAmount);
}

function editorValueFromStoredAmount(category, storedAmount) {
  if (category === "annual_reserve") {
    return roundCurrency(Number(storedAmount ?? 0) * 12);
  }

  return roundCurrency(Number(storedAmount ?? 0));
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
      title: "Grundplan und aktuelle Rechnung laufen noch auseinander",
      body: `Zwischen geplanter und aktuell berechneter Basis liegt noch eine Differenz von ${euro.format(delta)}. Das ist ein guter Kandidat für eine kurze Prüfung im Monatsbereich.`,
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
      openMonthReview(monthlyPlan, monthKey);
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
  const importDraft = currentImportDraft();
  if (!importDraft) {
    return;
  }
  renderBaselineSummaryForMonth(importDraft, monthKey);
  renderSelectedMonthSharedUi(importDraft, monthKey);
  renderFixedCostPlanner(importDraft, monthKey);
  renderSalaryPlanner(importDraft);
  renderMusicTaxPlanner(importDraft);
  renderMonthReview(importDraft, monthlyPlan, monthKey);
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
      document.getElementById("monthReviewStartSummary")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
}

function activeBaselineLineItemsForMonth(importDraft, monthKey) {
  const today = todayIsoDate();
  const todayMonthKey = today.slice(0, 7);
  const mergedItems = [
    ...(importDraft.baselineLineItems ?? []),
    ...readBaselineOverrides().filter((item) => item.isActive !== false),
  ];
  const activeItems = mergedItems.filter((item) => item.effectiveFrom <= monthKey);
  const latestByKey = new Map();

  for (const item of activeItems.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))) {
    const key = baselineLineItemKey(item);
    if (Number(item.amount) <= 0) {
      const stopDate = String(item.endDate ?? "");
      const stillRunningThisMonth =
        monthKey === todayMonthKey &&
        item.effectiveFrom === todayMonthKey &&
        stopDate &&
        stopDate > today;

      if (stillRunningThisMonth) {
        const existing = latestByKey.get(key);
        if (existing) {
          latestByKey.set(key, {
            ...existing,
            pendingStopDate: stopDate,
            pendingStopLabel: `Gekündigt zum ${formatDisplayDate(stopDate)}`,
          });
        }
        continue;
      }

      latestByKey.delete(key);
      continue;
    }

    latestByKey.set(key, {
      ...item,
      pendingStopDate: null,
      pendingStopLabel: "",
    });
  }

  for (const item of mergedItems
    .filter((entry) => entry.isActive !== false && Number(entry.amount) <= 0 && entry.effectiveFrom > monthKey)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))) {
    const key = baselineLineItemKey(item);
    const existing = latestByKey.get(key);
    if (!existing || existing.pendingStopLabel) {
      continue;
    }

    latestByKey.set(key, {
      ...existing,
      pendingStopDate: item.endDate ?? null,
      pendingStopLabel: item.endDate
        ? `Gekündigt zum ${formatDisplayDate(item.endDate)}`
        : `Endet ab ${formatMonthLabel(item.effectiveFrom)}`,
    });
  }

  return [...latestByKey.values()];
}

function buildMonthReviewData(importDraft, monthlyPlan, monthKey) {
  const resolvedPlan = monthlyPlanFromImportDraft(importDraft, monthlyPlan);
  const row = resolvedPlan.rows.find((item) => item.monthKey === monthKey);
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
  const fallbackReserveRatio = gross > 0 ? reserve / gross : 0;
  const monthlyPlan = currentMonthlyPlan();
  const yearTaxData = monthlyPlan ? buildMusicYearData(importDraft, monthlyPlan, monthKey) : null;
  const reserveRate = Number(yearTaxData?.effectiveRate ?? fallbackReserveRatio);

  return {
    source,
    reserveRate,
    reserveAmountForGross(amount) {
      return roundCurrency(Math.max(0, amount * reserveRate));
    },
    availableAmountForGross(amount) {
      return roundCurrency(amount - Math.max(0, amount * reserveRate));
    },
  };
}

function isManualExpenseEntry(entry) {
  return readMonthlyExpenseOverrides().some((item) => item.id === entry.id && item.isActive !== false);
}

function isManualMusicIncomeEntry(entry) {
  return readMonthlyMusicIncomeOverrides().some((item) => item.id === entry.id && item.isActive !== false);
}

function unifiedEntrySourceLabel(entry, kind) {
  if (kind === "income") {
    return isManualMusicIncomeEntry(entry) ? "Istwert" : "Import";
  }

  return isManualExpenseEntry(entry) ? "Manuell" : "Import";
}

function renderSignalInline(target, warnings) {
  if (!target) {
    return;
  }

  if (!warnings || warnings.length === 0) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = warnings
    .map((warning) => `
      <div class="signal-inline-item ${warning.severity}">
        <strong>${warning.title}</strong>
        <p>${warning.detail}</p>
      </div>
    `)
    .join("");
}

function expenseWarningsForInput(importDraft, monthKey, draftValue, editingId = "") {
  const warnings = [];
  const description = draftValue.description.trim();
  const amount = Number(draftValue.amount);
  const entryMonthKey = monthFromDate(draftValue.entryDate || `${monthKey}-01`);
  const normalizedDescription = description.toLowerCase();
  const review = buildMonthReviewData(importDraft, currentMonthlyPlan(), monthKey);
  const allMonthExpenses = review?.expenseEntries ?? [];

  if (!description || !Number.isFinite(amount) || amount <= 0) {
    return warnings;
  }

  const duplicates = allMonthExpenses.filter((entry) =>
    entry.id !== editingId &&
    entry.description.trim().toLowerCase() === normalizedDescription &&
    Math.abs(Number(entry.amount) - amount) < 0.01,
  );
  if (duplicates.length > 0) {
    warnings.push({
      severity: "warn",
      title: "Sieht nach doppeltem Eintrag aus",
      detail: `Im Monat gibt es bereits ${duplicates.length} ähnliche Ausgabe(n) mit gleicher Beschreibung und gleichem Betrag.`,
    });
  }

  if (entryMonthKey !== monthKey) {
    warnings.push({
      severity: "info",
      title: "Datum liegt in einem anderen Monat",
      detail: `Die Ausgabe wird unter ${entryMonthKey} gespeichert, nicht unter ${monthKey}.`,
    });
  }

  if ((review?.row?.baselineAvailableAmount ?? 0) > 0 && amount > (review?.row?.baselineAvailableAmount ?? 0)) {
    warnings.push({
      severity: "warn",
      title: "Ausgabe liegt über der freien Monatsbasis",
      detail: `Der Betrag ${euro.format(amount)} ist größer als die freie Basis von ${euro.format(review?.row?.baselineAvailableAmount ?? 0)}.`,
    });
  }

  if (/(musik|mix|master|spotify|distro|cover|gvl|gema|instrument|equipment|gear)/i.test(description) && draftValue.categoryId !== "gear") {
    warnings.push({
      severity: "info",
      title: "Klingt nach musiknaher Ausgabe",
      detail: "Prüf kurz, ob die Kategorie `Gear` oder das Business-Konto besser passt. Dann taucht die Ausgabe sauber im Musik-Reiter auf.",
    });
  }

  if (/steuer|vorauszahlung|finanzamt/i.test(description) && draftValue.categoryId !== "tax") {
    warnings.push({
      severity: "info",
      title: "Klingt nach Steuerzahlung",
      detail: "Wenn das eine Musik-Steuervorauszahlung ist, passt die Kategorie `Steuern` besser in die Musik-Auswertung.",
    });
  }

  return warnings;
}

function renderMonthlyExpenseEditor(importDraft, monthKey) {
  const descriptionField = document.getElementById("monthlyExpenseDescription");
  const amountField = document.getElementById("monthlyExpenseAmount");
  const dateField = document.getElementById("monthlyExpenseDate");
  const categoryField = document.getElementById("monthlyExpenseCategory");
  const accountField = document.getElementById("monthlyExpenseAccount");
  const notesField = document.getElementById("monthlyExpenseNotes");
  const metaTarget = document.getElementById("monthlyExpenseMeta");
  const warningsTarget = document.getElementById("monthlyExpenseWarnings");
  const saveButton = document.getElementById("saveMonthlyExpenseButton");

  if (
    !descriptionField ||
    !amountField ||
    !dateField ||
    !categoryField ||
    !accountField ||
    !notesField ||
    !metaTarget ||
    !saveButton
  ) {
    return;
  }

  const items = manualExpensesForMonth(monthKey);
  categoryField.innerHTML = optionMarkup(buildCategoryOptions(importDraft.expenseCategories), categoryField.value || "other");
  accountField.innerHTML = optionMarkup(accountOptions, accountField.value || "giro");
  if (!(saveButton.dataset.editingId ?? "")) {
    dateField.value = monthKey;
  }

  const persistenceLabel = monthlyExpensePersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = items.length > 0
    ? `${items.length} manuelle Ausgaben im Monat · Speicherort: ${persistenceLabel}`
    : `Noch keine manuelle Monatsausgabe gespeichert · Speicherort: ${persistenceLabel}`;

  const updateWarnings = () => {
    renderSignalInline(warningsTarget, expenseWarningsForInput(importDraft, monthKey, {
      description: descriptionField.value,
      amount: amountField.value,
      entryDate: dateField.value,
      categoryId: categoryField.value,
      accountId: accountField.value,
    }));
  };

  descriptionField.oninput = updateWarnings;
  amountField.oninput = updateWarnings;
  dateField.oninput = updateWarnings;
  categoryField.onchange = updateWarnings;
  accountField.onchange = updateWarnings;
  updateWarnings();

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
}

function renderMonthSourceStats(review) {
  renderRows("monthReviewSourceStats", [
    ["Übrig aus Hauptgehalt", euro.format(review.row.baselineAvailableAmount)],
    ["Zusätzliche Einnahmen", euro.format(review.row.importedIncomeAvailableAmount)],
    ["Ausgaben im Monat", euro.format(review.row.importedExpenseAmount)],
    ["Übrig nach allem", euro.format(review.row.netAfterImportedFlows)],
  ], ([label, value]) => `
    <tr>
      <td>${label}</td>
      <td>${value}</td>
    </tr>
  `);
}

function renderMonthIncomeList(importDraft, review) {
  const target = document.getElementById("monthUnifiedIncomeList");
  if (!target) {
    return;
  }

  const entries = [...review.incomeEntries].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));
  if (entries.length === 0) {
    target.innerHTML = `<p class="empty-state">Keine Einnahmen für diesen Monat.</p>`;
    return;
  }

  target.innerHTML = entries.map((entry) => {
    const isManual = isManualMusicIncomeEntry(entry);
    const expanded = expandedMonthIncomeId === entry.id;
    const label = incomeStreamLabel(importDraft, entry.incomeStreamId);
    return `
      <article class="mapping-card ${expanded ? "is-expanded" : ""}">
        <div class="mapping-card-head">
          <div>
            <strong>${label}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${unifiedEntrySourceLabel(entry, "income")}</p>
          </div>
          <div class="filter-group">
            <button class="pill" type="button" data-month-income-toggle="${entry.id}">${expanded ? "Schließen" : isManual ? "Bearbeiten" : "Details"}</button>
          </div>
        </div>
        ${expanded ? (
          isManual
            ? `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Musik brutto</span>
                  <input type="number" min="0" step="0.01" data-month-income-amount="${entry.id}" value="${escapeHtml(entry.amount)}">
                </label>
                <label class="select-wrap">
                  <span>Monat</span>
                  <input type="month" data-month-income-date="${entry.id}" value="${escapeHtml(monthFromDate(entry.entryDate))}">
                </label>
                <label class="select-wrap planner-span-two">
                  <span>Notiz</span>
                  <input type="text" data-month-income-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}">
                </label>
              </div>
              <div class="filter-group">
                <button class="pill is-active" type="button" data-month-income-save="${entry.id}">Speichern</button>
                <button class="pill pill-danger" type="button" data-month-income-delete="${entry.id}">Löschen</button>
              </div>
            `
            : `<p class="mapping-source">${sourcePreview(entry.notes)}</p>`
        ) : ""}
      </article>
    `;
  }).join("");

  for (const button of target.querySelectorAll("[data-month-income-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-month-income-toggle");
      expandedMonthIncomeId = expandedMonthIncomeId === id ? null : id;
      rerenderSelectedMonthContext();
    });
  }

  for (const button of target.querySelectorAll("[data-month-income-save]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-income-save");
      const source = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!source) {
        return;
      }

      const amount = Number(target.querySelector(`[data-month-income-amount="${id}"]`)?.value);
      const selectedMonthKey = target.querySelector(`[data-month-income-date="${id}"]`)?.value || review.row.monthKey;
      const notes = target.querySelector(`[data-month-income-notes="${id}"]`)?.value?.trim() ?? "";
      if (!Number.isFinite(amount) || amount < 0) {
        showStatus("Musik-Istwert unvollständig", "Bitte einen gültigen Betrag eintragen.", "warn");
        return;
      }

      const profile = musicIncomeProfileForMonth(importDraft, selectedMonthKey);
      const reserveAmount = profile.reserveAmountForGross(amount);
      const availableAmount = roundCurrency(amount - reserveAmount);
      const nextEntry = {
        ...source,
        monthKey: selectedMonthKey,
        entryDate: `${selectedMonthKey}-01`,
        amount,
        reserveAmount,
        availableAmount,
        notes,
        updatedAt: new Date().toISOString(),
      };
      const nextState = readMonthlyMusicIncomeOverrides().map((item) => (item.id === id ? nextEntry : item));
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      expandedMonthIncomeId = null;
      await refreshFinanceView({
        title: "Musik-Istwert aktualisiert",
        detail: `${statusDetailForMode(result.mode)} Reserve ${euro.format(reserveAmount)}, frei ${euro.format(availableAmount)}.`,
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-month-income-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-income-delete");
      const source = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!source || !confirmAction(`Musik-Istwert ${euro.format(source.amount)} für ${source.monthKey} wirklich löschen?`)) {
        return;
      }

      const nextState = readMonthlyMusicIncomeOverrides().map((item) =>
        item.id === id ? { ...item, isActive: false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      expandedMonthIncomeId = null;
      await refreshFinanceView({
        title: "Musik-Istwert gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }
}

function renderMonthExpenseList(importDraft, review) {
  const target = document.getElementById("monthUnifiedExpenseList");
  if (!target) {
    return;
  }

  const entries = [...review.expenseEntries].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));
  if (entries.length === 0) {
    target.innerHTML = `<p class="empty-state">Keine Ausgaben für diesen Monat.</p>`;
    return;
  }

  target.innerHTML = entries.map((entry) => {
    const isManual = isManualExpenseEntry(entry);
    const expanded = expandedMonthExpenseId === entry.id;
    return `
      <article class="mapping-card ${expanded ? "is-expanded" : ""}">
        <div class="mapping-card-head">
          <div>
            <strong>${entry.description}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${expenseCategoryLabel(importDraft, entry.expenseCategoryId)} · ${unifiedEntrySourceLabel(entry, "expense")}</p>
          </div>
          <div class="filter-group">
            <button class="pill" type="button" data-month-expense-toggle="${entry.id}">${expanded ? "Schließen" : isManual ? "Bearbeiten" : "Details"}</button>
          </div>
        </div>
        ${expanded ? (
          isManual
            ? `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Beschreibung</span>
                  <input type="text" data-month-expense-description="${entry.id}" value="${escapeHtml(entry.description)}">
                </label>
                <label class="select-wrap">
                  <span>Betrag</span>
                  <input type="number" min="0" step="0.01" data-month-expense-amount="${entry.id}" value="${escapeHtml(entry.amount)}">
                </label>
                <label class="select-wrap">
                  <span>Datum</span>
                  <input type="date" data-month-expense-date="${entry.id}" value="${escapeHtml(entry.entryDate)}">
                </label>
                <label class="select-wrap">
                  <span>Kategorie</span>
                  <select data-month-expense-category="${entry.id}">${optionMarkup(buildCategoryOptions(importDraft.expenseCategories), entry.expenseCategoryId || "other")}</select>
                </label>
                <label class="select-wrap">
                  <span>Konto</span>
                  <select data-month-expense-account="${entry.id}">${optionMarkup(accountOptions, entry.accountId || "giro")}</select>
                </label>
                <label class="select-wrap">
                  <span>Notiz</span>
                  <input type="text" data-month-expense-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}">
                </label>
              </div>
              <div class="filter-group">
                <button class="pill is-active" type="button" data-month-expense-save="${entry.id}">Speichern</button>
                <button class="pill pill-danger" type="button" data-month-expense-delete="${entry.id}">Löschen</button>
              </div>
            `
            : `<p class="mapping-source">${sourcePreview(entry.notes)}</p>`
        ) : ""}
      </article>
    `;
  }).join("");

  for (const button of target.querySelectorAll("[data-month-expense-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-month-expense-toggle");
      expandedMonthExpenseId = expandedMonthExpenseId === id ? null : id;
      rerenderSelectedMonthContext();
    });
  }

  for (const button of target.querySelectorAll("[data-month-expense-save]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-expense-save");
      const source = readMonthlyExpenseOverrides().find((item) => item.id === id);
      if (!source) {
        return;
      }

      const description = target.querySelector(`[data-month-expense-description="${id}"]`)?.value?.trim() ?? "";
      const amount = Number(target.querySelector(`[data-month-expense-amount="${id}"]`)?.value);
      const entryDate = target.querySelector(`[data-month-expense-date="${id}"]`)?.value || source.entryDate;
      const categoryId = target.querySelector(`[data-month-expense-category="${id}"]`)?.value || "other";
      const accountId = target.querySelector(`[data-month-expense-account="${id}"]`)?.value || "giro";
      const notes = target.querySelector(`[data-month-expense-notes="${id}"]`)?.value?.trim() ?? "";
      if (!description || !Number.isFinite(amount) || amount <= 0) {
        showStatus("Monatsausgabe unvollständig", "Bitte Beschreibung und positiven Betrag eintragen.", "warn");
        return;
      }

      const nextEntry = {
        ...source,
        monthKey: monthFromDate(entryDate),
        entryDate,
        description,
        amount,
        expenseCategoryId: categoryId,
        accountId,
        notes,
        updatedAt: new Date().toISOString(),
      };

      const nextState = readMonthlyExpenseOverrides().map((item) => (item.id === id ? nextEntry : item));
      const result = await saveMonthlyExpenseOverrides(nextState);
      expandedMonthExpenseId = null;
      await refreshFinanceView({
        title: "Monatsausgabe aktualisiert",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-month-expense-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-expense-delete");
      const source = readMonthlyExpenseOverrides().find((item) => item.id === id);
      if (!source || !confirmAction(`Monatsausgabe "${source.description}" vom ${source.entryDate} wirklich löschen?`)) {
        return;
      }

      const nextState = readMonthlyExpenseOverrides().map((item) =>
        item.id === id ? { ...item, isActive: false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMonthlyExpenseOverrides(nextState);
      expandedMonthExpenseId = null;
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
  const reserveRateLabel = formatPercent(profile.reserveRate ?? 0);

  if (!(saveButton.dataset.editingId ?? "")) {
    dateField.value = monthKey;
  }

  summaryTarget.innerHTML = [
    `<div class="mapping-card"><strong>Forecast aktuell</strong><p>${referenceGross > 0 ? `${euro.format(referenceGross)} brutto` : "Noch kein Musik-Forecast für diesen Monat."}</p></div>`,
    `<div class="mapping-card"><strong>Automatische Ableitung</strong><p>${referenceGross > 0 ? `Aktuell rechnet die App mit ${reserveRateLabel} Steuer-Rücklage. Beim Forecast sind das ${euro.format(referenceReserve)} Reserve und ${euro.format(referenceFree)} frei verfügbar.` : `Wenn du einen Ist-Wert speicherst, nutzt die App für ${monthKey} den aktuellen Steuer-Satz aus deiner Jahreslogik: ${reserveRateLabel}.`}</p></div>`,
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
      dateField.value = entry.entryDate;
      notesField.value = entry.notes || "";
      metaTarget.textContent = `Bearbeitungsmodus aktiv für ${euro.format(entry.amount)} brutto`;
      amountField.scrollIntoView({ behavior: "smooth", block: "center" });
      focusAndSelectField(amountField);
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

function isMusicTaxPrepayment(entry) {
  return entry.expenseCategoryId === "tax" || /steuer|finanzamt|vorauszahlung/i.test(`${entry.description} ${entry.notes ?? ""}`);
}

function isMusicRelatedExpense(entry) {
  return (
    entry.expenseCategoryId === "gear" ||
    entry.expenseCategoryId === "tax" ||
    entry.accountId === "business" ||
    /musik|instrument|gear|master|mix|cover|spotify|distro|gvl|gema|steuer/i.test(`${entry.description} ${entry.notes ?? ""}`)
  );
}

function incomeTaxTariff2025(zve) {
  const income = Math.max(0, Math.floor(Number(zve) || 0));
  if (income <= 12096) return 0;
  if (income <= 17443) {
    const y = (income - 12096) / 10000;
    return Math.floor((932.3 * y + 1400) * y);
  }
  if (income <= 68480) {
    const z = (income - 17443) / 10000;
    return Math.floor((176.64 * z + 2397) * z + 1015.13);
  }
  if (income <= 277825) {
    return Math.floor(0.42 * income - 10911.92);
  }
  return Math.floor(0.45 * income - 19246.67);
}

function incomeTaxTariff2026(zve) {
  const income = Math.max(0, Math.floor(Number(zve) || 0));
  if (income <= 12348) return 0;
  if (income <= 17799) {
    const y = (income - 12348) / 10000;
    return Math.floor((914.51 * y + 1400) * y);
  }
  if (income <= 69878) {
    const z = (income - 17799) / 10000;
    return Math.floor((173.1 * z + 2397) * z + 1034.87);
  }
  if (income <= 277825) {
    return Math.floor(0.42 * income - 11135.63);
  }
  return Math.floor(0.45 * income - 19470.38);
}

function incomeTaxByYear(year, zve) {
  return year <= 2025 ? incomeTaxTariff2025(zve) : incomeTaxTariff2026(zve);
}

function buildMusicYearData(importDraft, monthlyPlan, selectedMonthKey) {
  const selectedYear = Number(selectedMonthKey.slice(0, 4));
  const monthKeys = uniqueMonthKeys(importDraft.incomeEntries, importDraft.expenseEntries)
    .filter((monthKey) => Number(monthKey.slice(0, 4)) === selectedYear)
    .sort(compareMonthKeys);
  const musicIncomeEntries = importDraft.incomeEntries.filter((entry) =>
    Number(monthFromDate(entry.entryDate).slice(0, 4)) === selectedYear && entry.incomeStreamId === "music-income",
  );
  const musicExpenseEntries = importDraft.expenseEntries.filter((entry) =>
    Number(monthFromDate(entry.entryDate).slice(0, 4)) === selectedYear && isMusicRelatedExpense(entry),
  );
  const operationalExpenses = musicExpenseEntries.filter((entry) => !isMusicTaxPrepayment(entry));
  const taxPrepayments = musicExpenseEntries.filter((entry) => isMusicTaxPrepayment(entry));
  const yearlySalaryBase = monthlyPlan.rows
    .filter((row) => Number(row.monthKey.slice(0, 4)) === selectedYear)
    .reduce((sum, row) => sum + Number(row.netSalaryAmount ?? 0), 0);
  const yearlyOtherIncomeAvailable = importDraft.incomeEntries
    .filter((entry) => Number(monthFromDate(entry.entryDate).slice(0, 4)) === selectedYear && entry.incomeStreamId !== "music-income")
    .reduce((sum, entry) => sum + Number(entry.availableAmount ?? entry.amount ?? 0), 0);
  const yearlyBaseIncome = yearlySalaryBase + yearlyOtherIncomeAvailable;
  const yearlyMusicGross = musicIncomeEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const yearlyMusicExpenses = operationalExpenses.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const yearlyProfit = Math.max(0, yearlyMusicGross - yearlyMusicExpenses);
  const estimatedTaxAnnual = roundCurrency(
    incomeTaxByYear(selectedYear, yearlyBaseIncome + yearlyProfit) - incomeTaxByYear(selectedYear, yearlyBaseIncome),
  );
  const yearlyPrepaid = roundCurrency(taxPrepayments.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0));
  const effectiveRate = yearlyMusicGross > 0 ? estimatedTaxAnnual / yearlyMusicGross : 0;

  const rows = monthKeys.map((monthKey) => {
    const gross = roundCurrency(
      musicIncomeEntries
        .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
    const expenses = roundCurrency(
      operationalExpenses
        .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
    const prepaid = roundCurrency(
      taxPrepayments
        .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
    const estimatedTax = roundCurrency(gross * effectiveRate);
    return {
      monthKey,
      gross,
      expenses,
      estimatedTax,
      afterTaxAmount: roundCurrency(gross - estimatedTax),
    };
  });

  const selectedMonth = rows.find((row) => row.monthKey === selectedMonthKey) ?? {
    monthKey: selectedMonthKey,
    gross: 0,
    expenses: 0,
    estimatedTax: 0,
    afterTaxAmount: 0,
  };

  return {
    selectedYear,
    rows,
    selectedMonth,
    yearlyBaseIncome: roundCurrency(yearlyBaseIncome),
    yearlyMusicGross: roundCurrency(yearlyMusicGross),
    yearlyMusicExpenses: roundCurrency(yearlyMusicExpenses),
    yearlyProfit: roundCurrency(yearlyProfit),
    estimatedTaxAnnual,
    yearlyPrepaid,
    yearlyBalance: roundCurrency(yearlyPrepaid - estimatedTaxAnnual),
    effectiveRate,
    monthIncomeEntries: musicIncomeEntries.filter((entry) => monthFromDate(entry.entryDate) === selectedMonthKey),
    monthExpenseEntries: musicExpenseEntries.filter((entry) => monthFromDate(entry.entryDate) === selectedMonthKey),
  };
}

function renderMusicWorkspace(importDraft, monthlyPlan, monthKey) {
  const resolvedPlan = monthlyPlanFromImportDraft(importDraft, monthlyPlan);
  const currentLabel = document.getElementById("musicCurrentMonthLabel");
  const summary = document.getElementById("musicSummary");
  const yearSummary = document.getElementById("musicTaxSummary");
  if (currentLabel) {
    currentLabel.textContent = formatMonthLabel(monthKey);
  }

  const data = buildMusicYearData(importDraft, resolvedPlan, monthKey);
  if (summary) {
    const entries = [
      ["Musik-Einnahmen im Monat", euro.format(data.selectedMonth.gross)],
      ["Musik-Ausgaben im Monat", euro.format(data.selectedMonth.expenses)],
      ["Steuer im Monat", euro.format(data.selectedMonth.estimatedTax)],
      ["Nach Steuer im Monat", euro.format(data.selectedMonth.afterTaxAmount)],
      ["Steuersatz aktuell", formatPercent(data.effectiveRate)],
    ];
    summary.innerHTML = entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }

  if (yearSummary) {
    const taxReason =
      data.yearlyMusicGross > 0
        ? `Herleitung: Zusatzsteuer auf den Musik-Gewinn im Jahr ${data.selectedYear}. Die App vergleicht die Einkommensteuer auf Basis-Einkommen plus Musik-Gewinn mit der Steuer auf dein Basis-Einkommen allein. Daraus ergibt sich aktuell ein effektiver Satz von ${formatPercent(data.effectiveRate)} auf den Musik-Umsatz.`
        : `Sobald im Jahr ${data.selectedYear} Musik-Umsatz vorliegt, berechnet die App hier den effektiven Zusatz-Steuersatz aus der Differenz zwischen Steuer mit und ohne Musik-Gewinn.`;
    yearSummary.innerHTML = [
      `<div class="mapping-card"><strong>Musik-Einnahmen im Jahr</strong><p>${euro.format(data.yearlyMusicGross)}</p></div>`,
      `<div class="mapping-card"><strong>Musik-Ausgaben im Jahr</strong><p>${euro.format(data.yearlyMusicExpenses)}</p></div>`,
      `<div class="mapping-card"><strong>Steuer im Jahr</strong><p>${euro.format(data.estimatedTaxAnnual)} geschätzt bei ${formatPercent(data.effectiveRate)}.</p></div>`,
      `<div class="mapping-card"><strong>Einordnung</strong><p>${taxReason}</p></div>`,
    ].join("");
  }

  renderRows("musicMonthRows", data.rows, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.gross)}</td>
      <td>${euro.format(row.expenses)}</td>
      <td>${euro.format(row.estimatedTax)}</td>
      <td>${euro.format(row.afterTaxAmount)}</td>
    </tr>
  `);

  const incomeTarget = document.getElementById("musicIncomeEntries");
  if (incomeTarget) {
    incomeTarget.innerHTML = data.monthIncomeEntries.length > 0
      ? data.monthIncomeEntries.map((entry) => `
          <article class="mapping-card">
            <strong>${incomeStreamLabel(importDraft, entry.incomeStreamId)}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${unifiedEntrySourceLabel(entry, "income")}</p>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `).join("")
      : `<p class="empty-state">Keine Musik-Einnahmen im geöffneten Monat.</p>`;
  }

  const expenseTarget = document.getElementById("musicExpenseEntries");
  if (expenseTarget) {
    expenseTarget.innerHTML = data.monthExpenseEntries.length > 0
      ? data.monthExpenseEntries.map((entry) => `
          <article class="mapping-card">
            <strong>${entry.description}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${expenseCategoryLabel(importDraft, entry.expenseCategoryId)}</p>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `).join("")
      : `<p class="empty-state">Keine musiknahen Ausgaben im geöffneten Monat.</p>`;
  }
}

function renderImportsWorkspace(importDraft, review) {
  setText("importsCurrentMonthLabel", formatMonthLabel(review.row.monthKey));

  const importedIncomeTarget = document.getElementById("importsIncomeList");
  const importedExpenseTarget = document.getElementById("importsExpenseList");
  if (importedIncomeTarget) {
    const importedIncome = review.incomeEntries.filter((entry) => !isManualMusicIncomeEntry(entry));
    importedIncomeTarget.innerHTML = importedIncome.length > 0
      ? importedIncome.map((entry) => `
          <article class="mapping-card">
            <strong>${incomeStreamLabel(importDraft, entry.incomeStreamId)}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)}</p>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `).join("")
      : `<p class="empty-state">Keine importierten Einnahmen in diesem Monat.</p>`;
  }

  if (importedExpenseTarget) {
    const importedExpenses = review.expenseEntries.filter((entry) => !isManualExpenseEntry(entry));
    importedExpenseTarget.innerHTML = importedExpenses.length > 0
      ? importedExpenses.map((entry) => `
          <article class="mapping-card">
            <strong>${entry.description}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${expenseCategoryLabel(importDraft, entry.expenseCategoryId)}</p>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `).join("")
      : `<p class="empty-state">Keine importierten Ausgaben in diesem Monat.</p>`;
  }

  renderEntryMappings(importDraft, review);
}

function renderMonthReview(importDraft, monthlyPlan, monthKey) {
  const review = buildMonthReviewData(importDraft, monthlyPlan, monthKey);
  if (!review) return;

  const startSummary = document.getElementById("monthReviewStartSummary");
  const flowSummary = document.getElementById("monthReviewFlowSummary");
  const endSummary = document.getElementById("monthReviewEndSummary");
  const startWealthAmount =
    Number(review.row.safetyBucketStartAmount ?? 0) + Number(review.row.investmentBucketStartAmount ?? 0);

  if (startSummary) {
    const entries = [
      [
        "Cash am Monatsanfang",
        review.row.safetyBucketStartAmount !== undefined ? euro.format(review.row.safetyBucketStartAmount) : "-",
      ],
      [
        "Investment am Monatsanfang",
        review.row.investmentBucketStartAmount !== undefined ? euro.format(review.row.investmentBucketStartAmount) : "-",
      ],
      [
        "Gesamtvermögen am Monatsanfang",
        review.row.safetyBucketStartAmount !== undefined && review.row.investmentBucketStartAmount !== undefined
          ? euro.format(startWealthAmount)
          : "-",
      ],
      ["Nettogehalt im Monat", euro.format(review.row.netSalaryAmount)],
    ];
    startSummary.innerHTML = entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }

  if (flowSummary) {
    const fixedMonthlyCosts = Number(review.row.baselineFixedAmount ?? 0) + Number(review.row.baselineVariableAmount ?? 0);
    const entries = [
      ["Fixkosten im Monat", euro.format(fixedMonthlyCosts)],
      ["Basis-Investment", euro.format(review.row.plannedSavingsAmount ?? 0)],
      ["Musik brutto", euro.format(review.row.musicIncomeAmount ?? 0)],
      ["Zusätzliche Ausgaben außerhalb Grundplan", euro.format(review.row.importedExpenseAmount ?? 0)],
    ];
    flowSummary.innerHTML = entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }

  if (endSummary) {
    const entries = [
      [
        "Cash am Monatsende",
        review.row.safetyBucketEndAmount !== undefined ? euro.format(review.row.safetyBucketEndAmount) : "-",
      ],
      [
        "Investment am Monatsende",
        review.row.investmentBucketEndAmount !== undefined ? euro.format(review.row.investmentBucketEndAmount) : "-",
      ],
      [
        "Gesamtvermögen am Monatsende",
        review.row.projectedWealthEndAmount !== undefined ? euro.format(review.row.projectedWealthEndAmount) : "-",
      ],
    ];
    endSummary.innerHTML = entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }

  renderMonthAllocationGuidance(review);
  renderRows("monthReviewBaselineItems", review.baselineLineItems, (item) => `
    <tr>
      <td>${item.label}${item.pendingStopLabel ? `<div class="cell-note">${item.pendingStopLabel}</div>` : ""}</td>
      <td>${baselineCategoryLabel(item.category)}</td>
      <td>${baselineAmountLabel(item, importDraft)}</td>
    </tr>
  `);
  renderMonthSourceStats(review);
  renderMonthIncomeList(importDraft, review);
  renderMonthExpenseList(importDraft, review);

  const signalsTarget = document.getElementById("monthReviewSignals");
  if (signalsTarget && readDeveloperMode()) {
    signalsTarget.innerHTML = renderSignalItems(
      review.row.consistencySignals,
      "Für diesen Monat wurden aktuell keine automatischen Hinweise gefunden.",
    );
  } else if (signalsTarget) {
    signalsTarget.innerHTML = "";
  }

  if (readDeveloperMode()) {
    renderReconciliation(review.row);
    renderImportsWorkspace(importDraft, review);
  }
  renderMusicWorkspace(importDraft, monthlyPlan, monthKey);
  renderMonthlyExpenseEditor(importDraft, monthKey);
  renderMonthlyMusicIncomeEditor(importDraft, monthKey);
}

function renderMonthAllocationGuidance(review) {
  const target = document.getElementById("monthAllocationGuidance");
  if (!target) {
    return;
  }

  const musicGrossAmount = Number(review.row.musicIncomeAmount ?? 0);
  const musicReserveAmount = Number(review.row.importedIncomeReserveAmount ?? 0);
  const musicFreeAmount = Number(review.row.importedIncomeAvailableAmount ?? 0);
  const salaryInvestmentAmount = Number(review.row.salaryAllocationToInvestmentAmount ?? 0);
  const salaryCashAmount = Number(review.row.salaryAllocationToSafetyAmount ?? 0);
  const musicInvestmentAmount = Number(review.row.musicAllocationToInvestmentAmount ?? 0);
  const musicCashAmount = Number(review.row.musicAllocationToSafetyAmount ?? 0);
  const musicReserveRate = musicGrossAmount > 0 ? musicReserveAmount / musicGrossAmount : 0;

  target.innerHTML = [
    `<div class="mapping-card"><strong>Aus Hauptgehalt sofort weg</strong><p>${euro.format(salaryInvestmentAmount)} direkt ins Investment. ${euro.format(salaryCashAmount)} bleiben aus dem Gehalt im Cash-Puffer.</p></div>`,
    `<div class="mapping-card"><strong>Von Musik für Steuer parken</strong><p>${musicGrossAmount > 0 ? `${euro.format(musicReserveAmount)} als Steuer-Rücklage (${formatPercent(musicReserveRate)}). Das basiert auf deiner aktuellen Jahreslogik.` : "Für diesen Monat ist aktuell kein Musikumsatz hinterlegt."}</p></div>`,
    `<div class="mapping-card"><strong>Von Musik nach Steuer ins Investment</strong><p>${musicGrossAmount > 0 ? `${euro.format(musicInvestmentAmount)} gehen nach dem Auffüllen der Cash-Schwelle ins Investment.` : "Sobald Musikumsatz eingeplant oder als Istwert erfasst ist, erscheint hier der Betrag."}</p></div>`,
    `<div class="mapping-card"><strong>Von Musik nach Steuer im Cash</strong><p>${musicGrossAmount > 0 ? `${euro.format(musicCashAmount)} gehen zuerst in den Cash-Puffer bis zur Schwelle. Frei nach Steuer insgesamt: ${euro.format(musicFreeAmount)}.` : "Noch kein freier Musikbetrag für diesen Monat."}</p></div>`,
  ].join("");
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
      title: `Prüfstatus für ${row.monthKey} gespeichert`,
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
    renderBaselineSummaryForMonth(importDraft, initialMonth);
    renderSelectedMonthSharedUi(importDraft, initialMonth);
    renderFixedCostPlanner(importDraft, initialMonth);
    renderSalaryPlanner(importDraft);
    renderMusicTaxPlanner(importDraft);
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

async function saveWealthSnapshots(state) {
  writeWealthSnapshots(state);
  return persistState("/api/wealth-snapshots", wealthSnapshotsStorageKey, state, (mode) => {
    wealthSnapshotsPersistence = mode;
  });
}

async function saveHouseholdState(state) {
  writeHouseholdState(state);
  return persistState("/api/household-items", householdItemsStorageKey, householdStateCache, (mode) => {
    householdPersistence = mode;
  });
}

function householdAreaLabel(value) {
  return value === "music" ? "Musik-Equipment" : "Allgemeiner Hausrat";
}

function activeHouseholdItems() {
  return (readHouseholdState().items ?? [])
    .filter((item) => item.isActive !== false)
    .sort((left, right) => String(left.area ?? "").localeCompare(String(right.area ?? "")) || String(left.name ?? "").localeCompare(String(right.name ?? "")));
}

function renderHouseholdWorkspace() {
  const summaryTarget = document.getElementById("householdSummary");
  const listTarget = document.getElementById("householdItemList");
  const nameField = document.getElementById("householdItemName");
  const areaField = document.getElementById("householdItemArea");
  const valueField = document.getElementById("householdItemValue");
  const notesField = document.getElementById("householdItemNotes");
  const saveButton = document.getElementById("saveHouseholdItemButton");
  const metaTarget = document.getElementById("householdMeta");
  const coverageAmountField = document.getElementById("householdCoverageAmount");
  const coverageLabelField = document.getElementById("householdCoverageLabel");
  const coverageSaveButton = document.getElementById("saveHouseholdCoverageButton");
  const coverageMetaTarget = document.getElementById("householdCoverageMeta");

  if (
    !summaryTarget || !listTarget || !nameField || !areaField || !valueField || !notesField ||
    !saveButton || !metaTarget || !coverageAmountField || !coverageLabelField || !coverageSaveButton || !coverageMetaTarget
  ) {
    return;
  }

  const state = readHouseholdState();
  const items = activeHouseholdItems();
  const generalTotal = items
    .filter((item) => item.area !== "music")
    .reduce((sum, item) => sum + Number(item.estimatedValue ?? 0), 0);
  const musicTotal = items
    .filter((item) => item.area === "music")
    .reduce((sum, item) => sum + Number(item.estimatedValue ?? 0), 0);
  const total = generalTotal + musicTotal;
  const coverageAmount = Number(state.insuranceCoverageAmount ?? 0);

  summaryTarget.innerHTML = [
    ["Gesamtsumme", euro.format(total)],
    ["Allgemeiner Hausrat", euro.format(generalTotal)],
    ["Musik-Equipment", euro.format(musicTotal)],
    ["Versicherungssumme", coverageAmount > 0 ? euro.format(coverageAmount) : "-"],
    ["Abweichung", coverageAmount > 0 ? euro.format(coverageAmount - total) : "-"],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");

  const persistenceLabel = persistenceModeLabel(householdPersistence);
  metaTarget.textContent = items.length > 0
    ? `${items.length} Hausrat-Posten aktiv · Speicherort: ${persistenceLabel}`
    : `Noch keine Hausrat-Posten gespeichert · Speicherort: ${persistenceLabel}`;
  coverageMetaTarget.textContent = coverageAmount > 0
    ? `Aktuell ${euro.format(coverageAmount)}${state.insuranceCoverageLabel ? ` · ${state.insuranceCoverageLabel}` : ""} · Speicherort: ${persistenceLabel}`
    : `Noch keine Versicherungssumme gespeichert · Speicherort: ${persistenceLabel}`;

  coverageAmountField.value = coverageAmount > 0 ? String(coverageAmount) : "";
  coverageLabelField.value = state.insuranceCoverageLabel ?? "";

  if (items.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch keine Hausrat-Posten vorhanden.</p>`;
  } else {
    listTarget.innerHTML = items.map((item) => `
      <article class="mapping-card">
        <div class="mapping-card-head">
          <div>
            <strong>${escapeHtml(item.name ?? "")}</strong>
            <p>${householdAreaLabel(item.area)} · ${euro.format(Number(item.estimatedValue ?? 0))}</p>
          </div>
          <div class="filter-group">
            <button class="pill" type="button" data-household-edit="${item.id}">Bearbeiten</button>
            <button class="pill pill-danger" type="button" data-household-delete="${item.id}">Löschen</button>
          </div>
        </div>
        <p class="section-copy">${escapeHtml(item.notes || "Keine Notiz.")}</p>
      </article>
    `).join("");
  }

  for (const button of listTarget.querySelectorAll("[data-household-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-household-edit");
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      saveButton.dataset.editingId = item.id;
      nameField.value = item.name ?? "";
      areaField.value = item.area ?? "general";
      valueField.value = String(item.estimatedValue ?? "");
      notesField.value = item.notes ?? "";
      saveButton.textContent = "Hausrat-Posten aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${item.name}`;
      nameField.scrollIntoView({ behavior: "smooth", block: "center" });
      focusAndSelectField(nameField);
    });
  }

  for (const button of listTarget.querySelectorAll("[data-household-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-household-delete");
      const item = items.find((entry) => entry.id === id);
      if (!item || !confirmAction(`Hausrat-Posten "${item.name}" wirklich löschen?`)) {
        return;
      }

      const nextState = {
        ...state,
        items: (state.items ?? []).map((entry) =>
          entry.id === id ? { ...entry, isActive: false, updatedAt: new Date().toISOString() } : entry,
        ),
        updatedAt: new Date().toISOString(),
      };
      const result = await saveHouseholdState(nextState);
      await refreshFinanceView({
        title: "Hausrat-Posten gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const name = nameField.value.trim();
    const area = areaField.value === "music" ? "music" : "general";
    const estimatedValue = Number(valueField.value);
    const notes = notesField.value.trim();

    if (!name || !Number.isFinite(estimatedValue) || estimatedValue < 0) {
      metaTarget.textContent = "Bitte Name und gültigen Wert eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(
      isEditing
        ? `Hausrat-Posten "${name}" wirklich aktualisieren?`
        : `Hausrat-Posten "${name}" wirklich speichern?`,
    )) {
      return;
    }

    const nextEntry = {
      id: editingId || `household-${Date.now()}`,
      name,
      area,
      estimatedValue,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    const nextState = {
      ...state,
      items: editingId
        ? (state.items ?? []).map((entry) => (entry.id === editingId ? nextEntry : entry))
        : [...(state.items ?? []), nextEntry],
      updatedAt: new Date().toISOString(),
    };
    const result = await saveHouseholdState(nextState);
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Hausrat-Posten speichern";
    nameField.value = "";
    areaField.value = "general";
    valueField.value = "";
    notesField.value = "";
    await refreshFinanceView({
      title: isEditing ? "Hausrat-Posten aktualisiert" : "Hausrat-Posten gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };

  coverageSaveButton.onclick = async () => {
    const insuranceCoverageAmount = Number(coverageAmountField.value);
    const insuranceCoverageLabel = coverageLabelField.value.trim();

    if (!Number.isFinite(insuranceCoverageAmount) || insuranceCoverageAmount < 0) {
      coverageMetaTarget.textContent = "Bitte eine gültige Versicherungssumme eintragen.";
      return;
    }

    if (!confirmAction(`Versicherungssumme von ${euro.format(insuranceCoverageAmount)} wirklich speichern?`)) {
      return;
    }

    const result = await saveHouseholdState({
      ...state,
      insuranceCoverageAmount,
      insuranceCoverageLabel,
      updatedAt: new Date().toISOString(),
    });
    await refreshFinanceView({
      title: "Versicherungssumme gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
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
    `<div class="mapping-card"><strong>Musik-Schwelle</strong><p>Bis ${euro.format(musicThreshold)} füllt freie Musik zuerst deinen Cash-Puffer auf. Alles darüber geht ins Investment.</p></div>`,
    `<div class="mapping-card"><strong>Wirkung</strong><p>Wenn dein Cash unter die Musik-Schwelle fällt, füllt freie Musik erst diese Lücke. Nur der Rest erhöht direkt dein Investment.</p></div>`,
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
    currentSelectedMonthKey() ??
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

  if (!(saveButton.dataset.editingId ?? "")) {
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

function renderWealthSnapshotPlanner(importDraft) {
  const dateField = document.getElementById("wealthSnapshotDate");
  const cashField = document.getElementById("wealthSnapshotCashAmount");
  const investmentField = document.getElementById("wealthSnapshotInvestmentAmount");
  const notesField = document.getElementById("wealthSnapshotNotes");
  const metaTarget = document.getElementById("wealthSnapshotMeta");
  const listTarget = document.getElementById("wealthSnapshotList");
  const saveButton = document.getElementById("saveWealthSnapshotButton");

  if (!dateField || !cashField || !investmentField || !notesField || !metaTarget || !listTarget || !saveButton) {
    return;
  }

  const snapshots = [...readWealthSnapshots()].sort((left, right) =>
    String(left.snapshotDate ?? "").localeCompare(String(right.snapshotDate ?? "")),
  );
  const fallbackDate = todayIsoDate();

  function resetForm() {
    dateField.value = fallbackDate;
    cashField.value = "";
    investmentField.value = "";
    notesField.value = "";
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Ist-Stand speichern";
  }

  if (!dateField.value) {
    dateField.value = fallbackDate;
  }

  if (snapshots.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch kein manueller Vermögensstand gespeichert.</p>`;
  } else {
    listTarget.innerHTML = snapshots
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${entry.snapshotDate}</strong>
              <p>Cash ${euro.format(entry.cashAmount)} · Investment ${euro.format(entry.investmentAmount)} · Monat ${String(entry.snapshotDate).slice(0, 7)}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-wealth-snapshot-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-wealth-snapshot-toggle="${entry.id}">
                ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
              </button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `)
      .join("");
  }

  const persistenceLabel = wealthSnapshotsPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = snapshots.length > 0
    ? `${snapshots.length} Ist-Stand(e) gespeichert · Speicherort: ${persistenceLabel}`
    : `Noch kein manueller Vermögensstand gespeichert · Speicherort: ${persistenceLabel}`;

  for (const button of listTarget.querySelectorAll("[data-wealth-snapshot-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-wealth-snapshot-edit");
      const entry = readWealthSnapshots().find((item) => item.id === id);
      if (!entry) return;
      dateField.value = entry.snapshotDate || fallbackDate;
      cashField.value = String(entry.cashAmount ?? 0);
      investmentField.value = String(entry.investmentAmount ?? 0);
      notesField.value = entry.notes || "";
      saveButton.dataset.editingId = entry.id;
      saveButton.textContent = "Ist-Stand aktualisieren";
    });
  }

  for (const button of listTarget.querySelectorAll("[data-wealth-snapshot-toggle]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-wealth-snapshot-toggle");
      if (!id) return;
      const nextState = readWealthSnapshots().map((entry) =>
        entry.id === id ? { ...entry, isActive: entry.isActive === false, updatedAt: new Date().toISOString() } : entry,
      );
      const result = await saveWealthSnapshots(nextState);
      await refreshFinanceView({
        title: "Ist-Stand aktualisiert",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const snapshotDate = dateField.value || fallbackDate;
    const cashAmount = Number(cashField.value);
    const investmentAmount = Number(investmentField.value);
    const notes = notesField.value.trim();

    if (!snapshotDate || !Number.isFinite(cashAmount) || cashAmount < 0 || !Number.isFinite(investmentAmount) || investmentAmount < 0) {
      metaTarget.textContent = "Bitte Datum sowie gültige Cash- und Investment-Werte eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(
      isEditing
        ? `Ist-Stand für ${snapshotDate} wirklich aktualisieren?`
        : `Ist-Stand für ${snapshotDate} wirklich speichern?`,
    )) {
      return;
    }

    const nextEntry = {
      id: editingId || `wealth-snapshot-${Date.now()}`,
      snapshotDate,
      cashAmount,
      investmentAmount,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    const nextState = editingId
      ? readWealthSnapshots().map((entry) => (entry.id === editingId ? nextEntry : entry))
      : [...readWealthSnapshots(), nextEntry];
    const result = await saveWealthSnapshots(nextState);
    resetForm();
    await refreshFinanceView({
      title: isEditing ? "Ist-Stand aktualisiert" : "Ist-Stand gespeichert",
      detail: `${statusDetailForMode(result.mode)} Gilt für ${snapshotDate.slice(0, 7)} als gespeicherter Ist-Stand.`,
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
    currentSelectedMonthKey() ??
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

function renderFixedCostPlanner(importDraft, selectedMonthKey = null) {
  const labelField = document.getElementById("fixedCostLabel");
  const categoryField = document.getElementById("fixedCostCategory");
  const amountLabel = document.getElementById("fixedCostAmountLabel");
  const amountField = document.getElementById("fixedCostAmount");
  const effectiveFromField = document.getElementById("fixedCostEffectiveFrom");
  const endDateWrap = document.getElementById("fixedCostEndDateWrap");
  const endDateField = document.getElementById("fixedCostEndDate");
  const notesField = document.getElementById("fixedCostNotes");
  const saveButton = document.getElementById("saveFixedCostButton");
  const listTarget = document.getElementById("fixedCostList");
  const metaTarget = document.getElementById("fixedCostMeta");

  if (!labelField || !categoryField || !amountLabel || !amountField || !effectiveFromField || !endDateWrap || !endDateField || !notesField || !saveButton || !listTarget || !metaTarget) {
    return;
  }

  const overrides = [...readBaselineOverrides()].sort((left, right) =>
    (left.effectiveFrom ?? "").localeCompare(right.effectiveFrom ?? ""),
  );
  let editingId = saveButton.dataset.editingId ?? "";
  const sourceLineItemId = saveButton.dataset.sourceLineItemId ?? "";

  function updateStopModeUi() {
    const stopMode = saveButton.dataset.stopMode === "true";
    endDateWrap.hidden = !stopMode;
    endDateField.disabled = !stopMode;
    effectiveFromField.disabled = stopMode;
  }

  function updateAmountFieldUi() {
    const isAnnualReserve = categoryField.value === "annual_reserve";
    amountLabel.textContent = isAnnualReserve ? "Jährlicher Betrag" : "Betrag pro Monat";
    amountField.placeholder = isAnnualReserve ? "0 pro Jahr" : "0";
  }

  function resetForm() {
    labelField.value = "";
    categoryField.value = "fixed";
    categoryField.disabled = false;
    amountField.value = "";
    effectiveFromField.value = suggestedMonth;
    endDateField.value = todayIsoDate();
    notesField.value = "";
    labelField.readOnly = false;
    saveButton.dataset.editingId = "";
    saveButton.dataset.sourceLineItemId = "";
    saveButton.dataset.stopMode = "";
    saveButton.textContent = "Grundplan-Posten speichern";
    updateStopModeUi();
    updateAmountFieldUi();
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
              <p>${baselineCategoryLabel(entry.category ?? "fixed")} · ab ${entry.effectiveFrom} · ${isStopEntry ? `${entry.endDate ? `gekündigt zum ${formatDisplayDate(entry.endDate)}` : "endet ab diesem Monat"}` : `${euro.format(entry.amount)} pro Monat`} · ${entry.isActive === false ? "deaktiviert" : "aktiv"}</p>
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
    selectedMonthKey ??
    currentSelectedMonthKey() ??
    importDraft.monthlyBaselines[importDraft.monthlyBaselines.length - 1]?.monthKey ??
    reviewFocusMonthKey;
  if (!editingId && !sourceLineItemId) {
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
      amountField.value = entry.amount > 0 ? String(editorValueFromStoredAmount(categoryField.value, entry.amount)) : "";
      effectiveFromField.value = entry.effectiveFrom ?? suggestedMonth;
      endDateField.value = entry.endDate ?? todayIsoDate();
      notesField.value = entry.notes ?? "";
      labelField.readOnly = Boolean(entry.sourceLineItemId);
      saveButton.textContent = "Fixkosten aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${entry.label}`;
      updateStopModeUi();
      updateAmountFieldUi();
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
    const rawAmount = Number(amountField.value);
    const rawEffectiveFrom = effectiveFromField.value;
    const endDate = endDateField.value;
    const notes = notesField.value.trim();
    const stopMode = saveButton.dataset.stopMode === "true";
    const effectiveFrom = stopMode ? String(endDate || "").slice(0, 7) : rawEffectiveFrom;
    const amount = storedAmountFromEditorValue(category, rawAmount);

    if (!label || !effectiveFrom || (stopMode && !endDate) || (!stopMode && (!Number.isFinite(rawAmount) || rawAmount <= 0))) {
      metaTarget.textContent = stopMode
        ? "Bitte Name und Kündigungsdatum eintragen."
        : "Bitte Name, positiven Monatsbetrag und gültig-ab-Monat eintragen.";
      return;
    }

    const isEditing = Boolean(editingId || sourceLineItemId);
    if (!confirmAction(
      stopMode
        ? `Posten "${label}" wirklich zum ${formatDisplayDate(endDate)} beenden?`
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
            endDate,
            sourceLineItemId: sourceLineItemId || undefined,
            category,
            cadence: "monthly",
            isActive: true,
            notes: notes || `Gekündigt zum ${formatDisplayDate(endDate)}.`,
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
        amountField.value = String(editorValueFromStoredAmount(categoryField.value, source.amount));
        effectiveFromField.value = suggestedMonth;
        notesField.value = `Ändert bestehenden Posten ab ${suggestedMonth}.`;
        labelField.readOnly = true;
        categoryField.disabled = true;
        saveButton.textContent = "Grundplan-Override speichern";
        metaTarget.textContent = `Bearbeitungsmodus aktiv für bestehenden Posten: ${source.label}`;
        labelField.scrollIntoView({ behavior: "smooth", block: "center" });
        amountField.focus();
        updateStopModeUi();
        updateAmountFieldUi();
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
        endDateField.value = todayIsoDate();
        notesField.value = `Gekündigt zum ${formatDisplayDate(endDateField.value)}.`;
        labelField.readOnly = true;
        categoryField.disabled = true;
        saveButton.textContent = "Kündigung speichern";
        metaTarget.textContent = `Kündigungsmodus aktiv für ${source.label}. Wähle jetzt das Kündigungsdatum aus und speichere dann.`;
        updateStopModeUi();
        updateAmountFieldUi();
        endDateField.scrollIntoView({ behavior: "smooth", block: "center" });
        endDateField.focus();
      }
    };
  }

  updateStopModeUi();
  categoryField.addEventListener("change", updateAmountFieldUi);
  updateAmountFieldUi();
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
      ["Cash im ersten Zieljahr", euro.format(yearBreakdown[0]?.cashEndAmount ?? 0)],
      ["Vermögen im ersten Zieljahr", euro.format(yearBreakdown[0]?.wealthEndAmount ?? 0)],
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
        title: "Vermögenspfad ohne Musik",
        body: `Ohne zusätzliche Musik steigt das Vermögen in dieser Sicht von ${euro.format(first?.wealthEndAmount ?? 0)} auf ${euro.format(last?.wealthEndAmount ?? 0)} bis ${last?.year}. Daran misst die App dann die noch nötige Musiklücke.`,
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
          <td>${euro.format(row.cashEndAmount)}</td>
          <td>${euro.format(row.investmentEndAmount)}</td>
          <td>${euro.format(row.wealthEndAmount)}</td>
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
      updateMonthNavVisibility(target ?? "overview");
      saveViewState({ tabId: target ?? "overview" });
      const hook = target ? tabHooks[target] : undefined;
      if (typeof hook === "function") {
        hook();
      }
    };
  }
}

function bindDeveloperModeToggle() {
  const button = document.getElementById("developerModeButton");
  if (!button) {
    return;
  }

  applyDeveloperModeUi(readDeveloperMode());
  button.onclick = () => {
    const next = !readDeveloperMode();
    writeDeveloperMode(next);
    applyDeveloperModeUi(next);
  };
}

function renderApp({ draftReport, monthlyPlan, importDraft, accounts }, viewState = {}) {
  accountOptions = buildAccountOptions(accounts);
  window.__importDraft = importDraft;
  window.__financeState = { draftReport, monthlyPlan, importDraft, accounts };

  setText("generatedAt", draftReport.generatedAt);
  setText("netFlow", euro.format(draftReport.totals.netFlow));
  setText("incomeTotal", euro.format(draftReport.totals.incomeTotal));
  setText("expenseTotal", euro.format(draftReport.totals.expenseTotal));

  const baselineMonthKey = viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? currentMonthKey();
  renderBaselineSummaryForMonth(importDraft, baselineMonthKey);

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

  renderSelectedMonthSharedUi(
    importDraft,
    viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? currentMonthKey(),
  );
  renderFixedCostPlanner(
    importDraft,
    viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? currentMonthKey(),
  );
  renderForecastPlanner(importDraft);
  renderSalaryPlanner(importDraft);
  renderWealthSnapshotPlanner(importDraft);
  renderMusicTaxPlanner(importDraft);
  renderHouseholdWorkspace();

  let retirementInitialized = false;
  const initRetirement = () => {
    if (retirementInitialized) return;
    renderGoals(importDraft, monthlyPlan);
    retirementInitialized = true;
  };

  renderValidationSignals(draftReport, monthlyPlan);
  renderMonthHealth(monthlyPlan);
  renderPriorityMonths(monthlyPlan);
  bindMonthFilters(monthlyPlan, viewState.monthFilter ?? window.localStorage.getItem(monthFilterStorageKey) ?? "focus");
  bindMonthReview(
    importDraft,
    monthlyPlan,
    viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? null,
  );
  bindDeveloperModeToggle();
  bindTabs({ retirement: initRetirement });

  const initialTabId = viewState.tabId ?? window.localStorage.getItem(activeTabStorageKey) ?? "months";
  updateMonthNavVisibility(initialTabId);
  activateTab(initialTabId);
}

async function load() {
  await startClientSessionLifecycle();
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
