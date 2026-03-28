// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import { createAppShellTools } from "../app/browser/app-shell.js";

test("app shell persists and applies dark mode", () => {
  const storage = new Map<string, string>();
  const themeButton = {
    textContent: "",
    classList: {
      active: false,
      toggle(_name: string, enabled: boolean) {
        this.active = enabled;
      },
    },
  };

  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    matchMedia: () => ({ matches: false }),
  } as unknown as Window & typeof globalThis;

  globalThis.document = {
    documentElement: {
      dataset: {} as Record<string, string>,
    },
    getElementById: (id: string) => (id === "themeModeButton" ? themeButton : null),
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as Document;

  const shell = createAppShellTools({
    activeTabStorageKey: "active-tab",
    monthReviewStorageKey: "month-review",
    monthFilterStorageKey: "month-filter",
    developerModeStorageKey: "developer-mode",
    formulaTooltipStorageKey: "formula-tooltips",
    themeModeStorageKey: "theme-mode",
    clientSessionStorageKey: "client-session",
    clientHeartbeatMs: 15000,
  });

  assert.equal(shell.readThemeMode(), "light");
  shell.writeThemeMode("dark");
  assert.equal(shell.readThemeMode(), "dark");
  shell.applyThemeUi("dark");
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(themeButton.textContent, "Dark Mode an");
  assert.equal(themeButton.classList.active, true);
});

test("app shell keeps tooltip toggle visible outside developer mode", () => {
  const storage = new Map<string, string>();
  const developerButton = {
    textContent: "",
    classList: {
      active: false,
      toggle(_name: string, enabled: boolean) {
        this.active = enabled;
      },
    },
  };
  const tooltipButton = {
    textContent: "",
    hidden: true,
    disabled: true,
    classList: {
      active: false,
      toggle(_name: string, enabled: boolean) {
        this.active = enabled;
      },
    },
  };

  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    matchMedia: () => ({ matches: false }),
  } as unknown as Window & typeof globalThis;

  globalThis.document = {
    documentElement: {
      dataset: {} as Record<string, string>,
    },
    getElementById: (id: string) => {
      if (id === "developerModeButton") return developerButton;
      if (id === "formulaTooltipButton") return tooltipButton;
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as Document;

  const shell = createAppShellTools({
    activeTabStorageKey: "active-tab",
    monthReviewStorageKey: "month-review",
    monthFilterStorageKey: "month-filter",
    developerModeStorageKey: "developer-mode",
    formulaTooltipStorageKey: "formula-tooltips",
    themeModeStorageKey: "theme-mode",
    clientSessionStorageKey: "client-session",
    clientHeartbeatMs: 15000,
  });

  shell.writeFormulaTooltipsEnabled(true);
  shell.applyDeveloperModeUi(false);

  assert.equal(tooltipButton.hidden, false);
  assert.equal(tooltipButton.disabled, false);
  assert.equal(tooltipButton.textContent, "Rechen-Tooltips an");
  assert.equal(tooltipButton.classList.active, true);
});
