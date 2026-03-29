// UI workflow surfaces live here so app.js can stay focused on wiring the app
// together. Domain calculations should still come from shared core modules.

function bindAutoNote(notesField, buildSuggestion, watchTargets = []) {
  if (!notesField) {
    return { refresh() {}, setManualValue() {} };
  }

  const normalize = (value) => String(value ?? "").trim();

  function refresh(force = false) {
    const suggestion = normalize(buildSuggestion());
    const current = normalize(notesField.value);
    const lastAuto = normalize(notesField.dataset.lastAutoNote);
    const autoEnabled = notesField.dataset.autoNoteManaged !== "false";

    if (force || autoEnabled || !current || current === lastAuto) {
      notesField.value = suggestion;
      notesField.dataset.autoNoteManaged = "true";
    }

    notesField.dataset.lastAutoNote = suggestion;
  }

  notesField.addEventListener("input", () => {
    const current = normalize(notesField.value);
    const lastAuto = normalize(notesField.dataset.lastAutoNote);
    notesField.dataset.autoNoteManaged = !current || current === lastAuto ? "true" : "false";
  });

  for (const target of watchTargets) {
    if (!target) {
      continue;
    }
    target.addEventListener("input", () => refresh(false));
    target.addEventListener("change", () => refresh(false));
  }

  return {
    refresh,
    setManualValue(value) {
      notesField.value = value ?? "";
      notesField.dataset.autoNoteManaged = "false";
      notesField.dataset.lastAutoNote = "";
    },
  };
}

