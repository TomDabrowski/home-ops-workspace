// Browser runtime helpers for app state access, date defaults, and data
// loading/refresh. This keeps app.js focused on composition instead of
// low-level browser/runtime plumbing.

export function createAppRuntimeTools({
  viewStateMonthValue,
  monthReviewStorageKey,
  roundCurrency,
  wealthSnapshotCashTotal,
  thresholdAccountLabel,
  getAccountOptions,
  initializeWorkflowState,
  currentViewState,
  applyLocalWorkflowState,
  renderApp,
  showStatus,
}) {
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

  function wealthSnapshotCashTotalForEntry(entry) {
    return wealthSnapshotCashTotal(entry, roundCurrency);
  }

  function thresholdAccountLabelForId(accountId) {
    return thresholdAccountLabel(getAccountOptions(), accountId);
  }

  function todayIsoDate() {
    return new Date().toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  function localDateTimeInputValue(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function defaultDateTimeForMonth(monthKey) {
    const now = new Date();
    const nowMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return monthKey === nowMonthKey ? localDateTimeInputValue(now) : `${monthKey}-01T12:00`;
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

  return {
    financeState,
    currentImportDraft,
    currentMonthlyPlan,
    currentSelectedMonthKey,
    wealthSnapshotCashTotalForEntry,
    thresholdAccountLabelForId,
    todayIsoDate,
    localDateTimeInputValue,
    defaultDateTimeForMonth,
    fetchFinanceData,
    refreshFinanceView,
  };
}
