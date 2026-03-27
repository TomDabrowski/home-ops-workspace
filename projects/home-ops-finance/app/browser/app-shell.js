// Browser app-shell helpers: view state, developer mode UI, transient status,
// and client-session lifecycle. Keeps orchestration plumbing out of app.js.

export function createAppShellTools(config) {
  const {
    activeTabStorageKey,
    monthReviewStorageKey,
    monthFilterStorageKey,
    developerModeStorageKey,
    formulaTooltipStorageKey,
    themeModeStorageKey,
    clientSessionStorageKey,
    clientHeartbeatMs,
  } = config;

  let statusHideTimer = null;
  let clientSessionId = null;
  let clientHeartbeatTimer = null;
  let closeSignalSent = false;

  function readDeveloperMode() {
    return window.localStorage.getItem(developerModeStorageKey) === "true";
  }

  function writeDeveloperMode(enabled) {
    window.localStorage.setItem(developerModeStorageKey, enabled ? "true" : "false");
  }

  function readFormulaTooltipsEnabled() {
    const stored = window.localStorage.getItem(formulaTooltipStorageKey);
    return stored === null ? true : stored === "true";
  }

  function writeFormulaTooltipsEnabled(enabled) {
    window.localStorage.setItem(formulaTooltipStorageKey, enabled ? "true" : "false");
  }

  function prefersDarkTheme() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function readThemeMode() {
    const stored = window.localStorage.getItem(themeModeStorageKey);
    if (stored === "dark" || stored === "light") {
      return stored;
    }

    return prefersDarkTheme() ? "dark" : "light";
  }

  function writeThemeMode(mode) {
    window.localStorage.setItem(themeModeStorageKey, mode === "dark" ? "dark" : "light");
  }

  function activeTabId() {
    return document.querySelector(".tab.is-active")?.dataset.tab ?? "months";
  }

  function activeMonthFilter() {
    return document.querySelector("#monthFilters .pill.is-active")?.dataset.filter ?? "focus";
  }

  function viewStateMonthValue(monthSelect) {
    return monthSelect instanceof HTMLSelectElement ? monthSelect.value : null;
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

  function applyDeveloperModeUi(enabled) {
    const button = document.getElementById("developerModeButton");
    if (button) {
      button.textContent = enabled ? "Entwicklermodus an" : "Entwicklermodus aus";
      button.classList.toggle("is-active", enabled);
    }

    const tooltipButton = document.getElementById("formulaTooltipButton");
    if (tooltipButton) {
      const tooltipEnabled = enabled && readFormulaTooltipsEnabled();
      tooltipButton.hidden = !enabled;
      tooltipButton.disabled = !enabled;
      tooltipButton.textContent = tooltipEnabled ? "Erklaerungs-Tooltips an" : "Erklaerungs-Tooltips aus";
      tooltipButton.classList.toggle("is-active", tooltipEnabled);
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

  function applyThemeUi(mode = readThemeMode()) {
    document.documentElement.dataset.theme = mode;
    const button = document.getElementById("themeModeButton");
    if (button) {
      const darkEnabled = mode === "dark";
      button.textContent = darkEnabled ? "Dark Mode an" : "Dark Mode aus";
      button.classList.toggle("is-active", darkEnabled);
    }
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

  function confirmAction(message) {
    return window.confirm(message);
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

  return {
    readDeveloperMode,
    writeDeveloperMode,
    readFormulaTooltipsEnabled,
    writeFormulaTooltipsEnabled,
    readThemeMode,
    writeThemeMode,
    activeTabId,
    activeMonthFilter,
    viewStateMonthValue,
    saveViewState,
    currentViewState,
    activateTab,
    isMonthScopedTab,
    updateMonthNavVisibility,
    applyDeveloperModeUi,
    applyThemeUi,
    showStatus,
    confirmAction,
    startClientSessionLifecycle,
  };
}
