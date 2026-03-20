import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ImportDraft } from "./types.js";

interface EntryMappingState {
  categoryId?: string;
  accountId?: string;
  reviewed?: boolean;
  updatedAt?: string;
}

interface ReconciliationActionState {
  code: string;
  label: string;
  done: boolean;
  suggestion?: string;
}

interface ReconciliationMonthState {
  status?: "open" | "in_progress" | "resolved";
  note?: string;
  actions?: ReconciliationActionState[];
  updatedAt?: string;
}

interface BaselineOverrideState {
  id: string;
  label: string;
  amount: number;
  effectiveFrom: string;
  sourceLineItemId?: string;
  category?: "fixed";
  cadence?: "monthly";
  isActive?: boolean;
  notes?: string;
  updatedAt?: string;
}

type MappingState = Record<string, EntryMappingState>;
type ReconciliationState = Record<string, ReconciliationMonthState>;
type BaselineOverrideCollection = BaselineOverrideState[];

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function mergeNotes(original: string | undefined, additions: string[]): string | undefined {
  const parts = [original, ...additions].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

export function applyReviewState(
  draft: ImportDraft,
  mappings: MappingState,
  reconciliation: ReconciliationState,
  baselineOverrides: BaselineOverrideCollection = [],
): ImportDraft {
  const expenseCategoryById = new Map(draft.expenseCategories.map((category) => [category.id, category]));
  const activeBaselineOverrides = baselineOverrides
    .filter((entry) => entry.isActive !== false)
    .map((entry) => ({
      id: entry.sourceLineItemId ?? entry.id,
      label: entry.label,
      amount: entry.amount,
      category: entry.category ?? "fixed",
      cadence: entry.cadence ?? "monthly",
      effectiveFrom: entry.effectiveFrom,
      notes: mergeNotes(entry.notes, [
        entry.updatedAt ? `custom fixed cost ${entry.updatedAt}` : "custom fixed cost",
      ]),
    }));

  return {
    ...draft,
    baselineLineItems: [...draft.baselineLineItems, ...activeBaselineOverrides],
    incomeEntries: draft.incomeEntries.map((entry) => {
      const mapping = mappings[entry.id];
      if (!mapping?.reviewed) {
        return entry;
      }

      return {
        ...entry,
        incomeStreamId: mapping.categoryId ?? entry.incomeStreamId,
        accountId: mapping.accountId ?? entry.accountId,
        notes: mergeNotes(entry.notes, [
          mapping.updatedAt ? `reviewed ${mapping.updatedAt}` : "reviewed",
        ]),
      };
    }),
    expenseEntries: draft.expenseEntries.map((entry) => {
      const mapping = mappings[entry.id];
      const monthKey = entry.entryDate.slice(0, 7);
      const monthReview = reconciliation[monthKey];
      const reviewedExpenseType = mapping?.categoryId
        ? expenseCategoryById.get(mapping.categoryId)?.expenseType
        : undefined;

      return {
        ...entry,
        expenseCategoryId: mapping?.reviewed && mapping.categoryId ? mapping.categoryId : entry.expenseCategoryId,
        accountId: mapping?.reviewed ? (mapping.accountId ?? entry.accountId) : entry.accountId,
        expenseType: mapping?.reviewed && reviewedExpenseType ? reviewedExpenseType : entry.expenseType,
        notes: mergeNotes(entry.notes, [
          mapping?.reviewed ? (mapping.updatedAt ? `reviewed ${mapping.updatedAt}` : "reviewed") : "",
          monthReview?.status ? `reconciliation ${monthReview.status}` : "",
          monthReview?.note ? `month note: ${monthReview.note}` : "",
        ]),
      };
    }),
  };
}

function main(): void {
  const inputPath = resolve(process.argv[2] ?? "data/import-draft.json");
  const mappingPath = resolve(process.argv[3] ?? "data/import-mappings.json");
  const reconciliationPath = resolve(process.argv[4] ?? "data/reconciliation-state.json");
  const baselineOverridesPath = resolve(process.argv[5] ?? "data/baseline-overrides.json");
  const outputPath = resolve(process.argv[6] ?? "data/import-draft-reviewed.json");

  if (!existsSync(inputPath)) {
    console.log(`Skipped reviewed draft generation because no import draft exists at ${inputPath}`);
    return;
  }

  const draft = readJsonFile<ImportDraft>(inputPath, {} as ImportDraft);
  const mappings = readJsonFile<MappingState>(mappingPath, {});
  const reconciliation = readJsonFile<ReconciliationState>(reconciliationPath, {});
  const baselineOverrides = readJsonFile<BaselineOverrideCollection>(baselineOverridesPath, []);

  const reviewedDraft = applyReviewState(draft, mappings, reconciliation, baselineOverrides);
  writeFileSync(outputPath, JSON.stringify(reviewedDraft, null, 2) + "\n", "utf8");

  console.log(`Wrote reviewed import draft to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
