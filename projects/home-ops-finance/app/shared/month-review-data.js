// Shared month-review data preparation and validations. This stays DOM-free so
// the app shell and review UIs can reuse the same month-scoped logic.

export function createMonthReviewDataTools(deps) {
  const {
    currentMonthlyPlan,
    monthlyPlanFromImportDraft,
    activeBaselineLineItemsForMonth,
    incomeMonthKey,
    roundCurrency,
    readMonthlyExpenseOverrides,
    readMonthlyMusicIncomeOverrides,
    buildMusicYearData,
    monthFromDate,
    euro,
  } = deps;

  function monthReviewRowForMonth(monthKey) {
    if (!monthKey) {
      return null;
    }

    const monthlyPlan = currentMonthlyPlan();
    if (!monthlyPlan || !Array.isArray(monthlyPlan.rows)) {
      return null;
    }

    return monthlyPlan.rows.find((row) => row.monthKey === monthKey) ?? null;
  }

  function buildMonthReviewData(importDraft, monthlyPlan, monthKey) {
    const resolvedPlan = monthlyPlanFromImportDraft(importDraft, monthlyPlan);
    const row = resolvedPlan.rows.find((item) => item.monthKey === monthKey);
    if (!row) return null;

    return {
      row,
      baselineLineItems: activeBaselineLineItemsForMonth(importDraft, monthKey),
      incomeEntries: importDraft.incomeEntries.filter((entry) => incomeMonthKey(entry) === monthKey),
      expenseEntries: importDraft.expenseEntries.filter((entry) => entry.entryDate.slice(0, 7) === monthKey),
    };
  }

  function manualExpensesForMonth(monthKey) {
    return readMonthlyExpenseOverrides()
      .filter((entry) => entry.monthKey === monthKey && entry.isActive !== false)
      .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
  }

  function manualMusicIncomeOverridesForMonth(monthKey) {
    return readMonthlyMusicIncomeOverrides()
      .filter((entry) => entry.monthKey === monthKey && entry.isActive !== false)
      .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
  }

  function musicIncomeEntryForMonth(importDraft, monthKey) {
    const exact = importDraft.incomeEntries.find((entry) => entry.incomeStreamId === "music-income" && incomeMonthKey(entry) === monthKey);
    if (exact) {
      return exact;
    }

    const all = importDraft.incomeEntries
      .filter((entry) => entry.incomeStreamId === "music-income")
      .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
    const latestBefore = [...all].reverse().find((entry) => incomeMonthKey(entry) <= monthKey);
    return latestBefore ?? all[0] ?? null;
  }

  function musicIncomeProfileForMonth(importDraft, monthKey) {
    const source = musicIncomeEntryForMonth(importDraft, monthKey);
    const gross = Number(source?.amount ?? 0);
    const reserve = Number(source?.reserveAmount ?? 0);
    const fallbackReserveRatio = gross > 0 ? reserve / gross : 0;
    const monthlyPlan = currentMonthlyPlan();
    const yearTaxData = monthlyPlan ? buildMusicYearData(importDraft, monthlyPlan, monthKey) : null;
    const reserveRate = Number(yearTaxData?.effectiveRate ?? fallbackReserveRatio);

    return {
      source,
      reserveRate,
      reserveAmountForGross(amount) {
        return roundCurrency(Math.max(0, amount * reserveRate));
      },
      availableAmountForGross(amount) {
        return roundCurrency(amount - Math.max(0, amount * reserveRate));
      },
    };
  }

  function isManualExpenseEntry(entry) {
    return readMonthlyExpenseOverrides().some((item) => item.id === entry.id && item.isActive !== false);
  }

  function isManualMusicIncomeEntry(entry) {
    return readMonthlyMusicIncomeOverrides().some((item) => item.id === entry.id && item.isActive !== false);
  }

  function unifiedEntrySourceLabel(entry, kind) {
    if (kind === "income") {
      return isManualMusicIncomeEntry(entry) ? "Istwert" : "Import";
    }

    return isManualExpenseEntry(entry) ? "Manuell" : "Import";
  }

  function expenseWarningsForInput(importDraft, monthKey, draftValue, editingId = "") {
    const warnings = [];
    const description = draftValue.description.trim();
    const amount = Number(draftValue.amount);
    const entryMonthKey = monthFromDate(draftValue.entryDate || `${monthKey}-01`);
    const normalizedDescription = description.toLowerCase();
    const review = buildMonthReviewData(importDraft, currentMonthlyPlan(), monthKey);
    const allMonthExpenses = review?.expenseEntries ?? [];

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      return warnings;
    }

    const duplicates = allMonthExpenses.filter((entry) =>
      entry.id !== editingId &&
      entry.description.trim().toLowerCase() === normalizedDescription &&
      Math.abs(Number(entry.amount) - amount) < 0.01,
    );
    if (duplicates.length > 0) {
      warnings.push({
        severity: "warn",
        title: "Sieht nach doppeltem Eintrag aus",
        detail: `Im Monat gibt es bereits ${duplicates.length} ähnliche Ausgabe(n) mit gleicher Beschreibung und gleichem Betrag.`,
      });
    }

    if (entryMonthKey !== monthKey) {
      warnings.push({
        severity: "info",
        title: "Datum liegt in einem anderen Monat",
        detail: `Die Ausgabe wird unter ${entryMonthKey} gespeichert, nicht unter ${monthKey}.`,
      });
    }

    if ((review?.row?.baselineAvailableAmount ?? 0) > 0 && amount > (review?.row?.baselineAvailableAmount ?? 0)) {
      warnings.push({
        severity: "warn",
        title: "Ausgabe liegt über der freien Monatsbasis",
        detail: `Der Betrag ${euro.format(amount)} ist größer als die freie Basis von ${euro.format(review?.row?.baselineAvailableAmount ?? 0)}.`,
      });
    }

    if (/(musik|mix|master|spotify|distro|cover|gvl|gema|instrument|equipment|gear)/i.test(description) && draftValue.categoryId !== "gear") {
      warnings.push({
        severity: "info",
        title: "Klingt nach musiknaher Ausgabe",
        detail: "Prüf kurz, ob die Kategorie `Gear` oder das Business-Konto besser passt. Dann taucht die Ausgabe sauber im Musik-Reiter auf.",
      });
    }

    if (/steuer|vorauszahlung|finanzamt/i.test(description) && draftValue.categoryId !== "tax") {
      warnings.push({
        severity: "info",
        title: "Klingt nach Steuerzahlung",
        detail: "Wenn das eine Musik-Steuervorauszahlung ist, passt die Kategorie `Steuern` besser in die Musik-Auswertung.",
      });
    }

    return warnings;
  }

  return {
    monthReviewRowForMonth,
    buildMonthReviewData,
    manualExpensesForMonth,
    manualMusicIncomeOverridesForMonth,
    musicIncomeProfileForMonth,
    isManualExpenseEntry,
    isManualMusicIncomeEntry,
    unifiedEntrySourceLabel,
    expenseWarningsForInput,
  };
}
