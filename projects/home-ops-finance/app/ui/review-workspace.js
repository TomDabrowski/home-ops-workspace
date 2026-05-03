// Review workspace UI surfaces for reconciliation, imports and manual mapping.
// app.js should call into these renderers rather than owning the whole review workflow inline.

export function renderImportsWorkspace(importDraft, review, deps) {
  const {
    setText,
    formatMonthLabel,
    isManualMusicIncomeEntry,
    incomeStreamLabel,
    euro,
    sourcePreview,
    isManualExpenseEntry,
    expenseCategoryLabel,
    renderEntryMappings,
    developerModeEnabled,
    performDevImportEntryDeleteIfConfirmed,
  } = deps;

  setText("importsCurrentMonthLabel", formatMonthLabel(review.row.monthKey));

  const importedIncomeTarget = document.getElementById("importsIncomeList");
  const importedExpenseTarget = document.getElementById("importsExpenseList");
  if (importedIncomeTarget) {
    const importedIncome = review.incomeEntries.filter((entry) => !isManualMusicIncomeEntry(entry));
    importedIncomeTarget.innerHTML = importedIncome.length > 0
      ? importedIncome.map((entry) => {
        const devDeleteButton = developerModeEnabled
          ? `<div class="mapping-card-actions"><button type="button" class="pill pill-danger dev-delete-import-entry" aria-label=\"Importierte Einnahme aus import-draft.json entfernen\">Aus import-draft entfernen (Dev)</button></div>`
          : "";
        return `
          <article class="mapping-card" data-mapping-card-kind="imports-income" data-mapping-card-id="${encodeURIComponent(entry.id)}">
            <div class="mapping-card-head">
              <div>
                <strong>${incomeStreamLabel(importDraft, entry.incomeStreamId)}</strong>
                <p>${entry.entryDate} · ${euro.format(entry.amount)}</p>
              </div>
              ${devDeleteButton}
            </div>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `;
      }).join("")
      : `<p class="empty-state">Keine importierten Einnahmen in diesem Monat.</p>`;
  }

  if (importedExpenseTarget) {
    const importedExpenses = review.expenseEntries.filter((entry) => !isManualExpenseEntry(entry));
    importedExpenseTarget.innerHTML = importedExpenses.length > 0
      ? importedExpenses.map((entry) => {
        const devDeleteButton = developerModeEnabled
          ? `<div class="mapping-card-actions"><button type="button" class="pill pill-danger dev-delete-import-entry" aria-label=\"Importierte Ausgabe aus import-draft.json entfernen\">Aus import-draft entfernen (Dev)</button></div>`
          : "";
        return `
          <article class="mapping-card" data-mapping-card-kind="imports-expense" data-mapping-card-id="${encodeURIComponent(entry.id)}">
            <div class="mapping-card-head">
              <div>
                <strong>${entry.description}</strong>
                <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${expenseCategoryLabel(importDraft, entry.expenseCategoryId)}</p>
              </div>
              ${devDeleteButton}
            </div>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `;
      }).join("")
      : `<p class="empty-state">Keine importierten Ausgaben in diesem Monat.</p>`;
  }

  if (developerModeEnabled && typeof performDevImportEntryDeleteIfConfirmed === "function") {
    for (const target of [importedIncomeTarget, importedExpenseTarget]) {
      if (!target) {
        continue;
      }

      const cards = target.querySelectorAll("article.mapping-card[data-mapping-card-kind^=\"imports-\"]");
      for (const card of cards) {
        const encodedId = card.getAttribute("data-mapping-card-id");
        const scope = card.getAttribute("data-mapping-card-kind");

        if (!(scope === "imports-income" || scope === "imports-expense") || encodedId == null) {
          continue;
        }

        let resolvedEntryId;
        try {
          resolvedEntryId = decodeURIComponent(encodedId);
        } catch (_error) {
          continue;
        }

        const kind = scope === "imports-income" ? "income" : "expense";
        const labelCell = card.querySelector(".mapping-card-head strong");
        const detailCell = card.querySelector(".mapping-card-head p");

        let confirmationSummary;
        if (labelCell instanceof HTMLElement && detailCell instanceof HTMLElement) {
          confirmationSummary = `${labelCell.textContent ?? ""} · ${detailCell.textContent ?? ""}`.trim();
        } else {
          confirmationSummary = resolvedEntryId;
        }

        const button = card.querySelector("button.dev-delete-import-entry");

        if (!(button instanceof HTMLElement)) {
          continue;
        }

        button.onclick = () =>
          performDevImportEntryDeleteIfConfirmed({
            kind,
            id: resolvedEntryId,
            confirmationSummary,
          });
      }
    }
  }

  renderEntryMappings(importDraft, review);
}

