// Browser-owned review workflow state. This keeps reconciliation defaults and
// mapping persistence out of app.js so the shell can stay focused on wiring.

export function createReviewStateTools({
  readReconciliationState,
  readMappingState,
  writeMappingState,
  saveMappingState,
}) {
  function suggestionForSignal(signal) {
    if (signal.code === "baseline_anchor_mismatch") {
      return "Grundplan-Posten und Monatswerte fuer diesen Monat gemeinsam pruefen.";
    }
    if (signal.code === "baseline_deficit") {
      return "Grundplan pruefen: Basis-Investment, variable Basis und Fixkosten wirken fuer diesen Monat zu hoch.";
    }
    if (signal.code === "monthly_deficit") {
      return "Einzelne Bewegungen und fehlende Zufluesse im Defizitmonat gemeinsam pruefen.";
    }
    if (signal.code === "expense_over_baseline_available") {
      return "Ausgaben pruefen und entscheiden, ob sie in den Grundplan, die Ruecklage oder nur als Einzelereignis gehoeren.";
    }
    if (signal.code === "expense_spike") {
      return "Ausgabenspitze auf Sonderfall, falsche Zuordnung oder fehlende Gegenbuchung pruefen.";
    }

    return "Monat kurz manuell pruefen.";
  }

  function defaultReconciliationForMonth(row) {
    return {
      status: row.consistencySignals.some((signal) => signal.severity === "warn") ? "open" : "resolved",
      note: "",
      actions: row.consistencySignals.map((signal) => ({
        code: signal.code,
        label: signal.title,
        done: false,
        suggestion: suggestionForSignal(signal),
      })),
      updatedAt: null,
    };
  }

  function reconciliationForMonth(row) {
    const state = readReconciliationState();
    const saved = state[row.monthKey];
    if (!saved) {
      return defaultReconciliationForMonth(row);
    }

    const defaults = defaultReconciliationForMonth(row);
    const savedActions = new Map((saved.actions ?? []).map((action) => [action.code, action]));
    return {
      status: saved.status ?? defaults.status,
      note: saved.note ?? "",
      actions: defaults.actions.map((action) => {
        const existing = savedActions.get(action.code);
        return existing
          ? { ...action, done: Boolean(existing.done) }
          : action;
      }),
      updatedAt: saved.updatedAt ?? null,
    };
  }

  function defaultExpenseAccount(entry) {
    if (entry.expenseType === "debt_payment") {
      return "debt";
    }
    if (entry.expenseType === "annual_reserve") {
      return "business";
    }
    if (entry.expenseCategoryId === "gear" || entry.expenseCategoryId === "tax") {
      return "business";
    }
    return "giro";
  }

  function defaultIncomeAccount(entry) {
    if (entry.kind === "sale" || entry.kind === "refund" || entry.kind === "gift") {
      return "giro";
    }
    if (entry.kind === "music") {
      return "giro";
    }
    return "unknown";
  }

  function defaultIncomeMapping(entry) {
    return {
      categoryId: entry.incomeStreamId,
      accountId: defaultIncomeAccount(entry),
      reviewed: false,
    };
  }

  function defaultExpenseMapping(entry) {
    return {
      categoryId: entry.expenseCategoryId,
      accountId: defaultExpenseAccount(entry),
      reviewed: false,
    };
  }

  function incomeMappingForEntry(entry) {
    const state = readMappingState();
    return state[entry.id] ?? defaultIncomeMapping(entry);
  }

  function expenseMappingForEntry(entry) {
    const state = readMappingState();
    return state[entry.id] ?? defaultExpenseMapping(entry);
  }

  async function saveMappings(entries) {
    const state = readMappingState();

    for (const entry of entries) {
      const categoryField = document.querySelector(`[data-mapping-category="${entry.id}"]`);
      const accountField = document.querySelector(`[data-mapping-account="${entry.id}"]`);
      const reviewedField = document.querySelector(`[data-mapping-reviewed="${entry.id}"]`);

      state[entry.id] = {
        ...(state[entry.id] ?? {}),
        categoryId: categoryField?.value ?? "",
        accountId: accountField?.value ?? "unknown",
        reviewed: Boolean(reviewedField?.checked),
        updatedAt: new Date().toISOString(),
      };
    }

    writeMappingState(state);
    return saveMappingState(state);
  }

  async function saveImportedIncomeMappingCorrection(entry, values) {
    const state = readMappingState();
    const base = incomeMappingForEntry(entry);
    state[entry.id] = {
      ...(state[entry.id] ?? {}),
      categoryId: values.incomeStreamId ?? base.categoryId ?? entry.incomeStreamId,
      accountId: values.accountId ?? base.accountId ?? entry.accountId ?? "giro",
      amount: values.amount,
      entryDate: values.entryDate,
      notes: values.notes,
      reviewed: true,
      updatedAt: new Date().toISOString(),
    };
    writeMappingState(state);
    return saveMappingState(state);
  }

  async function saveImportedExpenseMappingCorrection(entry, values) {
    const state = readMappingState();
    const base = expenseMappingForEntry(entry);
    state[entry.id] = {
      ...(state[entry.id] ?? {}),
      categoryId: values.expenseCategoryId ?? base.categoryId ?? entry.expenseCategoryId,
      accountId: values.accountId ?? base.accountId ?? entry.accountId ?? "giro",
      amount: values.amount,
      entryDate: values.entryDate,
      description: values.description,
      notes: values.notes,
      reviewed: true,
      updatedAt: new Date().toISOString(),
    };
    writeMappingState(state);
    return saveMappingState(state);
  }

  return {
    reconciliationForMonth,
    incomeMappingForEntry,
    expenseMappingForEntry,
    saveMappings,
    saveImportedIncomeMappingCorrection,
    saveImportedExpenseMappingCorrection,
  };
}
