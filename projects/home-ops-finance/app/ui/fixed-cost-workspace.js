// Fixed-cost / baseline override workspace. This keeps the future-plan editing
// flow out of the app shell and groups the list + form behavior in one place.

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

export function renderFixedCostPlanner(importDraft, selectedMonthKey, deps) {
  const {
    readBaselineOverrides,
    baselineCategoryLabel,
    formatDisplayDate,
    euro,
    baselinePersistence,
    currentSelectedMonthKey,
    reviewFocusMonthKey,
    todayIsoDate,
    editorValueFromStoredAmount,
    persistenceModeLabel,
    confirmAction,
    saveBaselineOverrides,
    refreshFinanceView,
    statusDetailForMode,
    storedAmountFromEditorValue,
    baselineTarget,
  } = deps;

  const labelField = document.getElementById("fixedCostLabel");
  const categoryField = document.getElementById("fixedCostCategory");
  const amountLabel = document.getElementById("fixedCostAmountLabel");
  const amountField = document.getElementById("fixedCostAmount");
  const effectiveFromField = document.getElementById("fixedCostEffectiveFrom");
  const endDateWrap = document.getElementById("fixedCostEndDateWrap");
  const endDateField = document.getElementById("fixedCostEndDate");
  const notesField = document.getElementById("fixedCostNotes");
  const saveButton = document.getElementById("saveFixedCostButton");
  const listTarget = document.getElementById("fixedCostList");
  const metaTarget = document.getElementById("fixedCostMeta");

  if (!labelField || !categoryField || !amountLabel || !amountField || !effectiveFromField || !endDateWrap || !endDateField || !notesField || !saveButton || !listTarget || !metaTarget) {
    return;
  }

  const overrides = [...readBaselineOverrides()].sort((left, right) =>
    (left.effectiveFrom ?? "").localeCompare(right.effectiveFrom ?? ""),
  );
  let editingId = saveButton.dataset.editingId ?? "";
  const sourceLineItemId = saveButton.dataset.sourceLineItemId ?? "";

  function updateStopModeUi() {
    const stopMode = saveButton.dataset.stopMode === "true";
    endDateWrap.hidden = !stopMode;
    endDateField.disabled = !stopMode;
    effectiveFromField.disabled = stopMode;
  }

  function updateAmountFieldUi() {
    const isAnnualReserve = categoryField.value === "annual_reserve";
    amountLabel.textContent = isAnnualReserve ? "Jaehrlicher Betrag" : "Betrag pro Monat";
    amountField.placeholder = isAnnualReserve ? "0 pro Jahr" : "0";
  }

  const suggestedMonth =
    selectedMonthKey ??
    currentSelectedMonthKey() ??
    importDraft.monthlyBaselines[importDraft.monthlyBaselines.length - 1]?.monthKey ??
    reviewFocusMonthKey;

  const fixedCostNote = bindAutoNote(
    notesField,
    () => {
      const label = labelField.value.trim() || "Grundplan-Posten";
      const category = baselineCategoryLabel(categoryField.value || "fixed");
      const stopMode = saveButton.dataset.stopMode === "true";
      if (stopMode) {
        return `${label} endet zum ${formatDisplayDate(endDateField.value || todayIsoDate())}.`;
      }
      const effectiveFrom = effectiveFromField.value || suggestedMonth;
      const rawAmount = Number(amountField.value);
      const amount = Number.isFinite(rawAmount) && rawAmount > 0
        ? euro.format(storedAmountFromEditorValue(categoryField.value || "fixed", rawAmount))
        : "offener Betrag";
      return `${label} (${category}) ab ${effectiveFrom}: ${amount}.`;
    },
    [labelField, categoryField, amountField, effectiveFromField, endDateField],
  );

  function resetForm() {
    labelField.value = "";
    categoryField.value = "fixed";
    categoryField.disabled = false;
    amountField.value = "";
    effectiveFromField.value = suggestedMonth;
    endDateField.value = todayIsoDate();
    labelField.readOnly = false;
    saveButton.dataset.editingId = "";
    saveButton.dataset.sourceLineItemId = "";
    saveButton.dataset.stopMode = "";
    saveButton.textContent = "Grundplan-Posten speichern";
    updateStopModeUi();
    updateAmountFieldUi();
    fixedCostNote.refresh(true);
  }

  if (overrides.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch keine zusätzlichen Zukunfts-Fixkosten angelegt.</p>`;
  } else {
    listTarget.innerHTML = overrides
      .map((entry) => {
        const isStopEntry = Number(entry.amount) === 0 && entry.sourceLineItemId;
        return `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${entry.label}</strong>
              <p>${baselineCategoryLabel(entry.category ?? "fixed")} · ab ${entry.effectiveFrom} · ${isStopEntry ? `${entry.endDate ? `gekündigt zum ${formatDisplayDate(entry.endDate)}` : "endet ab diesem Monat"}` : `${euro.format(entry.amount)} pro Monat`} · ${entry.isActive === false ? "deaktiviert" : "aktiv"}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-fixed-cost-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-fixed-cost-toggle="${entry.id}">
                ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
              </button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `;
      })
      .join("");
  }

  const persistenceLabel = persistenceModeLabel(baselinePersistence);
  metaTarget.textContent = overrides.length > 0
    ? `${overrides.length} Grundplan-Aenderungen gespeichert · Speicherort: ${persistenceLabel}`
    : `Noch keine zusätzlichen Grundplan-Aenderungen gespeichert · Speicherort: ${persistenceLabel}`;

  if (!editingId && !sourceLineItemId) {
    effectiveFromField.value = suggestedMonth;
    fixedCostNote.refresh(true);
  }

  for (const button of listTarget.querySelectorAll("[data-fixed-cost-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-fixed-cost-edit");
      const entry = readBaselineOverrides().find((item) => item.id === id);
      if (!entry) return;

      editingId = entry.id;
      saveButton.dataset.editingId = entry.id;
      saveButton.dataset.sourceLineItemId = entry.sourceLineItemId ?? "";
      saveButton.dataset.stopMode = "";
      labelField.value = entry.label ?? "";
      categoryField.value = entry.category ?? "fixed";
      amountField.value = entry.amount > 0 ? String(editorValueFromStoredAmount(categoryField.value, entry.amount)) : "";
      effectiveFromField.value = entry.effectiveFrom ?? suggestedMonth;
      endDateField.value = entry.endDate ?? todayIsoDate();
      fixedCostNote.setManualValue(entry.notes ?? "");
      labelField.readOnly = Boolean(entry.sourceLineItemId);
      saveButton.textContent = "Fixkosten aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${entry.label}`;
      updateStopModeUi();
      updateAmountFieldUi();
    });
  }

  for (const button of listTarget.querySelectorAll("[data-fixed-cost-toggle]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-fixed-cost-toggle");
      if (!id) return;
      const entry = readBaselineOverrides().find((item) => item.id === id);
      if (!entry || !confirmAction(`Fixkosten "${entry.label}" wirklich ${entry.isActive === false ? "aktivieren" : "deaktivieren"}?`)) {
        return;
      }

      const nextState = readBaselineOverrides().map((item) =>
        item.id === id ? { ...item, isActive: entry.isActive === false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveBaselineOverrides(nextState);
      await refreshFinanceView({
        title: `Fixkosten ${entry.isActive === false ? "aktiviert" : "deaktiviert"}`,
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  baselineTarget.onclick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const editButton = target.closest("[data-baseline-edit]");
    if (editButton instanceof HTMLElement) {
      const id = editButton.getAttribute("data-baseline-edit");
      const source = importDraft.baselineLineItems.find((item) => item.id === id);
      if (!source) return;

      saveButton.dataset.editingId = "";
      saveButton.dataset.sourceLineItemId = source.id;
      saveButton.dataset.stopMode = "";
      labelField.value = source.label ?? "";
      categoryField.value = source.category ?? "fixed";
      amountField.value = String(editorValueFromStoredAmount(categoryField.value, source.amount));
      effectiveFromField.value = suggestedMonth;
      labelField.readOnly = true;
      categoryField.disabled = true;
      saveButton.textContent = "Grundplan-Override speichern";
      metaTarget.textContent = `Bearbeitungsmodus aktiv für bestehenden Posten: ${source.label}`;
      fixedCostNote.refresh(true);
      labelField.scrollIntoView({ behavior: "smooth", block: "center" });
      amountField.focus();
      updateStopModeUi();
      updateAmountFieldUi();
      return;
    }

    const stopButton = target.closest("[data-baseline-stop]");
    if (stopButton instanceof HTMLElement) {
      const id = stopButton.getAttribute("data-baseline-stop");
      const source = importDraft.baselineLineItems.find((item) => item.id === id);
      if (!source) return;
      saveButton.dataset.editingId = "";
      saveButton.dataset.sourceLineItemId = source.id;
      saveButton.dataset.stopMode = "true";
      labelField.value = source.label ?? "";
      categoryField.value = source.category ?? "fixed";
      amountField.value = "";
      endDateField.value = todayIsoDate();
      labelField.readOnly = true;
      categoryField.disabled = true;
      saveButton.textContent = "Kündigung speichern";
      metaTarget.textContent = `Kündigungsmodus aktiv für ${source.label}. Wähle jetzt das Kündigungsdatum aus und speichere dann.`;
      fixedCostNote.refresh(true);
      updateStopModeUi();
      updateAmountFieldUi();
      endDateField.scrollIntoView({ behavior: "smooth", block: "center" });
      endDateField.focus();
    }
  };

  saveButton.onclick = async () => {
    const nextEditingId = saveButton.dataset.editingId ?? "";
    const nextSourceLineItemId = saveButton.dataset.sourceLineItemId ?? "";
    const stopMode = saveButton.dataset.stopMode === "true";
    const label = labelField.value.trim();
    const category = categoryField.value || "fixed";
    const rawAmount = Number(amountField.value);
    const effectiveFrom = effectiveFromField.value || suggestedMonth;
    const endDate = endDateField.value || todayIsoDate();
    const notes = notesField.value.trim();

    if (!label) {
      metaTarget.textContent = "Bitte einen Namen für den Grundplan-Posten eintragen.";
      return;
    }

    if (stopMode) {
      if (!confirmAction(`Grundplan-Posten "${label}" wirklich zum ${formatDisplayDate(endDate)} beenden?`)) {
        return;
      }

      const nextEntry = {
        id: nextEditingId || `baseline-stop-${Date.now()}`,
        label,
        amount: 0,
        effectiveFrom,
        sourceLineItemId: nextSourceLineItemId,
        category,
        cadence: "monthly",
        isActive: true,
        endDate,
        notes: notes || `Gekuendigt zum ${formatDisplayDate(endDate)}.`,
        updatedAt: new Date().toISOString(),
      };
      const nextState = [...readBaselineOverrides(), nextEntry];
      const result = await saveBaselineOverrides(nextState);
      resetForm();
      await refreshFinanceView({
        title: "Kündigung gespeichert",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
      return;
    }

    if (!Number.isFinite(rawAmount) || rawAmount < 0) {
      metaTarget.textContent = "Bitte einen gueltigen Betrag eintragen.";
      return;
    }

    const amount = storedAmountFromEditorValue(category, rawAmount);
    const isEditing = Boolean(nextEditingId);
    if (!confirmAction(
      isEditing
        ? `Grundplan-Posten "${label}" wirklich aktualisieren?`
        : `Grundplan-Posten "${label}" wirklich speichern?`,
    )) {
      return;
    }

    const nextEntry = {
      id: nextEditingId || `baseline-override-${Date.now()}`,
      label,
      amount,
      effectiveFrom,
      sourceLineItemId: nextSourceLineItemId || undefined,
      category,
      cadence: "monthly",
      isActive: true,
      notes,
      updatedAt: new Date().toISOString(),
    };
    const nextState = isEditing
      ? readBaselineOverrides().map((item) => (item.id === nextEditingId ? nextEntry : item))
      : [...readBaselineOverrides(), nextEntry];

    const result = await saveBaselineOverrides(nextState);
    resetForm();
    await refreshFinanceView({
      title: isEditing ? "Grundplan-Posten aktualisiert" : "Grundplan-Posten gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };

  updateStopModeUi();
  categoryField.addEventListener("change", updateAmountFieldUi);
  updateAmountFieldUi();
}
