// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import { createMonthReviewDataTools } from "../app/shared/month-review-data.js";
import { buildMusicYearData } from "../app/ui/music-workspace.js";

test("musicIncomeProfileForMonth computes tax data without missing buildMusicYearData deps", () => {
  const draft = {
    incomeEntries: [
      {
        id: "music-2026-03",
        incomeStreamId: "music-income",
        entryDate: "2026-03-10",
        amount: 1000,
        reserveAmount: 200,
        availableAmount: 800,
      },
    ],
    expenseEntries: [],
  };
  const monthlyPlan = {
    rows: [
      {
        monthKey: "2026-03",
        netSalaryAmount: 3000,
      },
    ],
  };

  const tools = createMonthReviewDataTools({
    currentMonthlyPlan: () => monthlyPlan,
    monthlyPlanFromImportDraft: (_importDraft, plan) => plan,
    activeBaselineLineItemsForMonth: () => [],
    uniqueMonthKeys: (incomeEntries, expenseEntries) =>
      [...new Set([...incomeEntries, ...expenseEntries].map((entry) => String(entry.entryDate).slice(0, 7)))],
    compareMonthKeys: (left, right) => left.localeCompare(right),
    incomeMonthKey: (entry) => String(entry.entryDate).slice(0, 7),
    roundCurrency: (value) => Math.round(value * 100) / 100,
    readMonthlyExpenseOverrides: () => [],
    readMonthlyMusicIncomeOverrides: () => [],
    buildMusicYearData,
    monthFromDate: (date) => String(date).slice(0, 7),
    euro: new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }),
  });

  const profile = tools.musicIncomeProfileForMonth(draft, "2026-03");

  assert.equal(typeof profile.reserveRate, "number");
  assert.ok(Number.isFinite(profile.reserveRate));
});

test("expenseWarningsForInput evaluates duplicates and month budget for the entered date month", () => {
  const draft = {
    incomeEntries: [],
    expenseEntries: [
      {
        id: "imported-april-ticket",
        entryDate: "2026-04-10",
        description: "Konzertticket",
        amount: 50,
      },
    ],
  };
  const monthlyPlan = {
    rows: [
      {
        monthKey: "2026-03",
        baselineAvailableAmount: 20,
      },
      {
        monthKey: "2026-04",
        baselineAvailableAmount: 40,
      },
    ],
  };

  const tools = createMonthReviewDataTools({
    currentMonthlyPlan: () => monthlyPlan,
    monthlyPlanFromImportDraft: (_importDraft, plan) => plan,
    activeBaselineLineItemsForMonth: () => [],
    uniqueMonthKeys: () => [],
    compareMonthKeys: (left, right) => left.localeCompare(right),
    incomeMonthKey: (entry) => String(entry.entryDate).slice(0, 7),
    roundCurrency: (value) => Math.round(value * 100) / 100,
    readMonthlyExpenseOverrides: () => [],
    readMonthlyMusicIncomeOverrides: () => [],
    buildMusicYearData,
    monthFromDate: (date) => String(date).slice(0, 7),
    euro: new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }),
  });

  const warnings = tools.expenseWarningsForInput(draft, "2026-03", {
    description: "Konzertticket",
    amount: "50",
    entryDate: "2026-04-14",
    categoryId: "other",
    accountId: "giro",
  });

  assert.equal(warnings.some((item) => item.title === "Sieht nach doppeltem Eintrag aus"), true);
  assert.equal(warnings.some((item) => item.title === "Datum liegt in einem anderen Monat"), true);
  assert.equal(warnings.some((item) => item.title === "Ausgabe liegt über der freien Monatsbasis"), true);
  assert.equal(warnings.some((item) => String(item.detail).includes("40,00")), true);
});
