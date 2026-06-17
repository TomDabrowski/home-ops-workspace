import test from "node:test";
import assert from "node:assert/strict";

// These browser modules are plain JS on purpose; the test only needs runtime behavior.
// @ts-ignore
import { createPlannerSettingsStore } from "../app/browser/planner-settings.js";
// @ts-ignore
import { createReviewStateTools } from "../app/browser/review-state.js";
// @ts-ignore
import { renderMonthlyExpenseEditor, renderWealthSnapshotPlanner } from "../app/ui/workflow-planners.js";
// @ts-ignore
import { renderValidationSignals } from "../app/ui/overview-dashboard.js";
// @ts-ignore
import { renderMonthTagesgeldWithdrawalHint } from "../app/ui/month-review.js";
// @ts-ignore
import { escapeHtml, roundCurrency } from "../app/shared/ui-formatters.js";

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
    assert.equal(defaults.currentAge, 26);
    assert.equal(defaults.spendingBasis, "actual");
    assert.equal(defaults.retirementSpend, 1700);
    assert.equal(defaults.replacementRate, 76);
    assert.equal(defaults.salaryGrowthRate, 2.5);
    assert.equal(defaults.withdrawalRate, 3.5);

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

test("monthly expense editor defaults to the opened month and stores the month derived from the entered date", async () => {
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
  let refreshStatus: any = null;

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
      async refreshFinanceView(status: any) {
        refreshStatus = status;
      },
      statusDetailForMode: () => "Projektdatei",
    });

    assert.equal(elements.get("monthlyExpenseDate")?.value, "2026-03-01");

    elements.get("monthlyExpenseDate")!.value = "2026-04-14";

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

test("movement editor keeps multiple manual incomes separate", async () => {
  const originalDocument = globalThis.document;
  const originalDateNow = Date.now;
  const originalMathRandom = Math.random;
  const field = (value: unknown, extra: Record<string, unknown> = {}) => ({
    value,
    dataset: {},
    addEventListener() {},
    ...extra,
  });

  const elements = new Map<string, Record<string, unknown>>([
    ["monthlyMovementType", field("income", { onchange: null })],
    ["monthlyExpenseDescription", field("Verkauf Kaffeemaschine", { oninput: null })],
    ["monthlyExpenseAmount", field("100", { oninput: null })],
    ["monthlyExpenseDate", field("2026-05-10", { oninput: null })],
    ["monthlyExpenseCategory", field("other", { innerHTML: "", parentElement: { hidden: false }, onchange: null })],
    ["monthlyIncomeStream", field("misc-inflows", { innerHTML: "", onchange: null })],
    ["monthlyIncomeStreamWrap", { hidden: false }],
    ["monthlyExpenseAccount", field("giro", { innerHTML: "", onchange: null })],
    ["monthlyExpenseNotes", field("Notiz")],
    ["monthlyExpenseMeta", { textContent: "" }],
    ["monthlyExpenseWarnings", {}],
    ["saveMonthlyExpenseButton", { dataset: {}, textContent: "Bewegung speichern", onclick: null }],
  ]);

  globalThis.document = {
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
  } as typeof globalThis.document;

  let savedIncomeState: Record<string, unknown>[] = [];
  let refreshStatus: any = null;
  const nowValues = [1715250060000, 1715250060000];
  Date.now = () => nowValues.shift() ?? 1715250060000;
  Math.random = () => 0.123456789;

  try {
    renderMonthlyExpenseEditor({ expenseCategories: [], incomeStreams: [] }, "2026-05", {
      manualExpensesForMonth: () => [],
      musicIncomeProfileForMonth: () => ({
        reserveAmountForGross: () => 0,
        availableAmountForGross: (amount: number) => amount,
      }),
      optionMarkup: () => "",
      buildCategoryOptions: () => [],
      accountOptions: [],
      todayIsoDate: () => "2026-05-14",
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
      async saveMonthlyExpenseOverrides() {
        return { mode: "project" };
      },
      readMonthlyMusicIncomeOverrides: () => savedIncomeState,
      async saveMonthlyMusicIncomeOverrides(nextState: Record<string, unknown>[]) {
        savedIncomeState = nextState;
        return { mode: "project" };
      },
      async refreshFinanceView(status: any) {
        refreshStatus = status;
      },
      statusDetailForMode: () => "Projektdatei",
    });

    const saveButton = elements.get("saveMonthlyExpenseButton") as { onclick?: () => Promise<void>; dataset: Record<string, string> };
    await saveButton.onclick?.();
    const firstId = String(savedIncomeState[0]?.id ?? "");
    assert.equal(savedIncomeState.length, 1);

    const descriptionField = elements.get("monthlyExpenseDescription") as { value: string };
    const amountField = elements.get("monthlyExpenseAmount") as { value: string };
    const movementTypeField = elements.get("monthlyMovementType") as { value: string };
    descriptionField.value = "Verkauf Schreibtisch";
    amountField.value = "220";
    movementTypeField.value = "income";
    await saveButton.onclick?.();

    assert.equal(savedIncomeState.length, 2);
    assert.notEqual(savedIncomeState[0]?.id, savedIncomeState[1]?.id);
    const secondId = String(savedIncomeState.find((entry) => String(entry.id) !== firstId)?.id ?? "");
    assert.ok(secondId.length > 0);
    assert.equal(refreshStatus?.title, "Einnahme gespeichert");
  } finally {
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
    globalThis.document = originalDocument;
  }
});