export function renderReconciliation(row, deps) {
  const {
    reconciliationForMonth,
    reconciliationPersistence,
    formatHistoryTimestamp,
    confirmAction,
    saveReconciliationForMonth,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const statusSelect = document.getElementById("reconciliationStatus");
  const noteField = document.getElementById("reconciliationNote");
  const actionsTarget = document.getElementById("reconciliationActions");
  const metaTarget = document.getElementById("reconciliationMeta");
  const saveButton = document.getElementById("saveReconciliationButton");

  if (!statusSelect || !noteField || !actionsTarget || !metaTarget || !saveButton) {
    return;
  }

  const reconciliation = reconciliationForMonth(row);
  statusSelect.value = reconciliation.status;
  noteField.value = reconciliation.note;

  if (reconciliation.actions.length === 0) {
    actionsTarget.innerHTML = `<p class="empty-state">Keine offenen Aktionen vorgeschlagen. Du kannst den Monat direkt als erledigt markieren und eine kurze Notiz hinterlegen.</p>`;
  } else {
    actionsTarget.innerHTML = reconciliation.actions
      .map(
        (action, index) => `
          <div class="reconciliation-action">
            <label>
              <input type="checkbox" data-action-index="${index}" ${action.done ? "checked" : ""}>
              <span>${action.label}</span>
            </label>
            <p>${action.suggestion}</p>
          </div>
        `,
      )
      .join("");
  }

  const persistenceLabel = reconciliationPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = reconciliation.updatedAt
    ? `Zuletzt gespeichert: ${formatHistoryTimestamp(reconciliation.updatedAt)} · Speicherort: ${persistenceLabel}`
    : `Noch nicht gespeichert · Speicherort: ${persistenceLabel}`;

  saveButton.onclick = async () => {
    if (!confirmAction(`Reconciliation für ${row.monthKey} wirklich speichern?`)) {
      return;
    }

    const nextValue = {
      status: statusSelect.value,
      note: noteField.value.trim(),
      actions: reconciliation.actions.map((action, index) => {
        const checkbox = actionsTarget.querySelector(`input[data-action-index="${index}"]`);
        return {
          ...action,
          done: Boolean(checkbox?.checked),
        };
      }),
    };

    if (nextValue.actions.length > 0 && nextValue.actions.every((action) => action.done) && nextValue.status === "open") {
      nextValue.status = "resolved";
      statusSelect.value = "resolved";
    }

    const result = await saveReconciliationForMonth(row.monthKey, nextValue);
    await refreshFinanceView({
      title: `Prüfstatus für ${row.monthKey} gespeichert`,
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

export function renderEntryMappings(importDraft, review, deps) {
  const {
    buildCategoryOptions,
    incomeMappingForEntry,
    expenseMappingForEntry,
    incomeStreamLabel,
    euro,
    sourcePreview,
    optionMarkup,
    accountOptions,
    expenseCategoryLabel,
    readMappingState,
    mappingPersistence,
    formatHistoryTimestamp,
    confirmAction,
    saveMappings,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const incomeTarget = document.getElementById("incomeMappingRows");
  const expenseTarget = document.getElementById("expenseMappingRows");
  const metaTarget = document.getElementById("mappingMeta");
  const saveButton = document.getElementById("saveMappingButton");

  if (!incomeTarget || !expenseTarget || !metaTarget || !saveButton) {
    return;
  }

  const incomeOptions = buildCategoryOptions(importDraft.incomeStreams);
  const expenseOptions = buildCategoryOptions(importDraft.expenseCategories);

  if (review.incomeEntries.length === 0) {
    incomeTarget.innerHTML = `<p class="empty-state">Keine Einnahmen zum Korrigieren in diesem Monat.</p>`;
  } else {
    incomeTarget.innerHTML = review.incomeEntries
      .map((entry) => {
        const mapping = incomeMappingForEntry(entry);
        return `
          <div class="mapping-card">
            <div class="mapping-card-head">
              <div>
                <strong>${incomeStreamLabel(importDraft, entry.incomeStreamId)}</strong>
                <p>${entry.entryDate} · ${euro.format(entry.amount)}</p>
              </div>
            </div>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
            <div class="mapping-fields">
              <label class="select-wrap">
                <span>Kategorie</span>
                <select data-mapping-category="${entry.id}">
                  ${optionMarkup(incomeOptions, mapping.categoryId)}
                </select>
              </label>
              <label class="select-wrap">
                <span>Zielkonto</span>
                <select data-mapping-account="${entry.id}">
                  ${optionMarkup(accountOptions, mapping.accountId)}
                </select>
              </label>
              <label class="mapping-check">
                <input type="checkbox" data-mapping-reviewed="${entry.id}" ${mapping.reviewed ? "checked" : ""}>
                <span>Geprüft</span>
              </label>
            </div>
          </div>
        `;
      })
      .join("");
  }

  if (review.expenseEntries.length === 0) {
    expenseTarget.innerHTML = `<p class="empty-state">Keine Ausgaben zum Korrigieren in diesem Monat.</p>`;
  } else {
    expenseTarget.innerHTML = review.expenseEntries
      .map((entry) => {
        const mapping = expenseMappingForEntry(entry);
        return `
          <div class="mapping-card">
            <div class="mapping-card-head">
              <div>
                <strong>${entry.description}</strong>
                <p>${entry.entryDate} · ${euro.format(entry.amount)}</p>
              </div>
            </div>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
            <div class="mapping-fields">
              <label class="select-wrap">
                <span>Kategorie</span>
                <select data-mapping-category="${entry.id}">
                  ${optionMarkup(expenseOptions, mapping.categoryId)}
                </select>
              </label>
              <label class="select-wrap">
                <span>Zielkonto</span>
                <select data-mapping-account="${entry.id}">
                  ${optionMarkup(accountOptions, mapping.accountId)}
                </select>
              </label>
              <label class="mapping-check">
                <input type="checkbox" data-mapping-reviewed="${entry.id}" ${mapping.reviewed ? "checked" : ""}>
                <span>Geprüft</span>
              </label>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const mappingState = readMappingState();
  const monthEntryIds = [...review.incomeEntries, ...review.expenseEntries].map((entry) => entry.id);
  const monthMappings = monthEntryIds.map((id) => mappingState[id]).filter(Boolean);
  const reviewedCount = monthMappings.filter((entry) => entry.reviewed).length;
  const latestUpdate = monthMappings
    .map((entry) => entry.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  const persistenceLabel = mappingPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = latestUpdate
    ? `${reviewedCount}/${monthEntryIds.length} Zeilen geprüft · Zuletzt gespeichert: ${formatHistoryTimestamp(latestUpdate)} · Speicherort: ${persistenceLabel}`
    : `${reviewedCount}/${monthEntryIds.length} Zeilen geprüft · noch keine Mapping-Korrekturen gespeichert · Speicherort: ${persistenceLabel}`;

  saveButton.onclick = async () => {
    if (!confirmAction(`Mappings für ${review.row.monthKey} wirklich speichern?`)) {
      return;
    }

    const result = await saveMappings([...review.incomeEntries, ...review.expenseEntries]);
    await refreshFinanceView({
      title: `Mappings für ${review.row.monthKey} gespeichert`,
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}
