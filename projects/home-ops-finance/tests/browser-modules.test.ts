import test from "node:test";
import assert from "node:assert/strict";

// These browser modules are plain JS on purpose; the test only needs runtime behavior.
// @ts-ignore
import { createPlannerSettingsStore } from "../app/browser/planner-settings.js";
// @ts-ignore
import { createReviewStateTools } from "../app/browser/review-state.js";

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
