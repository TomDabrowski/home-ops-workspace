import test from "node:test";
import assert from "node:assert/strict";

import {
  validateBaselineOverridesPayload,
  ValidationError,
  validateForecastSettingsPayload,
  validateHouseholdItemsPayload,
  validateAllocationActionStatePayload,
  validateImportMappingsPayload,
  validateMonthlyExpenseOverridesPayload,
  validateMonthlyMusicIncomeOverridesPayload,
  validateMusicForecastSettingsPayload,
  validateMusicTaxSettingsPayload,
  validateReconciliationStatePayload,
  validateSalarySettingsPayload,
  validateWealthSnapshotsPayload,
} from "../src/adapters/persistence/json-boundary-validation.ts";

test("accepts monthly music income overrides with month ownership separated from entry date", () => {
  const payload = validateMonthlyMusicIncomeOverridesPayload([
    {
      id: "manual-music-income-1",
      monthKey: "2026-04",
      entryDate: "2026-03-25T18:00",
      amount: 1642.65,
      reserveAmount: 418.86,
      availableAmount: 1223.79,
      accountId: "giro",
      isActive: true,
      notes: "",
      updatedAt: "2026-03-25T19:41:59.526Z",
    },
  ]);

  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);
});

test("rejects malformed monthly music income overrides", () => {
  assert.throws(
    () => validateMonthlyMusicIncomeOverridesPayload([{ id: "", monthKey: "2026-04", entryDate: "bad", amount: -1 }]),
    ValidationError,
  );
});

test("accepts recurring music forecast settings with gültig-ab semantics", () => {
  const payload = validateMusicForecastSettingsPayload([
    {
      id: "music-forecast-1",
      grossAmount: 1300,
      effectiveFrom: "2026-09",
      accountId: "giro",
      isActive: true,
      notes: "",
      updatedAt: "2026-03-29T21:10:00.000Z",
    },
  ]);

  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);
});

test("accepts wealth snapshots in both old and newer saved shapes", () => {
  const payload = validateWealthSnapshotsPayload([
    {
      id: "wealth-snapshot-legacy",
      snapshotDate: "2026-03-22",
      cashAmount: 12684,
      investmentAmount: 9200,
      notes: "",
      isActive: true,
      updatedAt: "2026-03-22T22:10:52.100Z",
    },
    {
      id: "wealth-snapshot-current",
      snapshotDate: "2026-03-25T20:36",
      cashAccounts: {
        giro: 731.89,
        cash: 292.5,
        savings: 10000,
      },
      cashAmount: 11024.39,
      investmentAmount: 9200,
      anchorMonthKey: "2026-04",
      notes: "",
      isActive: true,
      updatedAt: "2026-03-25T19:36:25.000Z",
    },
  ]);

  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 2);
  const snapshots = payload as Array<{ anchorMonthKey?: string }>;
  assert.equal(snapshots[1].anchorMonthKey, "2026-04");
});

test("rejects wealth snapshots without usable cash data", () => {
  assert.throws(
    () => validateWealthSnapshotsPayload([{ id: "broken", snapshotDate: "2026-03-25", investmentAmount: 9200 }]),
    ValidationError,
  );
});

test("accepts allocation action state entries with done markers", () => {
  const payload = validateAllocationActionStatePayload({
    "2026-04|music|2026-03-25T18:00|savings|0.00|1223.79": {
      done: true,
      completedAt: "2026-03-25T20:51:43.000Z",
    },
  });

  assert.equal(payload["2026-04|music|2026-03-25T18:00|savings|0.00|1223.79"]?.done, true);
});

test("rejects malformed allocation action state entries", () => {
  assert.throws(
    () => validateAllocationActionStatePayload({ bad: { done: "yes" } }),
    ValidationError,
  );
});