test("wealth position update stores a new snapshot with inherited balances for untouched positions", async () => {
  const originalDocument = globalThis.document;
  const field = (value: unknown, extra: Record<string, unknown> = {}) => ({
    value,
    dataset: {},
    addEventListener() {},
    ...extra,
  });

  const listLike = () => ({
    innerHTML: "",
    querySelectorAll() {
      return [];
    },
  });

  const elements = new Map<string, Record<string, unknown>>([
    ["wealthSnapshotDate", field("")],
    ["wealthSnapshotCashGiroAmount", field("0", { oninput: null })],
    ["wealthSnapshotCashTradeRepublicAmount", field("0", { oninput: null })],
    ["wealthSnapshotCashScalableAmount", field("0", { oninput: null })],
    ["wealthSnapshotInvestmentAmount", field("0")],
    ["wealthSnapshotCashTotal", field("")],
    ["wealthSnapshotNotes", field("")],
    ["wealthSnapshotMonthStartEnabled", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotMonthStartMonth", field("2026-06", { disabled: true, onchange: null })],
    ["wealthSnapshotFixedExpensesIncluded", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotSalaryIncluded", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotSalaryIncludedForMonth", field("2026-06", { disabled: true, onchange: null })],
    ["wealthSnapshotMusicIncluded", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotMusicIncludedForMonth", field("2026-06", { disabled: true, onchange: null })],
    ["wealthSnapshotMusicThresholdBeforeAmount", field("", { disabled: true, onchange: null })],
    ["wealthSnapshotBasisInvestmentState", field("open")],
    ["wealthSnapshotExtraExpensesIncluded", { checked: false, addEventListener() {} }],
    ["wealthPositionUpdateDate", field("2026-06-15T18:00", { onchange: null })],
    ["wealthPositionUpdateTarget", field("investment", { onchange: null })],
    ["wealthPositionUpdateAmount", field("20500")],
    ["wealthPositionUpdateNotes", field("")],
    ["wealthPositionUpdateQuickTargets", listLike()],
    ["wealthPositionUpdateMeta", { textContent: "" }],
    ["saveWealthPositionUpdateButton", { onclick: null }],
    ["wealthSnapshotMeta", { textContent: "" }],
    ["wealthSnapshotList", listLike()],
    ["wealthSnapshotHistorySummary", { textContent: "" }],
    ["saveWealthSnapshotButton", { dataset: {}, textContent: "Ist-Stand speichern", onclick: null }],
    ["clearWealthSnapshotsButton", { hidden: true, onclick: null }],
  ]);

  globalThis.document = {
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
  } as typeof globalThis.document;

  let savedSnapshots: Record<string, unknown>[] = [
    {
      id: "snapshot-1",
      snapshotDate: "2026-06-14T12:00",
      cashAccounts: { giro: 158, cash: 35, savings: 9745.32 },
      cashAmount: 9938.32,
      investmentAmount: 17899.88,
      monthlyStatus: { basisInvestmentState: "included" },
      isActive: true,
      updatedAt: "2026-06-14T12:00:00.000Z",
    },
  ];
  let refreshStatus: any = null;

  try {
    renderWealthSnapshotPlanner({}, {
      readWealthSnapshots: () => savedSnapshots,
      clearWealthSnapshotsLocal: () => ({ mode: "browser" }),
      localDateTimeInputValue: () => "2026-06-15T18:00",
      monthFromDate: (value: string) => String(value).slice(0, 7),
      currentSelectedMonthKey: () => "2026-06",
      monthReviewRowForMonth: () => ({ safetyBucketEndAmount: 10000, investmentBucketEndAmount: 21000 }),
      wealthSnapshotCashAccounts: (entry: any) => entry?.cashAccounts ?? { giro: 0, cash: 0, savings: 0 },
      wealthSnapshotCashTotal: (entry: any) => Number(entry?.cashAmount ?? 0),
      roundCurrency: (value: number) => Math.round(value * 100) / 100,
      euro: new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }),
      wealthSnapshotsPersistence: "project",
      formatHistoryTimestamp: (value: string) => value,
      formatDisplayDate: (value: string) => value,
      async saveWealthSnapshots(nextState: Record<string, unknown>[]) {
        savedSnapshots = nextState;
        return { mode: "project" };
      },
      async refreshFinanceView(status: any) {
        refreshStatus = status;
      },
      statusDetailForMode: () => "Projektdatei",
      confirmAction: () => true,
    });

    const saveButton = elements.get("saveWealthPositionUpdateButton") as { onclick?: () => Promise<void> };
    await saveButton.onclick?.();

    assert.equal(savedSnapshots.length, 2);
    const latest = savedSnapshots.find((entry) => String(entry.snapshotDate) === "2026-06-15T18:00") as any;
    assert.deepEqual(latest.cashAccounts, { giro: 158, cash: 35, savings: 9745.32 });
    assert.equal(latest.investmentAmount, 20500);
    assert.deepEqual(latest.monthlyStatus, { basisInvestmentState: "included" });
    assert.equal(refreshStatus?.title, "Positions-Istwert gespeichert");
  } finally {
    globalThis.document = originalDocument;
  }
});

