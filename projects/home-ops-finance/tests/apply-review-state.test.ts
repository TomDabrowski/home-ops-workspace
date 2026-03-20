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
});
