const ui5Modules = [
  "/app/vendor/@ui5/webcomponents/dist/Button.js",
  "/app/vendor/@ui5/webcomponents/dist/Input.js",
  "/app/vendor/@ui5/webcomponents/dist/TextArea.js",
  "/app/vendor/@ui5/webcomponents/dist/CheckBox.js",
  "/app/vendor/@ui5/webcomponents/dist/Dialog.js",
  "/app/vendor/@ui5/webcomponents/dist/MessageStrip.js",
  "/app/vendor/@ui5/webcomponents/dist/Option.js",
  "/app/vendor/@ui5/webcomponents/dist/Select.js",
  "/app/vendor/@ui5/webcomponents/dist/Panel.js",
  "/app/vendor/@ui5/webcomponents/dist/Bar.js",
  "/app/vendor/@ui5/webcomponents/dist/Card.js",
  "/app/vendor/@ui5/webcomponents/dist/CardHeader.js",
];

function initialThemeMode() {
  try {
    const storedMode = window.localStorage.getItem("home-ops-finance-theme-mode-v1");
    if (storedMode === "dark" || storedMode === "light") {
      return storedMode;
    }
  } catch {
    // Ignore storage access problems and fall back to the system preference.
  }

  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.__ui5ModulesLoaded = false;
  window.__ui5LoadError = null;
  window.__homeOpsSetUi5Theme = null;
  const initialMode = initialThemeMode();
  const initialUi5Theme = initialMode === "dark" ? "sap_horizon_dark" : "sap_horizon";
  document.documentElement.dataset.theme = initialMode;
  document.documentElement.setAttribute("data-ui5-theme", initialUi5Theme);
  document.documentElement.dataset.ui5Loaded = "pending";
  delete document.documentElement.dataset.ui5LoadError;

  try {
    const { setTheme } = await import("/app/vendor/@ui5/webcomponents-base/dist/config/Theme.js");
    window.__homeOpsSetUi5Theme = async (themeName) => {
      document.documentElement.setAttribute("data-ui5-theme", themeName);
      await setTheme(themeName);
    };
    await window.__homeOpsSetUi5Theme(initialUi5Theme);
    await Promise.all(ui5Modules.map((modulePath) => import(modulePath)));
    window.__ui5ModulesLoaded = true;
    document.documentElement.dataset.ui5Loaded = "true";
  } catch (error) {
    window.__ui5LoadError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    document.documentElement.dataset.ui5Loaded = "false";
    document.documentElement.dataset.ui5LoadError = window.__ui5LoadError;
    console.error("UI5 bootstrap failed", error);
  }
}
