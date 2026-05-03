import test from "node:test";
import assert from "node:assert/strict";

import type { ImportDraft } from "../src/types.ts";
import {
  removeImportedDraftEntryById,
  type ImportDraftRemovalBlocklists,
} from "../src/import-draft-entry-removal.ts";

const stubDraft = {
  source: "xlsx",
  workbookPath: "",
  sheets: [],
  forecastAssumptions: [],
  monthlyBaselines: [],
  baselineLineItems: [],
  incomeStreams: [],
  incomeEntries: [{ id: "inc-1", incomeStreamId: "salary-main", entryDate: "2025-01-15", amount: 100 }],
  expenseCategories: [],
  expenseEntries: [{ id: "exp-1", entryDate: "2025-01-10", description: "Steuer", amount: 50 }],
  wealthBuckets: [],
  forecastWealthAnchors: [],
  debtAccounts: [],
  debtSnapshots: [],
} as ImportDraft;

const emptyBlocks: ImportDraftRemovalBlocklists = {
  activeManualExpenseIds: new Set(),
  activeManualMusicIncomeIds: new Set(),
};

test("removeImportedDraftEntryById removes a single imported expense row", () => {
  const result = removeImportedDraftEntryById(stubDraft, "expense", "exp-1", emptyBlocks);

  assert.equal(result.ok, true);

  assert.ok(Array.isArray(result.draft.expenseEntries));
  assert.deepEqual(result.draft.expenseEntries.map((entry) => entry.id), []);

  assert.ok(Array.isArray(result.draft.incomeEntries));
  assert.deepEqual(result.draft.incomeEntries.map((entry) => entry.id), ["inc-1"]);
});

test("removeImportedDraftEntryById rejects manual-expense overrides", () => {
  const blocked: ImportDraftRemovalBlocklists = {
    activeManualExpenseIds: new Set(["exp-1"]),
    activeManualMusicIncomeIds: new Set(),
  };
  const result = removeImportedDraftEntryById(stubDraft, "expense", "exp-1", blocked);

  assert.equal(result.ok, false);
  assert.equal(result.error, "entry_is_manual_override");
});

test("removeImportedDraftEntryById rejects blocked music/manual income overrides", () => {
  const blocked: ImportDraftRemovalBlocklists = {
    activeManualExpenseIds: new Set(),
    activeManualMusicIncomeIds: new Set(["inc-1"]),
  };

  const result = removeImportedDraftEntryById(stubDraft, "income", "inc-1", blocked);

  assert.equal(result.ok, false);
  assert.equal(result.error, "entry_is_manual_override");
});

test("removeImportedDraftEntryById reports missing ids", () => {
  const result = removeImportedDraftEntryById(stubDraft, "income", "missing-id", emptyBlocks);

  assert.equal(result.ok, false);
  assert.equal(result.error, "entry_not_found");
});
