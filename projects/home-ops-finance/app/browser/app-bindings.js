// Browser-only bindings for tabs, developer mode, shutdown, and bootstrap.
// Keeping these here helps app.js stay focused on orchestration instead of
// DOM event plumbing.

export function createAppBindingTools(deps) {
  const {
    confirmAction,
    showStatus,
    updateMonthNavVisibility,
    saveViewState,
    applyDeveloperModeUi,
    readDeveloperMode,
    writeDeveloperMode,
    readFormulaTooltipsEnabled,
    writeFormulaTooltipsEnabled,
    readThemeMode,
    writeThemeMode,
    applyThemeUi,
    rerenderSelectedMonthContext,
    activateTab,
    activeTabStorageKey,
    startClientSessionLifecycle,
    initializeWorkflowState,
    fetchFinanceData,
    renderApp,
    escapeHtml,
  } = deps;

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
    const tooltipButton = document.getElementById("formulaTooltipButton");
    if (!button) {
      return;
    }

    applyDeveloperModeUi(readDeveloperMode());
    button.onclick = () => {
      const next = !readDeveloperMode();
      writeDeveloperMode(next);
      applyDeveloperModeUi(next);
      rerenderSelectedMonthContext();
    };

    if (tooltipButton) {
      tooltipButton.onclick = () => {
        const next = !readFormulaTooltipsEnabled();
        writeFormulaTooltipsEnabled(next);
        applyDeveloperModeUi(readDeveloperMode());
        rerenderSelectedMonthContext();
      };
    }
  }

  function bindSettingsPanel() {
    const toggleButton = document.getElementById("settingsToggleButton");
    const panel = document.getElementById("settingsPanel");
    const themeButton = document.getElementById("themeModeButton");

    if (!(toggleButton instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
      return;
    }

    const setOpen = (open) => {
      panel.hidden = !open;
      toggleButton.setAttribute("aria-expanded", open ? "true" : "false");
      toggleButton.classList.toggle("is-active", open);
    };

    setOpen(false);
    applyThemeUi(readThemeMode());

    toggleButton.onclick = (event) => {
      event.stopPropagation();
      setOpen(panel.hidden);
    };

    if (themeButton instanceof HTMLButtonElement) {
      themeButton.onclick = () => {
        const nextMode = readThemeMode() === "dark" ? "light" : "dark";
        writeThemeMode(nextMode);
        applyThemeUi(nextMode);
      };
    }

    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (!panel.hidden && !panel.contains(event.target) && !toggleButton.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    });
  }

  async function load() {
    applyThemeUi(readThemeMode());
    await startClientSessionLifecycle();
    await initializeWorkflowState();
    const state = await fetchFinanceData();
    renderApp(state);
    bindAppControls();
    bindSettingsPanel();
  }

  function handleLoadError(error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="padding:16px;background:#fde7e4;color:#b42318">Fehler beim Laden der lokalen Finanzdaten.<br><small>${escapeHtml(message)}</small></div>`,
    );
  }

  function activateInitialTab(viewState = {}) {
    const initialTabId = viewState.tabId ?? window.localStorage.getItem(activeTabStorageKey) ?? "months";
    updateMonthNavVisibility(initialTabId);
    activateTab(initialTabId);
  }

  return {
    bindTabs,
    bindDeveloperModeToggle,
    bindSettingsPanel,
    load,
    handleLoadError,
    activateInitialTab,
  };
}