test("wealth snapshot history allows deleting a saved snapshot", async () => {
  const originalDocument = globalThis.document;
  const field = (value: unknown, extra: Record<string, unknown> = {}) => ({
    value,
    dataset: {},
    addEventListener() {},
    ...extra,
  });

  let deleteHandler: null | (() => Promise<void>) = null;
  const deleteButton = {
    getAttribute(name: string) {
      return name === "data-wealth-snapshot-delete" ? "snapshot-delete" : null;
    },
    addEventListener(event: string, handler: () => Promise<void>) {
      if (event === "click") {
        deleteHandler = handler;
      }
    },
  };

  const listTarget = {
    innerHTML: "",
    querySelectorAll(selector: string) {
      if (selector === "[data-wealth-snapshot-delete]") {
        return [deleteButton];
      }
      return [];
    },
  };

  const elements = new Map<string, Record<string, unknown>>([
    ["wealthSnapshotDate", field("2026-06-15T18:00")],
    ["wealthSnapshotCashGiroAmount", field("158", { oninput: null })],
    ["wealthSnapshotCashTradeRepublicAmount", field("35", { oninput: null })],
    ["wealthSnapshotCashScalableAmount", field("9745.32", { oninput: null })],
    ["wealthSnapshotInvestmentAmount", field("17899.88")],
    ["wealthSnapshotCashTotal", field("")],
    ["wealthSnapshotNotes", field("")],
    ["wealthSnapshotMonthStartEnabled", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotMonthStartMonth", field("2026-06", { disabled: true, onchange: null })],
    ["wealthSnapshotFixedExpensesIncluded", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotSalaryIncluded", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotSalaryIncludedForMonth", field("2026-06", { disabled: true, onchange: null })],
    ["wealthSnapshotMusicIncluded", { checked: false, onchange: null, addEventListener() {} }],
    ["wealthSnapshotMusicIncludedForMonth", field("2026-06", { disabled: true, onchange: null })],
    ["wealthSnapshotMusicThresholdBeforeAmount", field("", { disabled: true, onchange: null })],
    ["wealthSnapshotBasisInvestmentState", field("open")],
    ["wealthSnapshotExtraExpensesIncluded", { checked: false, addEventListener() {} }],
    ["wealthPositionUpdateDate", field("2026-06-15T18:00", { onchange: null })],
    ["wealthPositionUpdateTarget", field("investment", { onchange: null })],
    ["wealthPositionUpdateAmount", field("20500")],
    ["wealthPositionUpdateNotes", field("")],
    ["wealthPositionUpdateQuickTargets", { innerHTML: "", querySelectorAll() { return []; } }],
    ["wealthPositionUpdateMeta", { textContent: "" }],
    ["saveWealthPositionUpdateButton", { onclick: null }],
    ["wealthSnapshotMeta", { textContent: "" }],
    ["wealthSnapshotList", listTarget],
    ["wealthSnapshotHistorySummary", { textContent: "" }],
    ["saveWealthSnapshotButton", { dataset: {}, textContent: "Ist-Stand speichern", onclick: null }],
    ["clearWealthSnapshotsButton", { hidden: true, onclick: null }],
  ]);

  globalThis.document = {
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
  } as typeof globalThis.document;

  let savedSnapshots: Record<string, unknown>[] = [
    {
      id: "snapshot-delete",
      snapshotDate: "2026-06-15T18:00",
      cashAccounts: { giro: 158, cash: 35, savings: 9745.32 },
      cashAmount: 9938.32,
      investmentAmount: 17899.88,
      isActive: true,
      updatedAt: "2026-06-15T18:00:00.000Z",
    },
  ];
  let refreshStatus: any = null;

  try {
    renderWealthSnapshotPlanner({}, {
      readWealthSnapshots: () => savedSnapshots,
      clearWealthSnapshotsLocal: () => ({ mode: "browser" }),
      localDateTimeInputValue: () => "2026-06-15T18:00",
      monthFromDate: (value: string) => String(value).slice(0, 7),
      currentSelectedMonthKey: () => "2026-06",
      monthReviewRowForMonth: () => ({ safetyBucketEndAmount: 10000, investmentBucketEndAmount: 21000 }),
      wealthSnapshotCashAccounts: (entry: any) => entry?.cashAccounts ?? { giro: 0, cash: 0, savings: 0 },
      wealthSnapshotCashTotal: (entry: any) => Number(entry?.cashAmount ?? 0),
      roundCurrency: (value: number) => Math.round(value * 100) / 100,
      euro: new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }),
      wealthSnapshotsPersistence: "project",
      formatHistoryTimestamp: (value: string) => value,
      formatDisplayDate: (value: string) => value,
      async saveWealthSnapshots(nextState: Record<string, unknown>[]) {
        savedSnapshots = nextState;
        return { mode: "project" };
      },
      async refreshFinanceView(status: any) {
        refreshStatus = status;
      },
      statusDetailForMode: () => "Projektdatei",
      confirmAction: () => true,
    });

    await deleteHandler?.();

    assert.equal(savedSnapshots.length, 0);
    assert.equal(refreshStatus?.title, "Ist-Stand gelöscht");
  } finally {
    globalThis.document = originalDocument;
  }
});

