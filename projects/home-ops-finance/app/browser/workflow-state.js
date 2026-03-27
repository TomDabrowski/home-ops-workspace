// Browser-side workflow state store. This owns local caches, storage fallback,
// and API persistence so the app shell does not need to inline all of it.

export function createWorkflowStateStore(config) {
  const {
    reconciliationStorageKey,
    mappingStorageKey,
    baselineOverridesStorageKey,
    monthlyExpenseOverridesStorageKey,
    monthlyMusicIncomeOverridesStorageKey,
    musicTaxSettingsStorageKey,
    forecastSettingsStorageKey,
    salarySettingsStorageKey,
    wealthSnapshotsStorageKey,
    allocationActionStateStorageKey,
    householdItemsStorageKey,
  } = config;

  const persistence = {
    reconciliation: "browser",
    mapping: "browser",
    baseline: "browser",
    monthlyExpense: "browser",
    monthlyMusicIncome: "browser",
    musicTax: "browser",
    forecast: "browser",
    salary: "browser",
    wealthSnapshots: "browser",
    allocationAction: "browser",
    household: "browser",
  };

  let reconciliationStateCache = {};
  let mappingStateCache = {};
  let baselineOverridesCache = [];
  let monthlyExpenseOverridesCache = [];
  let monthlyMusicIncomeOverridesCache = [];
  let musicTaxSettingsCache = null;
  let forecastSettingsCache = null;
  let salarySettingsCache = [];
  let wealthSnapshotsCache = [];
  let allocationActionStateCache = {};
  let householdStateCache = { items: [], insuranceCoverageAmount: 0, insuranceCoverageLabel: "" };

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

  function loadStateFromLocalStorage(storageKey) {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
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

  async function persistState(path, storageKey, state, modeKey) {
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
      persistence[modeKey] = "project";
      return { ok: true, mode: "project" };
    } catch {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
      persistence[modeKey] = "browser";
      return { ok: false, mode: "browser" };
    }
  }

  async function initializeWorkflowState() {
    try {
      reconciliationStateCache = await loadStateFromApi("/api/reconciliation-state", reconciliationStorageKey);
      persistence.reconciliation = "project";
    } catch {
      reconciliationStateCache = loadStateFromLocalStorage(reconciliationStorageKey);
      persistence.reconciliation = "browser";
    }

    try {
      mappingStateCache = await loadStateFromApi("/api/import-mappings", mappingStorageKey);
      persistence.mapping = "project";
    } catch {
      mappingStateCache = loadStateFromLocalStorage(mappingStorageKey);
      persistence.mapping = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/baseline-overrides", baselineOverridesStorageKey);
      baselineOverridesCache = Array.isArray(payload) ? payload : [];
      persistence.baseline = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(baselineOverridesStorageKey);
      baselineOverridesCache = Array.isArray(fallback) ? fallback : [];
      persistence.baseline = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/monthly-expense-overrides", monthlyExpenseOverridesStorageKey);
      monthlyExpenseOverridesCache = Array.isArray(payload) ? payload : [];
      persistence.monthlyExpense = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(monthlyExpenseOverridesStorageKey);
      monthlyExpenseOverridesCache = Array.isArray(fallback) ? fallback : [];
      persistence.monthlyExpense = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/monthly-music-income-overrides", monthlyMusicIncomeOverridesStorageKey);
      monthlyMusicIncomeOverridesCache = Array.isArray(payload) ? payload : [];
      persistence.monthlyMusicIncome = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(monthlyMusicIncomeOverridesStorageKey);
      monthlyMusicIncomeOverridesCache = Array.isArray(fallback) ? fallback : [];
      persistence.monthlyMusicIncome = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/music-tax-settings", musicTaxSettingsStorageKey);
      musicTaxSettingsCache = payload && typeof payload === "object" ? payload : null;
      persistence.musicTax = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(musicTaxSettingsStorageKey);
      musicTaxSettingsCache = fallback && typeof fallback === "object" ? fallback : null;
      persistence.musicTax = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/forecast-settings", forecastSettingsStorageKey);
      forecastSettingsCache = payload && typeof payload === "object" ? payload : null;
      persistence.forecast = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(forecastSettingsStorageKey);
      forecastSettingsCache = fallback && typeof fallback === "object" ? fallback : null;
      persistence.forecast = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/salary-settings", salarySettingsStorageKey);
      salarySettingsCache = Array.isArray(payload) ? payload : [];
      persistence.salary = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(salarySettingsStorageKey);
      salarySettingsCache = Array.isArray(fallback) ? fallback : [];
      persistence.salary = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/wealth-snapshots", wealthSnapshotsStorageKey);
      wealthSnapshotsCache = Array.isArray(payload) ? payload : [];
      persistence.wealthSnapshots = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(wealthSnapshotsStorageKey);
      wealthSnapshotsCache = Array.isArray(fallback) ? fallback : [];
      persistence.wealthSnapshots = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/allocation-action-state", allocationActionStateStorageKey);
      allocationActionStateCache = payload && typeof payload === "object" ? payload : {};
      persistence.allocationAction = "project";
    } catch {
      const fallback = loadStateFromLocalStorage(allocationActionStateStorageKey);
      allocationActionStateCache = fallback && typeof fallback === "object" ? fallback : {};
      persistence.allocationAction = "browser";
    }

    try {
      const payload = await loadStateFromApi("/api/household-items", householdItemsStorageKey);
      householdStateCache = normalizeHouseholdState(payload);
      persistence.household = "project";
    } catch {
      try {
        const payload = await loadJsonDocument("/data/household-items.json");
        householdStateCache = normalizeHouseholdState(payload);
        persistence.household = "project_readonly";
        window.localStorage.setItem(householdItemsStorageKey, JSON.stringify(householdStateCache));
      } catch {
        const fallback = loadStateFromLocalStorage(householdItemsStorageKey);
        householdStateCache = normalizeHouseholdState(fallback);
        persistence.household = "browser";
      }
    }
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

  function clearWealthSnapshotsLocal() {
    wealthSnapshotsCache = [];
    window.localStorage.removeItem(wealthSnapshotsStorageKey);
    persistence.wealthSnapshots = "browser";
    return { ok: true, mode: "browser" };
  }

  function readAllocationActionState() {
    return allocationActionStateCache;
  }

  function writeAllocationActionState(state) {
    allocationActionStateCache = state && typeof state === "object" ? state : {};
    window.localStorage.setItem(allocationActionStateStorageKey, JSON.stringify(allocationActionStateCache));
  }

  function readHouseholdState() {
    return householdStateCache;
  }

  function writeHouseholdState(state) {
    householdStateCache = normalizeHouseholdState(state);
    window.localStorage.setItem(householdItemsStorageKey, JSON.stringify(householdStateCache));
  }

  async function saveReconciliationForMonth(monthKey, value) {
    const state = readReconciliationState();
    state[monthKey] = {
      ...value,
      updatedAt: new Date().toISOString(),
    };
    writeReconciliationState(state);
    return persistState("/api/reconciliation-state", reconciliationStorageKey, state, "reconciliation");
  }

  async function saveMappingState(state) {
    writeMappingState(state);
    return persistState("/api/import-mappings", mappingStorageKey, state, "mapping");
  }

  async function saveBaselineOverrides(state) {
    writeBaselineOverrides(state);
    return persistState("/api/baseline-overrides", baselineOverridesStorageKey, state, "baseline");
  }

  async function saveMonthlyExpenseOverrides(state) {
    writeMonthlyExpenseOverrides(state);
    return persistState("/api/monthly-expense-overrides", monthlyExpenseOverridesStorageKey, state, "monthlyExpense");
  }

  async function saveMonthlyMusicIncomeOverrides(state) {
    writeMonthlyMusicIncomeOverrides(state);
    return persistState("/api/monthly-music-income-overrides", monthlyMusicIncomeOverridesStorageKey, state, "monthlyMusicIncome");
  }

  async function saveMusicTaxSettings(state) {
    writeMusicTaxSettings(state);
    return persistState("/api/music-tax-settings", musicTaxSettingsStorageKey, state, "musicTax");
  }

  async function saveForecastSettings(state) {
    writeForecastSettings(state);
    return persistState("/api/forecast-settings", forecastSettingsStorageKey, state, "forecast");
  }

  async function saveSalarySettings(state) {
    writeSalarySettings(state);
    return persistState("/api/salary-settings", salarySettingsStorageKey, state, "salary");
  }

  async function saveWealthSnapshots(state) {
    writeWealthSnapshots(state);
    return persistState("/api/wealth-snapshots", wealthSnapshotsStorageKey, state, "wealthSnapshots");
  }

  async function saveAllocationActionState(state) {
    writeAllocationActionState(state);
    return persistState("/api/allocation-action-state", allocationActionStateStorageKey, state, "allocationAction");
  }

  async function saveHouseholdState(state) {
    writeHouseholdState(state);
    return persistState("/api/household-items", householdItemsStorageKey, householdStateCache, "household");
  }

  return {
    persistence,
    initializeWorkflowState,
    readReconciliationState,
    writeReconciliationState,
    readMappingState,
    writeMappingState,
    readBaselineOverrides,
    writeBaselineOverrides,
    readMonthlyExpenseOverrides,
    writeMonthlyExpenseOverrides,
    readMonthlyMusicIncomeOverrides,
    writeMonthlyMusicIncomeOverrides,
    readMusicTaxSettings,
    writeMusicTaxSettings,
    readForecastSettings,
    writeForecastSettings,
    readSalarySettings,
    writeSalarySettings,
    readWealthSnapshots,
    writeWealthSnapshots,
    clearWealthSnapshotsLocal,
    readAllocationActionState,
    writeAllocationActionState,
    readHouseholdState,
    writeHouseholdState,
    saveReconciliationForMonth,
    saveMappingState,
    saveBaselineOverrides,
    saveMonthlyExpenseOverrides,
    saveMonthlyMusicIncomeOverrides,
    saveMusicTaxSettings,
    saveForecastSettings,
    saveSalarySettings,
    saveWealthSnapshots,
    saveAllocationActionState,
    saveHouseholdState,
  };
}