export function renderMonthlyMusicIncomeEditor(importDraft, monthKey, deps) {
  const {
    manualMusicIncomeOverridesForMonth,
    musicIncomeProfileForMonth,
    roundCurrency,
    formatPercent,
    euro,
    monthlyMusicIncomePersistence,
    formatDisplayDate,
    readMonthlyMusicIncomeOverrides,
    defaultDateTimeForMonth,
    focusAndSelectField,
    confirmAction,
    saveMonthlyMusicIncomeOverrides,
    refreshFinanceView,
    statusDetailForMode,
    monthFromDate,
  } = deps;

  const amountField = document.getElementById("musicIncomeActualAmount");
  const dateField = document.getElementById("musicIncomeActualDate");
  const notesField = document.getElementById("musicIncomeActualNotes");
  const metaTarget = document.getElementById("musicIncomeActualMeta");
  const saveButton = document.getElementById("saveMusicIncomeActualButton");
  const listTarget = document.getElementById("musicIncomeActualList");
  const summaryTarget = document.getElementById("musicIncomeActualSummary");

  if (!amountField || !dateField || !notesField || !metaTarget || !saveButton || !listTarget || !summaryTarget) {
    return;
  }

  const items = manualMusicIncomeOverridesForMonth(monthKey);
  const profile = musicIncomeProfileForMonth(importDraft, monthKey);
  const referenceGross = Number(profile.source?.amount ?? 0);
  const referenceReserve = Number(profile.source?.reserveAmount ?? 0);
  const referenceFree = Number(profile.source?.availableAmount ?? roundCurrency(referenceGross - referenceReserve));
  const reserveRateLabel = formatPercent(profile.reserveRate ?? 0);

  if (!(saveButton.dataset.editingId ?? "")) {
    dateField.value = defaultDateTimeForMonth(monthKey);
  }

  const musicNote = bindAutoNote(
    notesField,
    () => {
      const amount = Number(amountField.value);
      const selectedDateTime = dateField.value || defaultDateTimeForMonth(monthKey);
      const selectedMonthKey = monthFromDate(selectedDateTime) || monthKey;
      const amountLabel = Number.isFinite(amount) && amount > 0 ? euro.format(amount) : "offener Betrag";
      return `Musik-Istwert für ${selectedMonthKey} am ${formatDisplayDate(selectedDateTime)}: ${amountLabel} brutto.`;
    },
    [amountField, dateField],
  );
  if (!(saveButton.dataset.editingId ?? "")) {
    musicNote.refresh(true);
  }

  summaryTarget.innerHTML = [
    `<div class="mapping-card"><strong>Forecast aktuell</strong><p>${referenceGross > 0 ? `${euro.format(referenceGross)} brutto` : "Noch kein Musik-Forecast für diesen Monat."}</p></div>`,
    `<div class="mapping-card"><strong>Automatische Ableitung</strong><p>${referenceGross > 0 ? `Aktuell rechnet die App mit ${reserveRateLabel} Steuer-Rücklage. Beim Forecast sind das ${euro.format(referenceReserve)} Reserve und ${euro.format(referenceFree)} frei verfügbar.` : `Wenn du einen Ist-Wert speicherst, nutzt die App für ${monthKey} den aktuellen Steuer-Satz aus deiner Jahreslogik: ${reserveRateLabel}.`}</p></div>`,
    `<div class="mapping-card"><strong>Wirkung</strong><p>Dein Ist-Wert ersetzt den Forecast nur für diesen Monat. Andere Monate bleiben unverändert.</p></div>`,
  ].join("");

  if (items.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch kein Musik-Istwert für diesen Monat gespeichert.</p>`;
  } else {
    listTarget.innerHTML = items
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${euro.format(entry.amount)} brutto</strong>
              <p>${formatDisplayDate(entry.entryDate)} · Reserve ${euro.format(entry.reserveAmount ?? 0)} · frei ${euro.format(entry.availableAmount ?? 0)}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-music-income-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-music-income-delete="${entry.id}">Löschen</button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `)
      .join("");
  }

  const persistenceLabel = monthlyMusicIncomePersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = items.length > 0
    ? `${items.length} Musik-Istwert(e) im Monat · Speicherort: ${persistenceLabel}`
    : `Noch kein Musik-Istwert gespeichert · Speicherort: ${persistenceLabel}`;

  for (const button of listTarget.querySelectorAll("[data-music-income-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-music-income-edit");
      const entry = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!entry) return;
      saveButton.dataset.editingId = entry.id;
      saveButton.textContent = "Musik-Istwert aktualisieren";
      amountField.value = String(entry.amount);
      dateField.value = String(entry.entryDate ?? "").slice(0, 16) || defaultDateTimeForMonth(monthKey);
      musicNote.setManualValue(entry.notes || "");
      metaTarget.textContent = `Bearbeitungsmodus aktiv für ${euro.format(entry.amount)} brutto`;
      amountField.scrollIntoView({ behavior: "smooth", block: "center" });
      focusAndSelectField(amountField);
    });
  }

  for (const button of listTarget.querySelectorAll("[data-music-income-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-music-income-delete");
      if (!id) return;
      const entry = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!entry || !confirmAction(`Musik-Istwert ${euro.format(entry.amount)} für ${entry.monthKey} wirklich löschen?`)) {
        return;
      }

      const nextState = readMonthlyMusicIncomeOverrides().map((item) =>
        item.id === id ? { ...item, isActive: false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      await refreshFinanceView({
        title: "Musik-Istwert gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const amount = Number(amountField.value);
    const selectedDateTime = dateField.value || defaultDateTimeForMonth(monthKey);
    const selectedMonthKey = monthFromDate(selectedDateTime) || monthKey;
    const notes = notesField.value.trim();

    if (!Number.isFinite(amount) || amount < 0) {
      metaTarget.textContent = "Bitte einen gültigen Bruttobetrag eintragen.";
      return;
    }

    const reserveAmount = profile.reserveAmountForGross(amount);
    const availableAmount = roundCurrency(amount - reserveAmount);
    const isEditing = Boolean(editingId);

    if (!confirmAction(isEditing
      ? `Musik-Istwert ${euro.format(amount)} für ${formatDisplayDate(selectedDateTime)} wirklich aktualisieren?`
      : `Musik-Istwert ${euro.format(amount)} für ${formatDisplayDate(selectedDateTime)} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: editingId || `manual-music-income-${Date.now()}`,
      monthKey: selectedMonthKey,
      entryDate: selectedDateTime,
      amount,
      reserveAmount,
      availableAmount,
      accountId: "giro",
      isActive: true,
      notes,
      updatedAt: new Date().toISOString(),
    };

    const nextState = editingId
      ? readMonthlyMusicIncomeOverrides().map((item) => (item.id === editingId ? nextEntry : item))
      : [...readMonthlyMusicIncomeOverrides(), nextEntry];

    const result = await saveMonthlyMusicIncomeOverrides(nextState);
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Musik-Istwert speichern";
    amountField.value = "";
    dateField.value = defaultDateTimeForMonth(monthKey);
    musicNote.refresh(true);
    await refreshFinanceView({
      title: isEditing ? "Musik-Istwert aktualisiert" : "Musik-Istwert gespeichert",
      detail: `${statusDetailForMode(result.mode)} Reserve ${euro.format(reserveAmount)}, frei ${euro.format(availableAmount)}.`,
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

export function renderMonthlyExpenseEditor(importDraft, monthKey, deps) {
  const {
    manualExpensesForMonth,
    optionMarkup,
    buildCategoryOptions,
    accountOptions,
    defaultDateTimeForMonth,
    formatDisplayDate,
    monthlyExpensePersistence,
    renderSignalInline,
    expenseWarningsForInput,
    confirmAction,
    readMonthlyExpenseOverrides,
    saveMonthlyExpenseOverrides,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const descriptionField = document.getElementById("monthlyExpenseDescription");
  const amountField = document.getElementById("monthlyExpenseAmount");
  const dateField = document.getElementById("monthlyExpenseDate");
  const categoryField = document.getElementById("monthlyExpenseCategory");
  const accountField = document.getElementById("monthlyExpenseAccount");
  const notesField = document.getElementById("monthlyExpenseNotes");
  const metaTarget = document.getElementById("monthlyExpenseMeta");
  const warningsTarget = document.getElementById("monthlyExpenseWarnings");
  const saveButton = document.getElementById("saveMonthlyExpenseButton");

  if (
    !descriptionField ||
    !amountField ||
    !dateField ||
    !categoryField ||
    !accountField ||
    !notesField ||
    !metaTarget ||
    !saveButton
  ) {
    return;
  }

  const items = manualExpensesForMonth(monthKey);
  categoryField.innerHTML = optionMarkup(buildCategoryOptions(importDraft.expenseCategories), categoryField.value || "other");
  accountField.innerHTML = optionMarkup(accountOptions, accountField.value || "giro");
  if (!(saveButton.dataset.editingId ?? "")) {
    dateField.value = defaultDateTimeForMonth(monthKey);
  }

  const expenseNote = bindAutoNote(
    notesField,
    () => {
      const description = descriptionField.value.trim();
      const amount = Number(amountField.value);
      const entryDate = dateField.value || defaultDateTimeForMonth(monthKey);
      const amountLabel = Number.isFinite(amount) && amount > 0 ? euro.format(amount) : "offener Betrag";
      return `${description || "Manuelle Monatsausgabe"} am ${formatDisplayDate(entryDate)} für ${monthKey}: ${amountLabel}.`;
    },
    [descriptionField, amountField, dateField, categoryField, accountField],
  );
  if (!(saveButton.dataset.editingId ?? "")) {
    expenseNote.refresh(true);
  }

  const persistenceLabel = monthlyExpensePersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = items.length > 0
    ? `${items.length} manuelle Ausgaben im Monat · Speicherort: ${persistenceLabel}`
    : `Noch keine manuelle Monatsausgabe gespeichert · Speicherort: ${persistenceLabel}`;

  const updateWarnings = () => {
    renderSignalInline(warningsTarget, expenseWarningsForInput(importDraft, monthKey, {
      description: descriptionField.value,
      amount: amountField.value,
      entryDate: dateField.value,
      categoryId: categoryField.value,
      accountId: accountField.value,
    }));
  };

  descriptionField.oninput = updateWarnings;
  amountField.oninput = updateWarnings;
  dateField.oninput = updateWarnings;
  categoryField.onchange = updateWarnings;
  accountField.onchange = updateWarnings;
  updateWarnings();

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const description = descriptionField.value.trim();
    const amount = Number(amountField.value);
    const entryDate = dateField.value || `${monthKey}-01`;
    const notes = notesField.value.trim();

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      metaTarget.textContent = "Bitte Beschreibung und positiven Betrag eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(isEditing
      ? `Monatsausgabe "${description}" für ${entryDate} wirklich aktualisieren?`
      : `Monatsausgabe "${description}" für ${entryDate} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: editingId || `manual-expense-${Date.now()}`,
      monthKey,
      entryDate,
      description,
      amount,
      expenseCategoryId: categoryField.value || "other",
      accountId: accountField.value || "giro",
      expenseType: "variable",
      isActive: true,
      notes,
      updatedAt: new Date().toISOString(),
    };

    const nextState = editingId
      ? readMonthlyExpenseOverrides().map((entry) => (entry.id === editingId ? nextEntry : entry))
      : [...readMonthlyExpenseOverrides(), nextEntry];

    const result = await saveMonthlyExpenseOverrides(nextState);
    saveButton.dataset.editingId = "";
    descriptionField.value = "";
    amountField.value = "";
    dateField.value = defaultDateTimeForMonth(monthKey);
    categoryField.value = "other";
    accountField.value = "giro";
    expenseNote.refresh(true);
    await refreshFinanceView({
      title: isEditing ? "Monatsausgabe aktualisiert" : "Monatsausgabe gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

export function renderWealthSnapshotPlanner(importDraft, deps) {
  const {
    readWealthSnapshots,
    clearWealthSnapshotsLocal,
    localDateTimeInputValue,
    monthFromDate,
    currentSelectedMonthKey,
    monthReviewRowForMonth,
    wealthSnapshotCashAccounts,
    wealthSnapshotCashTotal,
    roundCurrency,
    euro,
    wealthSnapshotsPersistence,
    formatHistoryTimestamp,
    formatDisplayDate,
    saveWealthSnapshots,
    refreshFinanceView,
    statusDetailForMode,
    confirmAction,
  } = deps;

  const dateField = document.getElementById("wealthSnapshotDate");
  const giroField = document.getElementById("wealthSnapshotCashGiroAmount");
  const tradeRepublicField = document.getElementById("wealthSnapshotCashTradeRepublicAmount");
  const scalableField = document.getElementById("wealthSnapshotCashScalableAmount");
  const investmentField = document.getElementById("wealthSnapshotInvestmentAmount");
  const cashTotalField = document.getElementById("wealthSnapshotCashTotal");
  const notesField = document.getElementById("wealthSnapshotNotes");
  const monthStartEnabledField = document.getElementById("wealthSnapshotMonthStartEnabled");
  const monthStartMonthField = document.getElementById("wealthSnapshotMonthStartMonth");
  const metaTarget = document.getElementById("wealthSnapshotMeta");
  const listTarget = document.getElementById("wealthSnapshotList");
  const historySummaryTarget = document.getElementById("wealthSnapshotHistorySummary");
  const saveButton = document.getElementById("saveWealthSnapshotButton");
  const clearButton = document.getElementById("clearWealthSnapshotsButton");

  if (
    !dateField || !giroField || !tradeRepublicField || !scalableField || !investmentField ||
    !cashTotalField || !notesField || !monthStartEnabledField || !monthStartMonthField ||
    !metaTarget || !listTarget || !saveButton || !clearButton
  ) {
    return;
  }

  const snapshots = [...readWealthSnapshots()].sort((left, right) =>
    String(left.snapshotDate ?? "").localeCompare(String(right.snapshotDate ?? "")),
  );
  const fallbackDate = localDateTimeInputValue();

  function suggestedSnapshotValues(snapshotDate) {
    const monthKey = monthFromDate(snapshotDate ?? "") || currentSelectedMonthKey();
    const row = monthReviewRowForMonth(monthKey);
    const exactSnapshot = [...readWealthSnapshots()]
      .filter((entry) => entry.isActive !== false && String(entry.snapshotDate ?? "") === String(snapshotDate ?? ""))
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))[0];
    if (exactSnapshot) {
      return {
        cashAccounts: wealthSnapshotCashAccounts(exactSnapshot),
        investmentAmount: Number(exactSnapshot.investmentAmount ?? 0),
      };
    }

    const latestSnapshot = [...readWealthSnapshots()]
      .filter((entry) => entry.isActive !== false && String(entry.snapshotDate ?? "") <= String(snapshotDate ?? ""))
      .sort((left, right) => String(right.snapshotDate ?? "").localeCompare(String(left.snapshotDate ?? "")))[0];
    const latestAccounts = wealthSnapshotCashAccounts(latestSnapshot);
    if (latestSnapshot) {
      return {
        cashAccounts: latestAccounts,
        investmentAmount: Number(latestSnapshot.investmentAmount ?? 0),
      };
    }

    const suggestedCashTotal = Number(row?.safetyBucketEndAmount ?? 0);
    return {
      cashAccounts: {
        giro: Math.max(0, suggestedCashTotal),
        cash: 0,
        savings: 0,
      },
      investmentAmount: Number(row?.investmentBucketEndAmount ?? 0),
    };
  }

  function applySuggestedSnapshotValues(snapshotDate) {
    const suggested = suggestedSnapshotValues(snapshotDate);
    giroField.value = String(suggested.cashAccounts.giro);
    tradeRepublicField.value = String(suggested.cashAccounts.cash);
    scalableField.value = String(suggested.cashAccounts.savings);
    investmentField.value = String(suggested.investmentAmount);
    updateCashTotalField();
  }

  function updateCashTotalField() {
    const giroAmount = Number(giroField.value);
    const tradeRepublicAmount = Number(tradeRepublicField.value);
    const scalableAmount = Number(scalableField.value);
    const cashAmount = roundCurrency(
      (Number.isFinite(giroAmount) ? giroAmount : 0) +
      (Number.isFinite(tradeRepublicAmount) ? tradeRepublicAmount : 0) +
      (Number.isFinite(scalableAmount) ? scalableAmount : 0),
    );
    cashTotalField.value = euro.format(cashAmount);
  }

  function resetForm() {
    dateField.value = fallbackDate;
    applySuggestedSnapshotValues(fallbackDate);
    monthStartEnabledField.checked = false;
    monthStartMonthField.value = currentSelectedMonthKey();
    monthStartMonthField.disabled = true;
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Ist-Stand speichern";
    snapshotNote.refresh(true);
  }

  if (!dateField.value) {
    dateField.value = fallbackDate;
  }

  if (!saveButton.dataset.editingId) {
    applySuggestedSnapshotValues(dateField.value || fallbackDate);
  }

  const snapshotNote = bindAutoNote(
    notesField,
    () => {
      const snapshotDate = dateField.value || fallbackDate;
      const anchorMonthKey = monthStartEnabledField.checked
        ? (monthStartMonthField.value || monthFromDate(snapshotDate) || currentSelectedMonthKey())
        : "";
      const cashAmount = roundCurrency(
        Number(giroField.value || 0) +
        Number(tradeRepublicField.value || 0) +
        Number(scalableField.value || 0),
      );
      const investmentAmount = Number(investmentField.value || 0);
      return anchorMonthKey
        ? `Ist-Stand vom ${formatDisplayDate(snapshotDate)}: ${euro.format(cashAmount)} Cash und ${euro.format(investmentAmount)} Investment, gilt als Monatsanfang für ${anchorMonthKey}.`
        : `Ist-Stand vom ${formatDisplayDate(snapshotDate)}: ${euro.format(cashAmount)} Cash und ${euro.format(investmentAmount)} Investment.`;
    },
    [dateField, giroField, tradeRepublicField, scalableField, investmentField, monthStartEnabledField, monthStartMonthField],
  );
  if (!saveButton.dataset.editingId) {
    snapshotNote.refresh(true);
  }

  if (snapshots.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch kein manueller Vermögensstand gespeichert.</p>`;
  } else {
    listTarget.innerHTML = snapshots
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${formatDisplayDate(entry.snapshotDate)}${entry.anchorMonthKey ? ` · Monatsanfang ${entry.anchorMonthKey}` : " · Normaler Ist-Stand"}</strong>
              <p>CHECK24 ${euro.format(wealthSnapshotCashAccounts(entry).giro)} · TR Cash ${euro.format(wealthSnapshotCashAccounts(entry).cash)} · Scalable ${euro.format(wealthSnapshotCashAccounts(entry).savings)} · Investment ${euro.format(entry.investmentAmount)} · Wirkt für ${entry.anchorMonthKey ?? monthFromDate(entry.snapshotDate)}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-wealth-snapshot-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-wealth-snapshot-toggle="${entry.id}">
                ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
              </button>
            </div>
          </div>
          <p class="section-copy">Zuletzt geändert: ${formatHistoryTimestamp(entry.updatedAt)}</p>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `)
      .join("");
  }

  const persistenceLabel = wealthSnapshotsPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = snapshots.length > 0
    ? `${snapshots.length} Ist-Stand(e) gespeichert · Speicherort: ${persistenceLabel}`
    : `Noch kein manueller Vermögensstand gespeichert · Speicherort: ${persistenceLabel}`;
  clearButton.hidden = !(wealthSnapshotsPersistence === "browser" && snapshots.length > 0);
  if (wealthSnapshotsPersistence === "browser" && snapshots.length > 0) {
    metaTarget.textContent += " · Achtung: lokale Browser-Daten können Projektwerte überlagern.";
  }
  if (historySummaryTarget) {
    const latestEntry = [...snapshots]
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))[0];
    historySummaryTarget.textContent = latestEntry
      ? `Zuletzt geändert: ${formatHistoryTimestamp(latestEntry.updatedAt)} · ${latestEntry.anchorMonthKey ? `Monatsanfang ${latestEntry.anchorMonthKey}` : "Normaler Ist-Stand"} · Snapshot ${formatDisplayDate(latestEntry.snapshotDate)}`
      : "Noch kein manueller Vermögensstand gespeichert.";
  }

  for (const button of listTarget.querySelectorAll("[data-wealth-snapshot-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-wealth-snapshot-edit");
      const entry = readWealthSnapshots().find((item) => item.id === id);
      if (!entry) return;
      const cashAccounts = wealthSnapshotCashAccounts(entry);
      dateField.value = entry.snapshotDate || fallbackDate;
      giroField.value = String(cashAccounts.giro);
      tradeRepublicField.value = String(cashAccounts.cash);
      scalableField.value = String(cashAccounts.savings);
      investmentField.value = String(entry.investmentAmount ?? 0);
      snapshotNote.setManualValue(entry.notes || "");
      monthStartEnabledField.checked = Boolean(entry.anchorMonthKey);
      monthStartMonthField.value = entry.anchorMonthKey ?? monthFromDate(entry.snapshotDate) ?? currentSelectedMonthKey();
      monthStartMonthField.disabled = !monthStartEnabledField.checked;
      saveButton.dataset.editingId = entry.id;
      saveButton.textContent = "Ist-Stand aktualisieren";
      updateCashTotalField();
    });
  }

  dateField.onchange = () => {
    if (saveButton.dataset.editingId) {
      return;
    }

    applySuggestedSnapshotValues(dateField.value || fallbackDate);
  };

  monthStartEnabledField.onchange = () => {
    monthStartMonthField.disabled = !monthStartEnabledField.checked;
    if (monthStartEnabledField.checked && !monthStartMonthField.value) {
      monthStartMonthField.value = monthFromDate(dateField.value || fallbackDate) || currentSelectedMonthKey();
    }
  };

  giroField.oninput = updateCashTotalField;
  tradeRepublicField.oninput = updateCashTotalField;
  scalableField.oninput = updateCashTotalField;

  for (const button of listTarget.querySelectorAll("[data-wealth-snapshot-toggle]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-wealth-snapshot-toggle");
      if (!id) return;
      const nextState = readWealthSnapshots().map((entry) =>
        entry.id === id ? { ...entry, isActive: entry.isActive === false, updatedAt: new Date().toISOString() } : entry,
      );
      const result = await saveWealthSnapshots(nextState);
      await refreshFinanceView({
        title: "Ist-Stand aktualisiert",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const snapshotDate = dateField.value || fallbackDate;
    const giroAmount = Number(giroField.value);
    const tradeRepublicAmount = Number(tradeRepublicField.value);
    const scalableAmount = Number(scalableField.value);
    const investmentAmount = Number(investmentField.value);
    const notes = notesField.value.trim();
    const cashAmount = roundCurrency(giroAmount + tradeRepublicAmount + scalableAmount);
    const anchorMonthKey = monthStartEnabledField.checked
      ? (monthStartMonthField.value || monthFromDate(snapshotDate) || currentSelectedMonthKey())
      : "";

    if (
      !snapshotDate ||
      !Number.isFinite(giroAmount) || giroAmount < 0 ||
      !Number.isFinite(tradeRepublicAmount) || tradeRepublicAmount < 0 ||
      !Number.isFinite(scalableAmount) || scalableAmount < 0 ||
      !Number.isFinite(investmentAmount) || investmentAmount < 0 ||
      (monthStartEnabledField.checked && !anchorMonthKey)
    ) {
      metaTarget.textContent = "Bitte Datum sowie gültige Cash-, Investment- und Monatsstart-Werte eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(
      isEditing
        ? `Ist-Stand für ${snapshotDate} wirklich aktualisieren?`
        : `Ist-Stand für ${snapshotDate} wirklich speichern?`,
    )) {
      return;
    }

    const nextEntry = {
      id: editingId || `wealth-snapshot-${Date.now()}`,
      snapshotDate,
      cashAccounts: {
        giro: giroAmount,
        cash: tradeRepublicAmount,
        savings: scalableAmount,
      },
      cashAmount,
      investmentAmount,
      anchorMonthKey: anchorMonthKey || undefined,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    const nextState = editingId
      ? readWealthSnapshots().map((entry) => (entry.id === editingId ? nextEntry : entry))
      : [...readWealthSnapshots(), nextEntry];
    const result = await saveWealthSnapshots(nextState);
    resetForm();
    await refreshFinanceView({
      title: isEditing ? "Ist-Stand aktualisiert" : "Ist-Stand gespeichert",
      detail: `${statusDetailForMode(result.mode)} ${anchorMonthKey ? `Gilt als Monatsanfang für ${anchorMonthKey}.` : `Gilt für ${snapshotDate.slice(0, 7)} als gespeicherter Ist-Stand.`}`,
      tone: result.mode === "project" ? "success" : "warn",
    });
  };

  clearButton.onclick = async () => {
    if (!confirmAction("Lokale Browser-Ist-Stände wirklich löschen? Das entfernt nur den Browser-Fallback auf diesem Gerät.")) {
      return;
    }

    const result = clearWealthSnapshotsLocal();
    await refreshFinanceView({
      title: "Lokale Ist-Stände gelöscht",
      detail: `${statusDetailForMode(result.mode)} Der Browser-Fallback für Vermögensstände wurde geleert.`,
      tone: "warn",
    });
  };
}