test("accepts forecast, music tax, and salary workflow payloads", () => {
  const forecast = validateForecastSettingsPayload({
    safetyThreshold: 10000,
    musicThreshold: 10000,
    musicThresholdAccountId: "savings",
    notes: "",
    isActive: true,
    updatedAt: "2026-03-25T20:12:00.000Z",
  });
  const musicTax = validateMusicTaxSettingsPayload({
    quarterlyPrepaymentAmount: 501,
    effectiveFrom: "2026-04",
    notes: "",
    isActive: true,
    updatedAt: "2026-03-25T20:12:00.000Z",
  });
  const salary = validateSalarySettingsPayload([
    {
      id: "salary-1",
      netSalaryAmount: 2800,
      effectiveFrom: "2026-04",
      notes: "",
      isActive: true,
      updatedAt: "2026-03-25T20:12:00.000Z",
    },
  ]);

  assert.equal(forecast.musicThresholdAccountId, "savings");
  assert.equal(musicTax.effectiveFrom, "2026-04");
  assert.equal(Array.isArray(salary), true);
  assert.equal(salary.length, 1);
});

test("accepts baseline, monthly expense, and household payloads", () => {
  const baseline = validateBaselineOverridesPayload([
    {
      id: "baseline-1",
      label: "Spotify",
      amount: 10.99,
      effectiveFrom: "2026-04",
      category: "fixed",
      cadence: "monthly",
      notes: "",
      isActive: true,
      updatedAt: "2026-03-25T20:12:00.000Z",
    },
  ]);
  const expenses = validateMonthlyExpenseOverridesPayload([
    {
      id: "manual-expense-1",
      monthKey: "2026-04",
      entryDate: "2026-04-02T10:30",
      description: "Steuerberatung",
      amount: 120,
      expenseCategoryId: "tax",
      accountId: "giro",
      expenseType: "variable",
      notes: "",
      isActive: true,
      updatedAt: "2026-03-25T20:12:00.000Z",
    },
  ]);
  const household = validateHouseholdItemsPayload({
    items: [
      {
        id: "household-1",
        name: "Laptop",
        area: "music",
        estimatedValue: 1500,
        notes: "",
        isActive: true,
        updatedAt: "2026-03-25T20:12:00.000Z",
      },
    ],
    insuranceCoverageAmount: 10000,
    insuranceCoverageLabel: "Haftpflicht",
    updatedAt: "2026-03-25T20:12:00.000Z",
  });

  assert.equal(Array.isArray(baseline), true);
  assert.equal(Array.isArray(expenses), true);
  const householdItems = household.items as unknown[];
  assert.equal(Array.isArray(householdItems), true);
  assert.equal(householdItems.length, 1);
});

test("rejects malformed forecast-adjacent workflow payloads", () => {
  assert.throws(
    () => validateForecastSettingsPayload({ safetyThreshold: -1, musicThreshold: 10000 }),
    ValidationError,
  );
  assert.throws(
    () => validateSalarySettingsPayload([{ id: "salary-1", netSalaryAmount: 2800, effectiveFrom: "April" }]),
    ValidationError,
  );
  assert.throws(
    () => validateHouseholdItemsPayload({ items: [{ id: "1", name: "", area: "other", estimatedValue: -1 }] }),
    ValidationError,
  );
});

test("accepts reconciliation and import mapping payloads", () => {
  const reconciliation = validateReconciliationStatePayload({
    "2026-04": {
      status: "in_progress",
      note: "Monat wird geprüft",
      actions: [
        {
          code: "monthly_deficit",
          label: "Minus prüfen",
          done: false,
          suggestion: "Monat kurz prüfen",
        },
      ],
      updatedAt: "2026-03-25T20:12:00.000Z",
    },
  });
  const mappings = validateImportMappingsPayload({
    "income-1": {
      categoryId: "music",
      accountId: "giro",
      reviewed: true,
      updatedAt: "2026-03-25T20:12:00.000Z",
    },
  });

  assert.equal(typeof reconciliation["2026-04"], "object");
  assert.equal(typeof mappings["income-1"], "object");
});

test("rejects malformed reconciliation and import mapping payloads", () => {
  assert.throws(
    () => validateReconciliationStatePayload({ "2026-04": { status: "done", note: "", actions: [] } }),
    ValidationError,
  );
  assert.throws(
    () => validateImportMappingsPayload({ "income-1": { categoryId: "", accountId: "giro", reviewed: true } }),
    ValidationError,
  );
});
