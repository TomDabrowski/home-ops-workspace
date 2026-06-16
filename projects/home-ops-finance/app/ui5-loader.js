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

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.__ui5ModulesLoaded = false;
  window.__ui5LoadError = null;
  document.documentElement.dataset.ui5Loaded = "pending";
  delete document.documentElement.dataset.ui5LoadError;

  try {
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
