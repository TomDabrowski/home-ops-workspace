import test from "node:test";
import assert from "node:assert/strict";

// These browser modules are plain JS on purpose; the test only needs runtime behavior.
// @ts-ignore
import { createPlannerSettingsStore } from "../app/browser/planner-settings.js";
// @ts-ignore
import { createReviewStateTools } from "../app/browser/review-state.js";
// @ts-ignore
import { renderMonthlyExpenseEditor } from "../app/ui/workflow-planners.js";

test("planner settings store falls back to derived defaults and persists updates", () => {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
  } as typeof globalThis.window;

  try {
    storage.set("retirement-test", "{broken");
    const { readPlannerSettings, writePlannerSettings } = createPlannerSettingsStore({
      storageKey: "retirement-test",
    });
    const monthlyPlan = {
      rows: [
        {
          monthKey: "2026-03",
          baselineFixedAmount: 800,
          baselineVariableAmount: 600,
          annualReserveAmount: 300,
        },
      ],
    };

    const defaults = readPlannerSettings(monthlyPlan);
    assert.equal(defaults.retirementSpend, 1700);
    assert.equal(defaults.withdrawalRate, 4);

    writePlannerSettings({
      ...defaults,
      targetAge: 52,
      musicTaxRate: 45,
    });

    const saved = JSON.parse(storage.get("retirement-test") ?? "{}");
    assert.equal(saved.targetAge, 52);
    assert.equal(saved.musicTaxRate, 45);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("review state tools merge saved reconciliation actions and persist mapping edits", async () => {
  const savedMappings: Record<string, unknown>[] = [];
  const originalDocument = globalThis.document;

  globalThis.document = {
    querySelector(selector: string) {
      const lookup = new Map<string, { value?: string; checked?: boolean }>([
        ['[data-mapping-category="income-1"]', { value: "music-income" }],
        ['[data-mapping-account="income-1"]', { value: "giro" }],
        ['[data-mapping-reviewed="income-1"]', { checked: true }],
      ]);
      return lookup.get(selector) ?? null;
    },
  } as typeof globalThis.document;

  try {
    let currentMappings: Record<string, unknown> = {};
    const { reconciliationForMonth, incomeMappingForEntry, saveMappings } = createReviewStateTools({
      readReconciliationState() {
        return {
          "2026-04": {
            status: "in_progress",
            note: "in Arbeit",
            actions: [
              { code: "monthly_deficit", label: "Minus prüfen", done: true, suggestion: "x" },
            ],
            updatedAt: "2026-03-25T20:12:00.000Z",
          },
        };
      },
      readMappingState() {
        return currentMappings;
      },
      writeMappingState(nextState: Record<string, unknown>) {
        currentMappings = nextState;
      },
      async saveMappingState(nextState: Record<string, unknown>) {
        savedMappings.push(structuredClone(nextState));
        return nextState;
      },
    });

    const reconciliation = reconciliationForMonth({
      monthKey: "2026-04",
      consistencySignals: [
        { code: "monthly_deficit", title: "Minus prüfen", severity: "warn" },
        { code: "expense_spike", title: "Ausgabenspitze", severity: "warn" },
      ],
    });

    assert.equal(reconciliation.status, "in_progress");
    assert.equal(reconciliation.actions[0]?.done, true);
    assert.equal(reconciliation.actions[1]?.done, false);

    const defaultIncomeMapping = incomeMappingForEntry({
      id: "income-1",
      incomeStreamId: "music-income",
      kind: "music",
    });
    assert.equal(defaultIncomeMapping.accountId, "giro");

    await saveMappings([{ id: "income-1" }]);

    assert.equal(savedMappings.length, 1);
    assert.deepEqual(savedMappings[0], {
      "income-1": {
        categoryId: "music-income",
        accountId: "giro",
        reviewed: true,
        updatedAt: currentMappings["income-1"] && typeof currentMappings["income-1"] === "object"
          ? (currentMappings["income-1"] as { updatedAt?: string }).updatedAt
          : undefined,
      },
    });
    assert.equal(
      typeof (currentMappings["income-1"] as { updatedAt?: string } | undefined)?.updatedAt,
      "string",
    );
  } finally {
    globalThis.document = originalDocument;
  }
});

test("monthly expense editor defaults to today and stores the month derived from the entered date", async () => {
  const originalDocument = globalThis.document;
  const field = (value: unknown, extra: Record<string, unknown> = {}) => ({
    value,
    dataset: {},
    addEventListener() {},
    ...extra,
  });

  const elements = new Map<string, Record<string, unknown>>([
    ["monthlyExpenseDescription", field("Konzertticket", { oninput: null })],
    ["monthlyExpenseAmount", field("42.5", { oninput: null })],
    ["monthlyExpenseDate", field("", { oninput: null })],
    ["monthlyExpenseCategory", field("other", { innerHTML: "", onchange: null })],
    ["monthlyExpenseAccount", field("giro", { innerHTML: "", onchange: null })],
    ["monthlyExpenseNotes", field("Testnotiz")],
    ["monthlyExpenseMeta", { textContent: "" }],
    ["monthlyExpenseWarnings", {}],
    ["saveMonthlyExpenseButton", { dataset: {}, textContent: "Ausgabe speichern", onclick: null }],
  ]);

  globalThis.document = {
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
  } as typeof globalThis.document;

  let savedState: Record<string, unknown>[] = [];
  let refreshStatus: Record<string, unknown> | null = null;

  try {
    renderMonthlyExpenseEditor({ expenseCategories: [] }, "2026-03", {
      manualExpensesForMonth: () => [],
      optionMarkup: () => "",
      buildCategoryOptions: () => [],
      accountOptions: [],
      todayIsoDate: () => "2026-04-14",
      monthFromDate: (value: string) => String(value).slice(0, 7),
      euro: new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }),
      formatDisplayDate: (value: string) => value,
      monthlyExpensePersistence: "project",
      renderSignalInline: () => {},
      expenseWarningsForInput: () => [],
      confirmAction: () => true,
      readMonthlyExpenseOverrides: () => [],
      async saveMonthlyExpenseOverrides(nextState: Record<string, unknown>[]) {
        savedState = nextState;
        return { mode: "project" };
      },
      async refreshFinanceView(status: Record<string, unknown>) {
        refreshStatus = status;
      },
      statusDetailForMode: () => "Projektdatei",
    });

    assert.equal(elements.get("monthlyExpenseDate")?.value, "2026-04-14");

    const saveButton = elements.get("saveMonthlyExpenseButton") as { onclick?: () => Promise<void> };
    await saveButton.onclick?.();

    assert.equal(savedState.length, 1);
    assert.equal(savedState[0]?.entryDate, "2026-04-14");
    assert.equal(savedState[0]?.monthKey, "2026-04");
    assert.equal(refreshStatus?.title, "Ausgabe gespeichert");
  } finally {
    globalThis.document = originalDocument;
  }
});
