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

function parseLocaleNumber(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) {
    return NaN;
  }
  return Number(normalized);
}

let uniqueEntryCounter = 0;
function uniqueEntryId(prefix) {
  uniqueEntryCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueEntryCounter}-${Math.random().toString(16).slice(2, 10)}`;
}

export function renderMonthlyMusicIncomeEditor(importDraft, monthKey, deps) {
  const {
    manualMusicIncomeOverridesForMonth,
    musicIncomeProfileForMonth,
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
  const referenceNet = Number(profile.source?.availableAmount ?? profile.source?.amount ?? 0);

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
      return `Musik-Istwert für ${selectedMonthKey} am ${formatDisplayDate(selectedDateTime)}: ${amountLabel} netto.`;
    },
    [amountField, dateField],
  );
  if (!(saveButton.dataset.editingId ?? "")) {
    musicNote.refresh(true);
  }

  summaryTarget.innerHTML = [
    `<div class="mapping-card"><strong>Aktuell hinterlegt</strong><p>${referenceNet > 0 ? `${euro.format(referenceNet)} netto` : "Noch kein Musikwert für diesen Monat."}</p></div>`,
    `<div class="mapping-card"><strong>Wirkung</strong><p>Dein gespeicherter Musik-Istwert ersetzt den Monatswert nur für diesen Monat. Andere Monate bleiben unverändert.</p></div>`,
    `<div class="mapping-card"><strong>Hinweis</strong><p>Im Musik-Reiter wird der Betrag jetzt direkt als Netto gespeichert, ohne automatische Rücklagen-Ableitung.</p></div>`,
  ].join("");

  if (items.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch kein Musik-Istwert für diesen Monat gespeichert.</p>`;
  } else {
    listTarget.innerHTML = items
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${euro.format(entry.amount)} netto</strong>
              <p>${formatDisplayDate(entry.entryDate)} · direkt verfügbar</p>
            </div>
            <div class="filter-group">
              <ui5-button class="pill" design="Transparent" data-music-income-edit="${entry.id}">Bearbeiten</ui5-button>
              <ui5-button class="pill pill-danger" design="Negative" data-music-income-delete="${entry.id}">Löschen</ui5-button>
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
      metaTarget.textContent = `Bearbeitungsmodus aktiv für ${euro.format(entry.amount)} netto`;
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
    const notes = String(notesField.value ?? "").trim();

    if (!Number.isFinite(amount) || amount < 0) {
      metaTarget.textContent = "Bitte einen gültigen Nettobetrag eintragen.";
      return;
    }

    const existingForMonth = readMonthlyMusicIncomeOverrides().find((item) =>
      item.id !== editingId &&
      item.isActive !== false &&
      (item.incomeStreamId ?? "music-income") === "music-income" &&
      (item.monthKey ?? monthFromDate(item.entryDate)) === selectedMonthKey,
    );
    const targetId = editingId || existingForMonth?.id || uniqueEntryId("manual-music-income");
    const isEditing = Boolean(editingId || existingForMonth);

    if (!confirmAction(isEditing
      ? `Musik-Istwert ${euro.format(amount)} netto für ${formatDisplayDate(selectedDateTime)} wirklich aktualisieren?`
      : `Musik-Istwert ${euro.format(amount)} netto für ${formatDisplayDate(selectedDateTime)} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: targetId,
      monthKey: selectedMonthKey,
      entryDate: selectedDateTime,
      amount,
      reserveAmount: 0,
      availableAmount: amount,
      accountId: "giro",
      isActive: true,
      notes,
      updatedAt: new Date().toISOString(),
    };

    const nextState = (() => {
      let replaced = false;
      const nextItems = readMonthlyMusicIncomeOverrides().map((item) => {
        const itemMonthKey = item.monthKey ?? monthFromDate(item.entryDate);
        if (item.id === targetId) {
          replaced = true;
          return nextEntry;
        }
        if (item.id !== targetId && item.isActive !== false && itemMonthKey === selectedMonthKey) {
          return { ...item, isActive: false, updatedAt: nextEntry.updatedAt };
        }
        return item;
      });
      return replaced ? nextItems : [...nextItems, nextEntry];
    })();

    const result = await saveMonthlyMusicIncomeOverrides(nextState);
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Musik-Istwert speichern";
    amountField.value = "";
    dateField.value = defaultDateTimeForMonth(monthKey);
    musicNote.refresh(true);
    await refreshFinanceView({
      title: isEditing ? "Musik-Istwert aktualisiert" : "Musik-Istwert gespeichert",
      detail: `${statusDetailForMode(result.mode)} ${euro.format(amount)} netto gespeichert.`,
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

export function renderMonthlyExpenseEditor(importDraft, monthKey, deps) {
  const {
    manualExpensesForMonth,
    musicIncomeProfileForMonth,
    optionMarkup,
    buildCategoryOptions,
    accountOptions,
    todayIsoDate,
    monthFromDate,
    euro,
    formatDisplayDate,
    monthlyExpensePersistence,
    renderSignalInline,
    expenseWarningsForInput,
    confirmAction,
    readMonthlyExpenseOverrides,
    saveMonthlyExpenseOverrides,
    readMonthlyMusicIncomeOverrides,
    saveMonthlyMusicIncomeOverrides,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const movementTypeField = document.getElementById("monthlyMovementType");
  const descriptionField = document.getElementById("monthlyExpenseDescription");
  const amountField = document.getElementById("monthlyExpenseAmount");
  const dateField = document.getElementById("monthlyExpenseDate");
  const categoryField = document.getElementById("monthlyExpenseCategory");
  const incomeStreamField = document.getElementById("monthlyIncomeStream");
  const incomeStreamWrap = document.getElementById("monthlyIncomeStreamWrap");
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
  const supportsUnifiedMovement = Boolean(movementTypeField && incomeStreamField && incomeStreamWrap);
  const incomeStreamOptions = buildCategoryOptions(importDraft.incomeStreams ?? []);
  categoryField.innerHTML = optionMarkup(buildCategoryOptions(importDraft.expenseCategories), categoryField.value || "other");
  if (incomeStreamField) {
    incomeStreamField.innerHTML = optionMarkup(incomeStreamOptions, incomeStreamField.value || "misc-inflows");
  }
  accountField.innerHTML = optionMarkup(accountOptions, accountField.value || "giro");
  if (!(saveButton.dataset.editingId ?? "")) {
    dateField.value = todayIsoDate();
  }
  if (movementTypeField && !movementTypeField.value) {
    movementTypeField.value = "expense";
  }

  const expenseNote = bindAutoNote(
    notesField,
    () => {
      const movementType = movementTypeField?.value === "income" ? "income" : "expense";
      const description = String(descriptionField.value ?? "").trim();
      const amount = Number(amountField.value);
      const entryDate = dateField.value || todayIsoDate();
      const targetMonthKey = monthFromDate(entryDate) || monthKey;
      const amountLabel = Number.isFinite(amount) && amount > 0 ? euro.format(amount) : "offener Betrag";
      return movementType === "income"
        ? `${description || "Manuelle Einnahme"} am ${formatDisplayDate(entryDate)} für ${targetMonthKey}: ${amountLabel}.`
        : `${description || "Manuelle Ausgabe"} am ${formatDisplayDate(entryDate)} für ${targetMonthKey}: ${amountLabel}.`;
    },
    [movementTypeField, descriptionField, amountField, dateField, categoryField, incomeStreamField, accountField].filter(Boolean),
  );
  if (!(saveButton.dataset.editingId ?? "")) {
    expenseNote.refresh(true);
  }

  const persistenceLabel = monthlyExpensePersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = items.length > 0
    ? `${items.length} manuelle Ausgaben im Monat · Speicherort: ${persistenceLabel}`
    : `Noch keine manuelle Bewegung gespeichert · Speicherort: ${persistenceLabel}`;

  const syncMovementFields = () => {
    const isIncome = supportsUnifiedMovement && movementTypeField.value === "income";
    if (categoryField.parentElement) {
      categoryField.parentElement.hidden = isIncome;
    }
    if (incomeStreamWrap) {
      incomeStreamWrap.hidden = !isIncome;
    }
    renderSignalInline(warningsTarget, isIncome ? [] : expenseWarningsForInput(importDraft, monthKey, {
      description: descriptionField.value,
      amount: amountField.value,
      entryDate: dateField.value,
      categoryId: categoryField.value,
      accountId: accountField.value,
    }));
  };

  const updateWarnings = () => {
    syncMovementFields();
  };

  if (movementTypeField) {
    movementTypeField.onchange = updateWarnings;
  }
  descriptionField.oninput = updateWarnings;
  amountField.oninput = updateWarnings;
  dateField.oninput = updateWarnings;
  categoryField.onchange = updateWarnings;
  if (incomeStreamField) {
    incomeStreamField.onchange = updateWarnings;
  }
  accountField.onchange = updateWarnings;
  updateWarnings();

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const description = String(descriptionField.value ?? "").trim();
    const amount = Number(amountField.value);
    const entryDate = dateField.value || todayIsoDate();
    const selectedMonthKey = monthFromDate(entryDate) || monthKey;
    const notes = String(notesField.value ?? "").trim();
    const isIncome = supportsUnifiedMovement && movementTypeField?.value === "income";

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      metaTarget.textContent = "Bitte Beschreibung und positiven Betrag eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(isEditing
      ? `${isIncome ? "Einnahme" : "Ausgabe"} "${description}" für ${entryDate} wirklich aktualisieren?`
      : `${isIncome ? "Einnahme" : "Ausgabe"} "${description}" für ${entryDate} wirklich speichern?`)) {
      return;
    }

    let result;
    if (isIncome) {
      const incomeStreamId = incomeStreamField?.value || "misc-inflows";
      const profile = musicIncomeProfileForMonth(importDraft, selectedMonthKey);
      const reserveAmount = incomeStreamId === "music-income" ? profile.reserveAmountForGross(amount) : 0;
      const availableAmount = incomeStreamId === "music-income"
        ? profile.availableAmountForGross(amount)
        : amount;
      const nextEntry = {
        id: editingId || uniqueEntryId("manual-income"),
        monthKey: selectedMonthKey,
        entryDate: `${entryDate}T12:00`,
        description,
        amount,
        incomeStreamId,
        reserveAmount,
        availableAmount,
        accountId: accountField.value || "giro",
        isActive: true,
        notes,
        updatedAt: new Date().toISOString(),
      };
      const nextState = editingId
        ? readMonthlyMusicIncomeOverrides().map((entry) => (entry.id === editingId ? nextEntry : entry))
        : [...readMonthlyMusicIncomeOverrides(), nextEntry];
      result = await saveMonthlyMusicIncomeOverrides(nextState);
    } else {
      const nextEntry = {
        id: editingId || uniqueEntryId("manual-expense"),
        monthKey: selectedMonthKey,
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
      result = await saveMonthlyExpenseOverrides(nextState);
    }
    saveButton.dataset.editingId = "";
    descriptionField.value = "";
    amountField.value = "";
    dateField.value = todayIsoDate();
    if (movementTypeField) {
      movementTypeField.value = "expense";
    }
    categoryField.value = "other";
    if (incomeStreamField) {
      incomeStreamField.value = "misc-inflows";
    }
    accountField.value = "giro";
    expenseNote.refresh(true);
    updateWarnings();
    await refreshFinanceView({
      title: isIncome
        ? (isEditing ? "Einnahme aktualisiert" : "Einnahme gespeichert")
        : (isEditing ? "Ausgabe aktualisiert" : "Ausgabe gespeichert"),
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
  const fixedExpensesIncludedField = document.getElementById("wealthSnapshotFixedExpensesIncluded");
  const salaryIncludedField = document.getElementById("wealthSnapshotSalaryIncluded");
  const salaryIncludedForMonthField = document.getElementById("wealthSnapshotSalaryIncludedForMonth");
  const musicIncludedField = document.getElementById("wealthSnapshotMusicIncluded");
  const musicIncludedForMonthField = document.getElementById("wealthSnapshotMusicIncludedForMonth");
  const musicThresholdBeforeAmountField = document.getElementById("wealthSnapshotMusicThresholdBeforeAmount");
  const basisInvestmentStateField = document.getElementById("wealthSnapshotBasisInvestmentState");
  const extraExpensesIncludedField = document.getElementById("wealthSnapshotExtraExpensesIncluded");
  const positionUpdateDateField = document.getElementById("wealthPositionUpdateDate");
  const positionUpdateTargetField = document.getElementById("wealthPositionUpdateTarget");
  const positionUpdateAmountField = document.getElementById("wealthPositionUpdateAmount");
  const positionUpdateNotesField = document.getElementById("wealthPositionUpdateNotes");
  const positionQuickTargets = document.getElementById("wealthPositionUpdateQuickTargets");
  const positionUpdateMetaTarget = document.getElementById("wealthPositionUpdateMeta");
  const savePositionUpdateButton = document.getElementById("saveWealthPositionUpdateButton");
  const overviewTarget = document.getElementById("wealthSnapshotOverview");
  const workspaceInfoTarget = document.getElementById("wealthWorkspaceViewInfo");
  const quickPanel = document.getElementById("wealthQuickUpdatePanel");
  const snapshotPanel = document.getElementById("wealthSnapshotPanel");
  const historyPanel = document.getElementById("wealthHistoryPanel");
  const detailTarget = document.getElementById("wealthSnapshotDetail");
  const workspaceViewButtons = typeof document.querySelectorAll === "function"
    ? [...document.querySelectorAll("[data-wealth-view]")]
    : [];
  const metaTarget = document.getElementById("wealthSnapshotMeta");
  const listTarget = document.getElementById("wealthSnapshotList");
  const historySummaryTarget = document.getElementById("wealthSnapshotHistorySummary");
  const historyMetaTarget = document.getElementById("wealthSnapshotHistoryMeta");
  const historyToggleButton = document.getElementById("wealthSnapshotHistoryToggleButton");
  const saveButton = document.getElementById("saveWealthSnapshotButton");
  const clearButton = document.getElementById("clearWealthSnapshotsButton");

  if (
    !dateField || !giroField || !tradeRepublicField || !scalableField || !investmentField ||
    !cashTotalField || !notesField || !monthStartEnabledField || !monthStartMonthField ||
    !fixedExpensesIncludedField || !salaryIncludedField || !salaryIncludedForMonthField || !musicIncludedField || !musicIncludedForMonthField || !musicThresholdBeforeAmountField || !basisInvestmentStateField || !extraExpensesIncludedField ||
    !positionUpdateDateField || !positionUpdateTargetField || !positionUpdateAmountField || !positionUpdateNotesField || !positionUpdateMetaTarget || !savePositionUpdateButton ||
    !metaTarget || !listTarget || !saveButton || !clearButton
  ) {
    return;
  }

  const snapshots = [...readWealthSnapshots()].sort((left, right) =>
    String(left.snapshotDate ?? "").localeCompare(String(right.snapshotDate ?? "")),
  );
  let showAllHistory = false;
  let activeWorkspaceView = "quick";
  let selectedSnapshotId = snapshots.at(-1)?.id ?? "";
  const fallbackDate = localDateTimeInputValue();
  const wealthPositionLabels = {
    giro: "CHECK24",
    cash: "Trade Republic Cash",
    savings: "Scalable",
    investment: "Investment / Portfolio",
  };
  const workspaceViewCopy = {
    quick: "Schnellupdate ist für einzelne Konten oder Depotstände gedacht. Alles andere bleibt dabei automatisch erhalten.",
    snapshot: "Voller Snapshot ist nur für mehrere gleichzeitige Änderungen oder einen sauberen Monatsanfang gedacht.",
    history: "Im Verlauf prüfst du alte Ist-Stände, aktivierst sie wieder oder springst zum Bearbeiten in den Snapshot-Modus.",
  };

  function setUi5ButtonText(button, text) {
    if (!button) {
      return;
    }
    button.textContent = text;
  }

  function applyWorkspaceView(nextView) {
    activeWorkspaceView = nextView;
    const panels = {
      quick: quickPanel,
      snapshot: snapshotPanel,
      history: historyPanel,
    };

    for (const [view, panel] of Object.entries(panels)) {
      if (!panel) {
        continue;
      }
      const isActive = view === nextView;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    }

    for (const button of workspaceViewButtons) {
      const isActive = button.getAttribute("data-wealth-view") === nextView;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("design", isActive ? "Emphasized" : "Transparent");
    }

    if (workspaceInfoTarget) {
      workspaceInfoTarget.textContent = workspaceViewCopy[nextView] ?? workspaceViewCopy.quick;
    }
  }

  function renderOverviewCards() {
    if (!overviewTarget) {
      return;
    }
    const snapshotDate = positionUpdateDateField.value || dateField.value || fallbackDate;
    const baseSnapshot = baseSnapshotForDate(snapshotDate);
    const suggested = suggestedSnapshotValues(snapshotDate);
    const selectedMonthKey = monthFromDate(snapshotDate) || currentSelectedMonthKey();
    const currentCash = wealthSnapshotCashTotal({
      cashAccounts: suggested.cashAccounts,
    }, roundCurrency);
    const currentInvestment = roundCurrency(Number(suggested.investmentAmount ?? 0));
    const cards = [
      {
        label: "Arbeitsmonat",
        value: selectedMonthKey,
        note: "Alle Eingaben wirken auf diesen Monat oder auf das gewählte Datum.",
      },
      {
        label: "Letzter Ist-Stand",
        value: baseSnapshot ? formatDisplayDate(baseSnapshot.snapshotDate) : "Noch keiner",
        note: baseSnapshot
          ? `${euro.format(wealthSnapshotCashTotal(baseSnapshot, roundCurrency))} Cash · ${euro.format(baseSnapshot.investmentAmount ?? 0)} Investment`
          : "Dann arbeitet die App mit Monatsprojektion als Vorschlag.",
      },
      {
        label: "Schnellupdate aktuell",
        value: `${euro.format(currentCash)} Cash`,
        note: `${euro.format(currentInvestment)} Investment als aktuell vorgeschlagener Stand.`,
      },
    ];

    overviewTarget.innerHTML = cards
      .map((card) => `
        <div class="mapping-card wealth-overview-card">
          <strong>${card.label}</strong>
          <p class="planner-position-value">${card.value}</p>
          <p>${card.note}</p>
        </div>
      `)
      .join("");
  }

  function exactSnapshotForDate(snapshotDate) {
    return [...readWealthSnapshots()]
      .filter((entry) => entry.isActive !== false && String(entry.snapshotDate ?? "") === String(snapshotDate ?? ""))
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))[0];
  }

  function latestSnapshotForDate(snapshotDate) {
    return [...readWealthSnapshots()]
      .filter((entry) => entry.isActive !== false && String(entry.snapshotDate ?? "") <= String(snapshotDate ?? ""))
      .sort((left, right) => String(right.snapshotDate ?? "").localeCompare(String(left.snapshotDate ?? "")))[0];
  }

  function baseSnapshotForDate(snapshotDate) {
    return exactSnapshotForDate(snapshotDate) ?? latestSnapshotForDate(snapshotDate);
  }

  function suggestedSnapshotValues(snapshotDate) {
    const monthKey = monthFromDate(snapshotDate ?? "") || currentSelectedMonthKey();
    const row = monthReviewRowForMonth(monthKey);
    const exactSnapshot = exactSnapshotForDate(snapshotDate);
    if (exactSnapshot) {
      return {
        cashAccounts: wealthSnapshotCashAccounts(exactSnapshot),
        investmentAmount: Number(exactSnapshot.investmentAmount ?? 0),
      };
    }

    const latestSnapshot = latestSnapshotForDate(snapshotDate);
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
    renderOverviewCards();
  }

  function effectiveIncludedMonthKey() {
    if (monthStartEnabledField.checked) {
      return monthStartMonthField.value || currentSelectedMonthKey();
    }

    const snapshotDate = dateField.value || fallbackDate;
    return monthFromDate(snapshotDate) || currentSelectedMonthKey();
  }

  function syncIncludedMonthFields() {
    salaryIncludedForMonthField.disabled = !salaryIncludedField.checked;
    musicIncludedForMonthField.disabled = !musicIncludedField.checked;
    musicThresholdBeforeAmountField.disabled = !musicIncludedField.checked;

    const targetMonthKey = effectiveIncludedMonthKey();
    if (salaryIncludedField.checked && !salaryIncludedForMonthField.value) {
      salaryIncludedForMonthField.value = targetMonthKey;
    }
    if (musicIncludedField.checked && !musicIncludedForMonthField.value) {
      musicIncludedForMonthField.value = targetMonthKey;
    }
  }

  function resetForm() {
    dateField.value = fallbackDate;
    applySuggestedSnapshotValues(fallbackDate);
    monthStartEnabledField.checked = false;
    monthStartMonthField.value = currentSelectedMonthKey();
    monthStartMonthField.disabled = true;
    fixedExpensesIncludedField.checked = false;
    salaryIncludedField.checked = false;
    salaryIncludedForMonthField.value = currentSelectedMonthKey();
    salaryIncludedForMonthField.disabled = true;
    musicIncludedField.checked = false;
    musicIncludedForMonthField.value = currentSelectedMonthKey();
    musicIncludedForMonthField.disabled = true;
    musicThresholdBeforeAmountField.value = "";
    musicThresholdBeforeAmountField.disabled = true;
    basisInvestmentStateField.value = "open";
    extraExpensesIncludedField.checked = false;
    saveButton.dataset.editingId = "";
    setUi5ButtonText(saveButton, "Ist-Stand speichern");
    snapshotNote.refresh(true);
    renderOverviewCards();
  }

  if (!dateField.value) {
    dateField.value = fallbackDate;
  }
  if (!positionUpdateDateField.value) {
    positionUpdateDateField.value = fallbackDate;
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
      const fixedExpensesIncluded = fixedExpensesIncludedField.checked;
      const salaryIncludedMonthKey = salaryIncludedField.checked ? (salaryIncludedForMonthField.value || "") : "";
      const musicIncludedMonthKey = musicIncludedField.checked ? (musicIncludedForMonthField.value || "") : "";
      const musicThresholdBeforeAmount = musicIncludedField.checked && musicThresholdBeforeAmountField.value
        ? parseLocaleNumber(musicThresholdBeforeAmountField.value)
        : undefined;
      const basisInvestmentState = basisInvestmentStateField.value || "open";
      const extraExpensesIncluded = extraExpensesIncludedField.checked;
      const statusParts = [
        fixedExpensesIncluded ? "Fixkosten schon enthalten" : "",
        salaryIncludedMonthKey ? `Gehalt (${salaryIncludedMonthKey}) schon enthalten` : "",
        musicIncludedMonthKey ? `Musik (${musicIncludedMonthKey}) schon enthalten` : "",
        Number.isFinite(musicThresholdBeforeAmount) ? `Threshold vor Musik: ${euro.format(musicThresholdBeforeAmount)}` : "",
        basisInvestmentState === "pending_cash"
          ? "Basis-Investment liegt noch im Cash"
          : basisInvestmentState === "included"
            ? "Basis-Investment schon im Depot"
            : "",
        extraExpensesIncluded ? "Zusatz-Ausgaben schon enthalten" : "",
      ].filter(Boolean);
      return anchorMonthKey
        ? `Ist-Stand vom ${formatDisplayDate(snapshotDate)}: ${euro.format(cashAmount)} Cash und ${euro.format(investmentAmount)} Investment, gilt als Monatsanfang für ${anchorMonthKey}.${statusParts.length > 0 ? ` ${statusParts.join(" · ")}.` : ""}`
        : `Ist-Stand vom ${formatDisplayDate(snapshotDate)}: ${euro.format(cashAmount)} Cash und ${euro.format(investmentAmount)} Investment.${statusParts.length > 0 ? ` ${statusParts.join(" · ")}.` : ""}`;
    },
    [
      dateField,
      giroField,
      tradeRepublicField,
      scalableField,
      investmentField,
      monthStartEnabledField,
      monthStartMonthField,
      fixedExpensesIncludedField,
      salaryIncludedField,
      salaryIncludedForMonthField,
      musicIncludedField,
      musicIncludedForMonthField,
      musicThresholdBeforeAmountField,
      basisInvestmentStateField,
      extraExpensesIncludedField,
    ],
  );
  if (!saveButton.dataset.editingId) {
    snapshotNote.refresh(true);
  }

  const positionUpdateNote = bindAutoNote(
    positionUpdateNotesField,
    () => {
      const snapshotDate = positionUpdateDateField.value || fallbackDate;
      const target = positionUpdateTargetField.value || "investment";
      const amount = Number(positionUpdateAmountField.value);
      const amountLabel = Number.isFinite(amount) && amount >= 0 ? euro.format(amount) : "offener Betrag";
      return `${wealthPositionLabels[target] ?? target} am ${formatDisplayDate(snapshotDate)} auf ${amountLabel} aktualisiert. Rest aus letztem Ist-Stand übernommen.`;
    },
    [positionUpdateDateField, positionUpdateTargetField, positionUpdateAmountField],
  );
  positionUpdateNote.refresh(true);

  function resetPositionUpdateForm() {
    positionUpdateDateField.value = fallbackDate;
    positionUpdateTargetField.value = "investment";
    positionUpdateAmountField.value = "";
    positionUpdateNote.refresh(true);
    renderOverviewCards();
  }

  function renderPositionQuickTargets() {
    if (!positionQuickTargets) {
      return;
    }

    const snapshotDate = positionUpdateDateField.value || fallbackDate;
    const baseSnapshot = baseSnapshotForDate(snapshotDate);
    const suggested = suggestedSnapshotValues(snapshotDate);
    const cashAccounts = suggested.cashAccounts ?? { giro: 0, cash: 0, savings: 0 };
    const positionValues = {
      giro: Number(cashAccounts.giro ?? 0),
      cash: Number(cashAccounts.cash ?? 0),
      savings: Number(cashAccounts.savings ?? 0),
      investment: Number(suggested.investmentAmount ?? 0),
    };
    const sourceLabel = baseSnapshot
      ? `Zuletzt aus Ist-Stand vom ${formatDisplayDate(baseSnapshot.snapshotDate)} übernommen.`
      : `Noch kein Ist-Stand vorhanden. Vorschlag aus Monatsprojektion für ${monthFromDate(snapshotDate) || currentSelectedMonthKey()}.`;

    positionQuickTargets.innerHTML = Object.entries(wealthPositionLabels)
      .map(([target, label]) => `
        <div class="mapping-card planner-position-card">
          <div>
            <strong>${label}</strong>
            <p class="planner-position-value">${euro.format(positionValues[target] ?? 0)}</p>
            <p>${sourceLabel}</p>
          </div>
          <ui5-button class="pill" design="Transparent" data-wealth-position-preset="${target}">${label} aktualisieren</ui5-button>
        </div>
      `)
      .join("");

    for (const button of positionQuickTargets.querySelectorAll("[data-wealth-position-preset]")) {
      button.addEventListener("click", () => {
        const target = button.getAttribute("data-wealth-position-preset");
        if (!target) {
          return;
        }
        positionUpdateTargetField.value = target;
        positionUpdateAmountField.value = String(positionValues[target] ?? 0);
        positionUpdateNote.refresh(true);
      });
    }
  }

  function renderSnapshotDetail(entry) {
    if (!detailTarget) {
      return;
    }

    if (!entry) {
      detailTarget.innerHTML = `<p class="empty-state">Wähle links einen gespeicherten Ist-Stand aus, um Details zu sehen.</p>`;
      return;
    }

    const cashAccounts = wealthSnapshotCashAccounts(entry);
    detailTarget.innerHTML = `
      <div class="mapping-card wealth-history-detail-card">
        <div class="mapping-card-head">
          <div>
            <strong>${formatDisplayDate(entry.snapshotDate)}${entry.anchorMonthKey ? ` · Monatsanfang ${entry.anchorMonthKey}` : " · Normaler Ist-Stand"}</strong>
            <p>Zuletzt geändert: ${formatHistoryTimestamp(entry.updatedAt)}</p>
          </div>
          <div class="filter-group">
            <ui5-button class="pill" design="Transparent" data-wealth-snapshot-edit="${entry.id}">Bearbeiten</ui5-button>
            <ui5-button class="pill" design="Transparent" data-wealth-snapshot-toggle="${entry.id}">
              ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
            </ui5-button>
            <ui5-button class="pill pill-danger" design="Negative" data-wealth-snapshot-delete="${entry.id}">Löschen</ui5-button>
          </div>
        </div>
        <div class="detail-strip">
          <div>
            <span>CHECK24</span>
            <strong>${euro.format(cashAccounts.giro)}</strong>
          </div>
          <div>
            <span>TR Cash</span>
            <strong>${euro.format(cashAccounts.cash)}</strong>
          </div>
          <div>
            <span>Scalable</span>
            <strong>${euro.format(cashAccounts.savings)}</strong>
          </div>
        </div>
        <div class="detail-strip">
          <div>
            <span>Cash gesamt</span>
            <strong>${euro.format(wealthSnapshotCashTotal(entry, roundCurrency))}</strong>
          </div>
          <div>
            <span>Investment</span>
            <strong>${euro.format(entry.investmentAmount ?? 0)}</strong>
          </div>
          <div>
            <span>Wirkt für</span>
            <strong>${entry.anchorMonthKey ?? monthFromDate(entry.snapshotDate)}</strong>
          </div>
        </div>
        <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
      </div>
    `;
  }

  function renderSnapshotHistory() {
    const sortedSnapshots = [...readWealthSnapshots()].sort((left, right) =>
      String(right.snapshotDate ?? "").localeCompare(String(left.snapshotDate ?? "")),
    );
    const visibleSnapshots = showAllHistory ? sortedSnapshots : sortedSnapshots.slice(0, 6);

    if (sortedSnapshots.length === 0) {
      listTarget.innerHTML = `<p class="empty-state">Noch kein manueller Vermögensstand gespeichert.</p>`;
      renderSnapshotDetail(null);
      if (historyMetaTarget) {
        historyMetaTarget.textContent = "Sobald du Ist-Stände speicherst, erscheinen sie hier in absteigender Reihenfolge.";
      }
      if (historyToggleButton) {
        historyToggleButton.hidden = true;
      }
      return;
    }

    if (!selectedSnapshotId || !sortedSnapshots.some((entry) => entry.id === selectedSnapshotId)) {
      selectedSnapshotId = visibleSnapshots[0]?.id ?? sortedSnapshots[0]?.id ?? "";
    }

    listTarget.innerHTML = visibleSnapshots
      .map((entry) => `
        <div class="mapping-card wealth-history-row ${entry.id === selectedSnapshotId ? "is-selected" : ""}">
          <div class="mapping-card-head">
            <div>
              <strong>${formatDisplayDate(entry.snapshotDate)}${entry.anchorMonthKey ? ` · Monatsanfang ${entry.anchorMonthKey}` : " · Normaler Ist-Stand"}</strong>
              <p>CHECK24 ${euro.format(wealthSnapshotCashAccounts(entry).giro)} · TR Cash ${euro.format(wealthSnapshotCashAccounts(entry).cash)} · Scalable ${euro.format(wealthSnapshotCashAccounts(entry).savings)} · Investment ${euro.format(entry.investmentAmount)} · Wirkt für ${entry.anchorMonthKey ?? monthFromDate(entry.snapshotDate)}</p>
              <p class="section-copy">${[
                entry.monthlyStatus?.fixedExpensesIncluded ? "Fixkosten enthalten" : "",
                entry.monthlyStatus?.salaryIncludedForMonthKey
                  ? `Gehalt ${entry.monthlyStatus.salaryIncludedForMonthKey} enthalten`
                  : (entry.monthlyStatus?.salaryIncluded ? "Gehalt enthalten" : ""),
                entry.monthlyStatus?.musicIncludedForMonthKey
                  ? `Musik ${entry.monthlyStatus.musicIncludedForMonthKey} enthalten`
                  : (entry.monthlyStatus?.musicIncluded ? "Musik enthalten" : ""),
                entry.monthlyStatus?.basisInvestmentState === "pending_cash"
                  ? "Basis-Investment noch im Cash"
                  : entry.monthlyStatus?.basisInvestmentState === "included"
                    ? "Basis-Investment schon im Depot"
                    : "",
                entry.monthlyStatus?.extraExpensesIncluded ? "Zusatz-Ausgaben enthalten" : "",
              ].filter(Boolean).join(" · ") || "Keine Zusatz-Status gesetzt."}</p>
            </div>
            <div class="filter-group">
              <ui5-button class="pill" design="${entry.id === selectedSnapshotId ? "Emphasized" : "Transparent"}" data-wealth-snapshot-select="${entry.id}">${entry.id === selectedSnapshotId ? "Ausgewählt" : "Details"}</ui5-button>
              <ui5-button class="pill" design="Transparent" data-wealth-snapshot-edit="${entry.id}">Bearbeiten</ui5-button>
              <ui5-button class="pill pill-danger" design="Negative" data-wealth-snapshot-delete="${entry.id}">Löschen</ui5-button>
            </div>
          </div>
          <p class="section-copy">Zuletzt geändert: ${formatHistoryTimestamp(entry.updatedAt)} · ${entry.isActive === false ? "deaktiviert" : "aktiv"}</p>
        </div>
      `)
      .join("");

    renderSnapshotDetail(sortedSnapshots.find((entry) => entry.id === selectedSnapshotId) ?? null);

    if (historyMetaTarget) {
      historyMetaTarget.textContent = showAllHistory
        ? `${sortedSnapshots.length} Einträge eingeblendet.`
        : `${visibleSnapshots.length} von ${sortedSnapshots.length} Einträgen sichtbar.`;
    }
    if (historyToggleButton) {
      historyToggleButton.hidden = sortedSnapshots.length <= 6;
      historyToggleButton.textContent = showAllHistory ? "Weniger anzeigen" : "Ältere Einträge zeigen";
    }
  }

  renderSnapshotHistory();
  renderOverviewCards();
  applyWorkspaceView(activeWorkspaceView);

  const persistenceLabel = wealthSnapshotsPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = snapshots.length > 0
    ? `${snapshots.length} Ist-Stand(e) gespeichert · Speicherort: ${persistenceLabel}`
    : `Noch kein manueller Vermögensstand gespeichert · Speicherort: ${persistenceLabel}`;
  positionUpdateMetaTarget.textContent = snapshots.length > 0
    ? `Neue Positions-Updates übernehmen alle übrigen Werte automatisch aus dem letzten Ist-Stand · Speicherort: ${persistenceLabel}`
    : `Noch kein Ist-Stand vorhanden. Der erste Positions-Update braucht trotzdem einen vollständigen plausiblen Wert für die gewählte Position.`;
  clearButton.hidden = !(wealthSnapshotsPersistence === "browser" && snapshots.length > 0);
  if (wealthSnapshotsPersistence === "browser" && snapshots.length > 0) {
    metaTarget.textContent += " · Achtung: lokale Browser-Daten können Projektwerte überlagern.";
    positionUpdateMetaTarget.textContent += " Achtung: lokale Browser-Daten können Projektwerte überlagern.";
  }
  if (historySummaryTarget) {
    const latestEntry = [...snapshots]
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))[0];
    historySummaryTarget.textContent = latestEntry
      ? `Zuletzt geändert: ${formatHistoryTimestamp(latestEntry.updatedAt)} · ${latestEntry.anchorMonthKey ? `Monatsanfang ${latestEntry.anchorMonthKey}` : "Normaler Ist-Stand"} · Snapshot ${formatDisplayDate(latestEntry.snapshotDate)}`
      : "Noch kein manueller Vermögensstand gespeichert.";
  }
  renderPositionQuickTargets();

  if (historyToggleButton) {
    historyToggleButton.onclick = () => {
      showAllHistory = !showAllHistory;
      renderSnapshotHistory();
      bindSnapshotHistoryActions();
    };
  }

  function bindSnapshotHistoryActions() {
    const roots = [listTarget, detailTarget].filter(Boolean);

    for (const root of roots) {
      for (const button of root.querySelectorAll("[data-wealth-snapshot-edit]")) {
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
          fixedExpensesIncludedField.checked = entry.monthlyStatus?.fixedExpensesIncluded === true;
          salaryIncludedField.checked = entry.monthlyStatus?.salaryIncluded === true;
          salaryIncludedForMonthField.value =
            entry.monthlyStatus?.salaryIncludedForMonthKey ??
            (entry.monthlyStatus?.salaryIncluded ? (entry.anchorMonthKey ?? monthFromDate(entry.snapshotDate)) : "") ??
            "";
          musicIncludedField.checked = entry.monthlyStatus?.musicIncluded === true;
          musicIncludedForMonthField.value =
            entry.monthlyStatus?.musicIncludedForMonthKey ??
            (entry.monthlyStatus?.musicIncluded ? (entry.anchorMonthKey ?? monthFromDate(entry.snapshotDate)) : "") ??
            "";
          musicThresholdBeforeAmountField.value =
            typeof entry.monthlyStatus?.musicThresholdBeforeAmount === "number"
              ? String(entry.monthlyStatus.musicThresholdBeforeAmount)
              : "";
          basisInvestmentStateField.value = entry.monthlyStatus?.basisInvestmentState ?? "open";
          extraExpensesIncludedField.checked = entry.monthlyStatus?.extraExpensesIncluded === true;
          saveButton.dataset.editingId = entry.id;
          setUi5ButtonText(saveButton, "Ist-Stand aktualisieren");
          updateCashTotalField();
          syncIncludedMonthFields();
          selectedSnapshotId = entry.id;
          renderOverviewCards();
          applyWorkspaceView("snapshot");
        });
      }

      for (const button of root.querySelectorAll("[data-wealth-snapshot-select]")) {
        button.addEventListener("click", () => {
          const id = button.getAttribute("data-wealth-snapshot-select");
          if (!id) {
            return;
          }
          selectedSnapshotId = id;
          renderSnapshotHistory();
          bindSnapshotHistoryActions();
        });
      }

      for (const button of root.querySelectorAll("[data-wealth-snapshot-toggle]")) {
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

      for (const button of root.querySelectorAll("[data-wealth-snapshot-delete]")) {
        button.addEventListener("click", async () => {
          const id = button.getAttribute("data-wealth-snapshot-delete");
          const entry = readWealthSnapshots().find((item) => item.id === id);
          if (!id || !entry) return;
          if (!confirmAction(`Ist-Stand vom ${formatDisplayDate(entry.snapshotDate)} wirklich löschen?`)) {
            return;
          }

          const nextState = readWealthSnapshots().filter((item) => item.id !== id);
          const result = await saveWealthSnapshots(nextState);
          await refreshFinanceView({
            title: "Ist-Stand gelöscht",
            detail: statusDetailForMode(result.mode),
            tone: result.mode === "project" ? "success" : "warn",
          });
        });
      }
    }
  }

  bindSnapshotHistoryActions();

  for (const button of workspaceViewButtons) {
    button.addEventListener("click", () => {
      const nextView = button.getAttribute("data-wealth-view") || "quick";
      applyWorkspaceView(nextView);
    });
  }

  dateField.onchange = () => {
    if (saveButton.dataset.editingId) {
      return;
    }

    applySuggestedSnapshotValues(dateField.value || fallbackDate);
    renderOverviewCards();
  };
  positionUpdateDateField.onchange = () => {
    positionUpdateNote.refresh(true);
    renderPositionQuickTargets();
    renderOverviewCards();
  };
  positionUpdateTargetField.onchange = () => {
    positionUpdateNote.refresh(true);
    renderOverviewCards();
  };

  monthStartEnabledField.onchange = () => {
    monthStartMonthField.disabled = !monthStartEnabledField.checked;
    if (monthStartEnabledField.checked && !monthStartMonthField.value) {
      monthStartMonthField.value = monthFromDate(dateField.value || fallbackDate) || currentSelectedMonthKey();
    }
    syncIncludedMonthFields();
  };

  monthStartMonthField.onchange = () => {
    syncIncludedMonthFields();
    snapshotNote.refresh(true);
  };

  giroField.oninput = updateCashTotalField;
  tradeRepublicField.oninput = updateCashTotalField;
  scalableField.oninput = updateCashTotalField;
  investmentField.oninput = () => renderOverviewCards();

  salaryIncludedField.onchange = () => {
    if (salaryIncludedField.checked && !salaryIncludedForMonthField.value) {
      salaryIncludedForMonthField.value = effectiveIncludedMonthKey();
    }
    syncIncludedMonthFields();
    snapshotNote.refresh(true);
  };
  salaryIncludedForMonthField.onchange = () => snapshotNote.refresh(true);

  musicIncludedField.onchange = () => {
    if (musicIncludedField.checked && !musicIncludedForMonthField.value) {
      musicIncludedForMonthField.value = effectiveIncludedMonthKey();
    }
    syncIncludedMonthFields();
    snapshotNote.refresh(true);
  };
  musicIncludedForMonthField.onchange = () => snapshotNote.refresh(true);
  musicThresholdBeforeAmountField.onchange = () => snapshotNote.refresh(true);

  syncIncludedMonthFields();

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const snapshotDate = dateField.value || fallbackDate;
    const giroAmount = Number(giroField.value);
    const tradeRepublicAmount = Number(tradeRepublicField.value);
    const scalableAmount = Number(scalableField.value);
    const investmentAmount = Number(investmentField.value);
    const notes = String(notesField.value ?? "").trim();
    const cashAmount = roundCurrency(giroAmount + tradeRepublicAmount + scalableAmount);
    const anchorMonthKey = monthStartEnabledField.checked
      ? (monthStartMonthField.value || monthFromDate(snapshotDate) || currentSelectedMonthKey())
      : "";
    const monthlyStatus = {
      fixedExpensesIncluded: fixedExpensesIncludedField.checked,
      salaryIncluded: salaryIncludedField.checked,
      musicIncluded: musicIncludedField.checked,
      salaryIncludedForMonthKey: salaryIncludedField.checked ? (salaryIncludedForMonthField.value || undefined) : undefined,
      musicIncludedForMonthKey: musicIncludedField.checked ? (musicIncludedForMonthField.value || undefined) : undefined,
      musicThresholdBeforeAmount: (() => {
        if (!(musicIncludedField.checked && musicThresholdBeforeAmountField.value)) {
          return undefined;
        }
        const parsed = parseLocaleNumber(musicThresholdBeforeAmountField.value);
        return Number.isFinite(parsed) ? parsed : undefined;
      })(),
      basisInvestmentState: basisInvestmentStateField.value || "open",
      extraExpensesIncluded: extraExpensesIncludedField.checked,
    };

    if (
      !snapshotDate ||
      !Number.isFinite(giroAmount) || giroAmount < 0 ||
      !Number.isFinite(tradeRepublicAmount) || tradeRepublicAmount < 0 ||
      !Number.isFinite(scalableAmount) || scalableAmount < 0 ||
      !Number.isFinite(investmentAmount) || investmentAmount < 0 ||
      (monthStartEnabledField.checked && !anchorMonthKey) ||
      (salaryIncludedField.checked && !salaryIncludedForMonthField.value) ||
      (musicIncludedField.checked && !musicIncludedForMonthField.value) ||
      (musicIncludedField.checked && musicThresholdBeforeAmountField.value && !Number.isFinite(parseLocaleNumber(musicThresholdBeforeAmountField.value)))
    ) {
      metaTarget.textContent = "Bitte Datum sowie gueltige Cash-, Investment- und Monatsstart-Werte eintragen (Threshold vor Musik mit Punkt oder Komma ist erlaubt).";
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
      monthlyStatus,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    const nextState = editingId
      ? readWealthSnapshots().map((entry) => (entry.id === editingId ? nextEntry : entry))
      : [...readWealthSnapshots(), nextEntry];
    const result = await saveWealthSnapshots(nextState);
    resetForm();
    applyWorkspaceView("history");
    await refreshFinanceView({
      title: isEditing ? "Ist-Stand aktualisiert" : "Ist-Stand gespeichert",
      detail: `${statusDetailForMode(result.mode)} ${anchorMonthKey ? `Gilt als Monatsanfang für ${anchorMonthKey}.` : `Gilt für ${snapshotDate.slice(0, 7)} als gespeicherter Ist-Stand.`}`,
      tone: result.mode === "project" ? "success" : "warn",
    });
  };

  savePositionUpdateButton.onclick = async () => {
    const snapshotDate = positionUpdateDateField.value || fallbackDate;
    const target = positionUpdateTargetField.value || "investment";
    const amount = Number(positionUpdateAmountField.value);
    const notes = String(positionUpdateNotesField.value ?? "").trim();

    if (!snapshotDate || !Number.isFinite(amount) || amount < 0) {
      positionUpdateMetaTarget.textContent = "Bitte Datum, Position und einen gültigen Ist-Wert eintragen.";
      return;
    }

    const exactSnapshot = exactSnapshotForDate(snapshotDate);
    const baseSnapshot = exactSnapshot ?? latestSnapshotForDate(snapshotDate);
    const suggested = suggestedSnapshotValues(snapshotDate);
    const cashAccounts = {
      giro: Number(suggested.cashAccounts.giro ?? 0),
      cash: Number(suggested.cashAccounts.cash ?? 0),
      savings: Number(suggested.cashAccounts.savings ?? 0),
    };
    let investmentAmount = Number(suggested.investmentAmount ?? 0);

    if (target === "investment") {
      investmentAmount = amount;
    } else if (target === "giro" || target === "cash" || target === "savings") {
      cashAccounts[target] = amount;
    }

    const cashAmount = roundCurrency(cashAccounts.giro + cashAccounts.cash + cashAccounts.savings);
    const nextEntry = {
      id: exactSnapshot?.id ?? `wealth-snapshot-${Date.now()}`,
      snapshotDate,
      cashAccounts,
      cashAmount,
      investmentAmount,
      anchorMonthKey: exactSnapshot?.anchorMonthKey,
      monthlyStatus: exactSnapshot?.monthlyStatus ?? baseSnapshot?.monthlyStatus,
      notes: notes || `${wealthPositionLabels[target] ?? target} aktualisiert. Rest aus letztem Ist-Stand übernommen.`,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    if (!confirmAction(
      `${wealthPositionLabels[target] ?? target} für ${formatDisplayDate(snapshotDate)} wirklich auf ${euro.format(amount)} aktualisieren? Alle anderen Positionen bleiben aus dem letzten Ist-Stand übernommen.`,
    )) {
      return;
    }

    const nextState = exactSnapshot
      ? readWealthSnapshots().map((entry) => (entry.id === exactSnapshot.id ? nextEntry : entry))
      : [...readWealthSnapshots(), nextEntry];
    const result = await saveWealthSnapshots(nextState);
    resetPositionUpdateForm();
    applyWorkspaceView("history");
    await refreshFinanceView({
      title: "Positions-Istwert gespeichert",
      detail: `${statusDetailForMode(result.mode)} ${wealthPositionLabels[target] ?? target} für ${snapshotDate.slice(0, 7)} aktualisiert.`,
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