test("validation signals show the monthly Tagesgeld withdrawal need and the no-withdrawal state", () => {
  const originalDocument = globalThis.document;
  const target = { innerHTML: "" };

  globalThis.document = {
    getElementById(id: string) {
      return id === "validationSignals" ? target : null;
    },
  } as typeof globalThis.document;

  try {
    renderValidationSignals(
      { baselineSummary: { deltaToAnchor: 0 } },
      {
        rows: [
          { monthKey: "2026-03", netAfterImportedFlows: 120, consistencySignals: [] },
          {
            monthKey: "2026-04",
            requiredTagesgeldWithdrawalAmount: 245.5,
            requiredTagesgeldWithdrawalDestinationLabel: "Girokonto",
            netAfterImportedFlows: -245.5,
            consistencySignals: [],
          },
        ],
      },
      {
        euro: new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 2,
        }),
        currentMonthKey: "2026-04",
      },
    );

    assert.match(target.innerHTML, /Tagesgeld-Entnahme für den Monatsplan einplanen/);
    assert.match(target.innerHTML, /2026-04 braucht voraussichtlich 245,50/);
    assert.match(target.innerHTML, /Ziel: Girokonto/);
    assert.match(target.innerHTML, /nächste offene Monat ab 2026-04/);

    renderValidationSignals(
      { baselineSummary: { deltaToAnchor: 0 } },
      {
        rows: [
          {
            monthKey: "2023-01",
            requiredTagesgeldWithdrawalAmount: 840.55,
            requiredTagesgeldWithdrawalDestinationLabel: "Girokonto",
            netAfterImportedFlows: -840.55,
            consistencySignals: [],
          },
          {
            monthKey: "2026-05",
            requiredTagesgeldWithdrawalAmount: 120,
            requiredTagesgeldWithdrawalDestinationLabel: "Girokonto",
            netAfterImportedFlows: -120,
            consistencySignals: [],
          },
        ],
      },
      {
        euro: new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 2,
        }),
        currentMonthKey: "2026-05",
      },
    );

    assert.doesNotMatch(target.innerHTML, /2023-01 braucht/);
    assert.match(target.innerHTML, /2026-05 braucht voraussichtlich 120,00/);

    renderValidationSignals(
      { baselineSummary: { deltaToAnchor: 0 } },
      {
        rows: [
          { monthKey: "2026-03", netAfterImportedFlows: 120, consistencySignals: [] },
          { monthKey: "2026-04", netAfterImportedFlows: 0, consistencySignals: [] },
        ],
      },
      {
        euro: new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 2,
        }),
        currentMonthKey: "2026-04",
      },
    );

    assert.match(target.innerHTML, /Keine Tagesgeld-Entnahme für den Monatsplan nötig/);
    assert.match(target.innerHTML, /ohne zusätzliche Entnahme aus dem Tagesgeld/);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("month review surfaces Tagesgeld withdrawal on the monthly planning screen when net flow is negative", () => {
  const originalDocument = globalThis.document;
  const target = { innerHTML: "", className: "" };

  globalThis.document = {
    getElementById(id: string) {
      return id === "monthTagesgeldWithdrawalHint" ? target : null;
    },
  } as typeof globalThis.document;

  const euro = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });

  try {
    renderMonthTagesgeldWithdrawalHint(
      {
        row: {
          monthKey: "2026-04",
          requiredTagesgeldWithdrawalAmount: 245.5,
          requiredTagesgeldWithdrawalDestinationLabel: "CHECK24 Alltag",
          netAfterImportedFlows: -245.5,
        },
      },
      {
        euro,
        roundCurrency,
        escapeHtml,
        giroAccountLabel: "CHECK24 Alltag",
      },
    );

    assert.match(target.innerHTML, /Tagesgeld-Entnahme für den Monatsplan/);
    assert.match(target.innerHTML, /2026-04/);
    assert.match(target.innerHTML, /245,50/);
    assert.match(target.innerHTML, /CHECK24 Alltag/);
    assert.match(target.innerHTML, /Ausgleich des Monatsdefizits/);
    assert.match(target.className, /is-warn/);

    renderMonthTagesgeldWithdrawalHint(
      { row: { monthKey: "2026-03", netAfterImportedFlows: 120 } },
      {
        euro,
        roundCurrency,
        escapeHtml,
        giroAccountLabel: "CHECK24 Alltag",
      },
    );

    assert.match(target.innerHTML, /keine zusätzliche Entnahme aus dem Tagesgeld nötig/i);
    assert.match(target.innerHTML, /Übrig nach allem: 120/);
    assert.match(target.className, /is-ok/);
  } finally {
    globalThis.document = originalDocument;
  }
});
