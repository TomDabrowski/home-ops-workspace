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
