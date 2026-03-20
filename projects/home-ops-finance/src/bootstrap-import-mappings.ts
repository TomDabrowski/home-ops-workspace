import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ensureFinanceDataDir, financeDataPath } from "./local-config.js";
import type { ImportDraft, ExpenseEntry, IncomeEntry } from "./types.js";

interface MappingStateEntry {
  categoryId: string;
  accountId: string;
  reviewed: boolean;
  updatedAt: string;
}

type MappingState = Record<string, MappingStateEntry>;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function defaultExpenseAccount(entry: ExpenseEntry): string {
  if (entry.expenseType === "debt_payment") {
    return "debt";
  }
  if (entry.expenseType === "annual_reserve") {
    return "savings";
  }
  return "giro";
}

function defaultIncomeAccount(entry: IncomeEntry): string {
  if (entry.kind === "sale" || entry.kind === "refund" || entry.kind === "gift") {
    return "giro";
  }
  if (entry.kind === "music") {
    return "giro";
  }
  return "unknown";
}

function buildDefaultMappings(draft: ImportDraft, existing: MappingState): MappingState {
  const nextState: MappingState = { ...existing };
  const timestamp = new Date().toISOString();

  for (const entry of draft.incomeEntries) {
    nextState[entry.id] = nextState[entry.id] ?? {
      categoryId: entry.incomeStreamId,
      accountId: defaultIncomeAccount(entry),
      reviewed: false,
      updatedAt: timestamp,
    };
  }

  for (const entry of draft.expenseEntries) {
    nextState[entry.id] = nextState[entry.id] ?? {
      categoryId: entry.expenseCategoryId,
      accountId: defaultExpenseAccount(entry),
      reviewed: false,
      updatedAt: timestamp,
    };
  }

  return nextState;
}

function main(): void {
  ensureFinanceDataDir();
  const draftPath = resolve(process.argv[2] ?? financeDataPath("import-draft.json"));
  const mappingPath = resolve(process.argv[3] ?? financeDataPath("import-mappings.json"));

  const draft = readJson<ImportDraft>(draftPath);
  const existing = readJson<MappingState>(mappingPath);
  const merged = buildDefaultMappings(draft, existing);

  writeFileSync(mappingPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(merged).length} import mappings to ${mappingPath}`);
}

main();
