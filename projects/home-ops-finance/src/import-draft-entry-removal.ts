import type { ImportDraft } from "./types.js";

export type ImportDraftRemoveKind = "income" | "expense";

/** Matches server-visible manual override rows — those must not be removed as “imports”. */
export interface ImportDraftRemovalBlocklists {
  activeManualExpenseIds: ReadonlySet<string>;
  activeManualMusicIncomeIds: ReadonlySet<string>;
}

function sortExpenseEntries(entries: ImportDraft["expenseEntries"]): ImportDraft["expenseEntries"] {
  return [...entries].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));
}

function sortIncomeEntries(entries: ImportDraft["incomeEntries"]): ImportDraft["incomeEntries"] {
  return [...entries].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));
}

export function removeImportedDraftEntryById(
  draft: ImportDraft,
  kind: ImportDraftRemoveKind,
  entryId: string,
  blocks: ImportDraftRemovalBlocklists,
): { ok: true; draft: ImportDraft } | { ok: false; error: string } {
  if (!entryId || typeof entryId !== "string") {
    return { ok: false, error: "invalid_entry_id" };
  }

  if (kind === "expense") {
    if (blocks.activeManualExpenseIds.has(entryId)) {
      return { ok: false, error: "entry_is_manual_override" };
    }
    const before = draft.expenseEntries ?? [];
    const removed = before.filter((entry) => entry.id !== entryId);
    if (removed.length === before.length) {
      return { ok: false, error: "entry_not_found" };
    }

    return {
      ok: true,
      draft: {
        ...draft,
        expenseEntries: sortExpenseEntries(removed),
      },
    };
  }

  if (blocks.activeManualMusicIncomeIds.has(entryId)) {
    return { ok: false, error: "entry_is_manual_override" };
  }

  const beforeIncome = draft.incomeEntries ?? [];
  const removedIncome = beforeIncome.filter((entry) => entry.id !== entryId);
  if (removedIncome.length === beforeIncome.length) {
    return { ok: false, error: "entry_not_found" };
  }

  return {
    ok: true,
    draft: {
      ...draft,
      incomeEntries: sortIncomeEntries(removedIncome),
    },
  };
}
