import test from "node:test";
import assert from "node:assert/strict";

import { applyReviewState } from "../src/apply-review-state.ts";
import type { ImportDraft } from "../src/types.js";

function createDraft(): ImportDraft {
  return {
    source: "xlsx",
    workbookPath: "/tmp/example.xlsx",
    sheets: [],
    forecastAssumptions: [],
    monthlyBaselines: [],
    baselineLineItems: [],
    incomeStreams: [
      { id: "music-income", name: "Music", category: "music", isVariable: true, isActive: true },
      { id: "misc-inflows", name: "Misc", category: "other", isVariable: true, isActive: true },
    ],
    incomeEntries: [
      {
        id: "income-1",
        incomeStreamId: "music-income",
        entryDate: "2026-03-01",
        amount: 500,
        kind: "music",
        isRecurring: false,
        isPlanned: true,
      },
    ],
    expenseCategories: [
      { id: "food", name: "Food", groupName: "food", expenseType: "variable", isActive: true },
      { id: "debt", name: "Debt", groupName: "debt", expenseType: "debt_payment", isActive: true },
    ],
    expenseEntries: [
      {
        id: "expense-1",
        entryDate: "2026-03-02",
        description: "Card payment",
        amount: 120,
        expenseCategoryId: "food",
        expenseType: "variable",
        isRecurring: false,
        isPlanned: true,
      },
    ],
    wealthBuckets: [],
    forecastWealthAnchors: [],
    debtAccounts: [],
    debtSnapshots: [],
  };
}

test("applies reviewed entry mappings and month reconciliation to the draft", () => {
  const reviewed = applyReviewState(
    createDraft(),
    {
      "income-1": {
        categoryId: "misc-inflows",
        accountId: "giro",
        reviewed: true,
        updatedAt: "2026-03-20T09:00:00.000Z",
      },
      "expense-1": {
        categoryId: "debt",
        accountId: "debt",
        reviewed: true,
        updatedAt: "2026-03-20T09:01:00.000Z",
      },
    },
    {
      "2026-03": {
        status: "resolved",
        note: "Matched to debt payment",
      },
    },
    [
      {
        id: "fixed-new-gym",
        label: "Gym",
        amount: 49,
        effectiveFrom: "2026-05",
        sourceLineItemId: "rent",
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
    ],
    [
      {
        id: "manual-expense-1",
        monthKey: "2026-03",
        entryDate: "2026-03-18",
        description: "Train ticket",
        amount: 35,
        expenseCategoryId: "food",
        accountId: "giro",
        updatedAt: "2026-03-20T10:05:00.000Z",
      },
    ],
  );

  assert.equal(reviewed.incomeEntries[0]?.incomeStreamId, "misc-inflows");
  assert.equal(reviewed.incomeEntries[0]?.accountId, "giro");
  assert.match(reviewed.incomeEntries[0]?.notes ?? "", /reviewed/);

  assert.equal(reviewed.expenseEntries[0]?.expenseCategoryId, "debt");
  assert.equal(reviewed.expenseEntries[0]?.expenseType, "debt_payment");
  assert.equal(reviewed.expenseEntries[0]?.accountId, "debt");
  assert.match(reviewed.expenseEntries[0]?.notes ?? "", /reconciliation resolved/);
  assert.equal(reviewed.baselineLineItems[0]?.id, "rent");
  assert.equal(reviewed.baselineLineItems[0]?.label, "Gym");
  assert.equal(reviewed.baselineLineItems[0]?.effectiveFrom, "2026-05");
  assert.equal(reviewed.baselineLineItems[0]?.category, "fixed");
  assert.equal(reviewed.expenseEntries[1]?.description, "Train ticket");
  assert.equal(reviewed.expenseEntries[1]?.amount, 35);
});

test("manual music income keeps only the latest active value per month", () => {
  const reviewed = applyReviewState(
    createDraft(),
    {},
    {},
    [],
    [],
    [
      {
        id: "manual-music-income-old",
        monthKey: "2026-03",
        entryDate: "2026-03-01T12:00",
        amount: 800,
        reserveAmount: 0,
        availableAmount: 800,
        accountId: "giro",
        isActive: true,
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
      {
        id: "manual-music-income-new",
        monthKey: "2026-03",
        entryDate: "2026-03-02T12:00",
        amount: 1300,
        reserveAmount: 0,
        availableAmount: 1300,
        accountId: "giro",
        isActive: true,
        updatedAt: "2026-03-21T10:00:00.000Z",
      },
    ],
  );

  const musicEntries = reviewed.incomeEntries.filter((entry) => entry.incomeStreamId === "music-income");
  assert.equal(musicEntries.length, 1);
  assert.equal(musicEntries[0]?.amount, 1300);
  assert.equal(musicEntries[0]?.availableAmount, 1300);
  assert.equal(musicEntries[0]?.reserveAmount, 0);
});

test("applies import mapping field overrides without requiring reviewed for amounts", () => {
  const draft = createDraft();
  const reviewed = applyReviewState(
    draft,
    {
      "income-1": {
        categoryId: "music-income",
        accountId: "giro",
        reviewed: false,
        amount: 400,
        entryDate: "2026-03-05T10:00:00",
        notes: "Korrigiert",
        updatedAt: "2026-03-21T09:00:00.000Z",
      },
      "expense-1": {
        categoryId: "debt",
        accountId: "debt",
        reviewed: false,
        amount: 99,
        entryDate: "2026-03-10",
        description: "Korrigierte Beschreibung",
        notes: "Fix",
        updatedAt: "2026-03-21T09:01:00.000Z",
      },
    },
    {},
  );

  assert.equal(reviewed.incomeEntries[0]?.amount, 400);
  assert.equal(reviewed.incomeEntries[0]?.entryDate, "2026-03-05T10:00:00");
  assert.equal(reviewed.incomeEntries[0]?.notes, "Korrigiert");
  assert.equal(reviewed.incomeEntries[0]?.incomeStreamId, "music-income");

  assert.equal(reviewed.expenseEntries[0]?.amount, 99);
  assert.equal(reviewed.expenseEntries[0]?.entryDate, "2026-03-10");
  assert.equal(reviewed.expenseEntries[0]?.description, "Korrigierte Beschreibung");
  assert.equal(reviewed.expenseEntries[0]?.notes, "Fix");
  assert.equal(reviewed.expenseEntries[0]?.expenseCategoryId, "food");
  assert.equal(reviewed.expenseEntries[0]?.expenseType, "variable");
});
