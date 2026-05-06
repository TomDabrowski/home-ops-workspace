// Month review UI surfaces live here so app.js can stay the composition root
// instead of also owning every list/detail renderer for the review workspace.

/** Uses the monthly-engine Tagesgeld withdrawal field, derived from the existing monthly-plan row. */
export function renderMonthTagesgeldWithdrawalHint(review, deps) {
  const { euro, roundCurrency, escapeHtml, giroAccountLabel } = deps;
  const target = document.getElementById("monthTagesgeldWithdrawalHint");
  if (!target) {
    return;
  }

  const net = Number(review.row.netAfterImportedFlows ?? 0);
  const shortfall = roundCurrency(Number(review.row.requiredTagesgeldWithdrawalAmount ?? (net < 0 ? -net : 0)));
  const monthKey = String(review.row.monthKey ?? "");
  const checkingLabel = escapeHtml(review.row.requiredTagesgeldWithdrawalDestinationLabel ?? giroAccountLabel ?? "Girokonto");

  if (shortfall > 0.009) {
    target.className = "mapping-card month-data-status-card month-tagesgeld-withdrawal-hint is-warn";
    target.innerHTML = `
      <div class="mapping-card-head">
        <strong>Tagesgeld-Entnahme für den Monatsplan</strong>
      </div>
      <p class="section-copy">
        Für <strong>${escapeHtml(monthKey)}</strong> übersteigen die Monatsausgaben das, was aus Hauptgehalt-Rest und geplanten Zuflüssen übrig bleibt —
        der Saldo „Übrig nach allem“ liegt bei <strong>${euro.format(net)}</strong>.
        Plane voraussichtlich <strong>${euro.format(shortfall)}</strong> vom <strong>Tagesgeld</strong> auf <strong>${checkingLabel}</strong>.
      </p>
      <p class="mapping-source">Zweck: Ausgleich des Monatsdefizits und Deckung laufender Monatskosten.</p>
    `;
    return;
  }

  target.className = "mapping-card month-data-status-card month-tagesgeld-withdrawal-hint is-ok";
  target.innerHTML = `
    <div class="mapping-card-head">
      <strong>Tagesgeld und Monatsplan</strong>
    </div>
    <p class="section-copy">
      Für <strong>${escapeHtml(monthKey)}</strong> ist keine zusätzliche Entnahme aus dem Tagesgeld nötig (Übrig nach allem: ${euro.format(net)}).
    </p>
  `;
}

export function renderMonthSourceStats(review, deps) {
  const { roundCurrency, isManualExpenseEntry, renderRows, euro } = deps;

  const manualExpenseAmount = roundCurrency(
    review.expenseEntries
      .filter((entry) => isManualExpenseEntry(entry))
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
  );
  const importedExpenseAmount = roundCurrency(
    Math.max(0, Number(review.row.importedExpenseAmount ?? 0) - manualExpenseAmount),
  );
  renderRows("monthReviewSourceStats", [
    ["Übrig aus Hauptgehalt", euro.format(review.row.baselineAvailableAmount)],
    ["Zusätzliche Einnahmen", euro.format(review.row.importedIncomeAvailableAmount)],
    ["Importierte Ausgaben im Monat", euro.format(importedExpenseAmount)],
    ["Manuelle Ausgaben im Monat", euro.format(manualExpenseAmount)],
    [
      "Tagesgeld-Entnahme",
      Number(review.row.requiredTagesgeldWithdrawalAmount ?? 0) > 0
        ? `${euro.format(review.row.requiredTagesgeldWithdrawalAmount)} -> ${review.row.requiredTagesgeldWithdrawalDestinationLabel ?? "Girokonto"}`
        : "Nicht nötig",
    ],
    ["Übrig nach allem", euro.format(review.row.netAfterImportedFlows)],
  ], ([label, value]) => `
    <tr>
      <td>${label}</td>
      <td>${value}</td>
    </tr>
  `);
}

function incomeEntryDateForDatetimeLocal(value) {
  const raw = String(value ?? "");
  if (raw.length >= 16) {
    return raw.slice(0, 16);
  }
  if (raw.length >= 10) {
    return `${raw.slice(0, 10)}T12:00`;
  }
  return "";
}

export function renderMonthIncomeList(importDraft, review, deps) {
  const {
    listTargetId = "monthUnifiedIncomeList",
    incomeListScope = "month",
    incomeEntryFilter,
    isManualMusicIncomeEntry,
    getExpandedMonthIncomeKey,
    setExpandedMonthIncomeKey,
    incomeStreamLabel,
    euro,
    unifiedEntrySourceLabel,
    escapeHtml,
    monthFromDate,
    sourcePreview,
    rerenderSelectedMonthContext,
    readMonthlyMusicIncomeOverrides,
    showStatus,
    musicIncomeProfileForMonth,
    roundCurrency,
    saveMonthlyMusicIncomeOverrides,
    saveImportedIncomeMappingCorrection,
    buildCategoryOptions,
    optionMarkup,
    accountOptions,
    refreshFinanceView,
    statusDetailForMode,
    confirmAction,
  } = deps;

  const expandToken = (id) => `${incomeListScope}/${id}`;
  const target = document.getElementById(listTargetId);
  if (!target) {
    return;
  }

  const rawEntries = [...review.incomeEntries];
  const entries = (typeof incomeEntryFilter === "function" ? rawEntries.filter(incomeEntryFilter) : rawEntries).sort((left, right) =>
    String(left.entryDate).localeCompare(String(right.entryDate)),
  );
  if (entries.length === 0) {
    target.innerHTML = `<p class="empty-state">Keine Einnahmen für diesen Monat.</p>`;
    return;
  }

  const incomeStreamOptions = buildCategoryOptions(importDraft.incomeStreams ?? []);

  target.innerHTML = entries.map((entry) => {
    const isManual = isManualMusicIncomeEntry(entry);
    const expanded = getExpandedMonthIncomeKey() === expandToken(entry.id);
    const label = incomeStreamLabel(importDraft, entry.incomeStreamId);
    return `
      <article class="mapping-card ${expanded ? "is-expanded" : ""}">
        <div class="mapping-card-head">
          <div>
            <strong>${label}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${unifiedEntrySourceLabel(entry, "income")}</p>
          </div>
          <div class="filter-group">
            <button class="pill" type="button" data-month-income-toggle="${entry.id}" data-income-list-scope="${escapeHtml(incomeListScope)}">${expanded ? "Schließen" : isManual ? "Bearbeiten" : "Bearbeiten"}</button>
          </div>
        </div>
        ${expanded ? (
          isManual
            ? `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap currency-wrap">
                  <span>Musik netto</span>
                  <input type="number" min="0" step="0.01" data-month-income-amount="${entry.id}" value="${escapeHtml(entry.amount)}">
                </label>
                <label class="select-wrap">
                  <span>Monat</span>
                  <input type="month" data-month-income-date="${entry.id}" value="${escapeHtml(entry.monthKey ?? monthFromDate(entry.entryDate))}">
                </label>
                <label class="select-wrap planner-span-two">
                  <span>Notiz</span>
                  <input type="text" data-month-income-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}">
                </label>
              </div>
              <div class="filter-group">
                <button class="pill is-active" type="button" data-month-income-save="${entry.id}">Speichern</button>
                <button class="pill pill-danger" type="button" data-month-income-delete="${entry.id}">Löschen</button>
              </div>
            `
            : `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Einnahme-Kategorie</span>
                  <select data-import-income-stream="${entry.id}">${optionMarkup(incomeStreamOptions, entry.incomeStreamId)}</select>
                </label>
                <label class="select-wrap currency-wrap">
                  <span>Betrag brutto</span>
                  <input type="number" min="0" step="0.01" data-import-income-amount="${entry.id}" value="${escapeHtml(entry.amount)}">
                </label>
                <label class="select-wrap">
                  <span>Datum / Zeit</span>
                  <input type="datetime-local" data-import-income-entrydate="${entry.id}" value="${escapeHtml(incomeEntryDateForDatetimeLocal(entry.entryDate))}">
                </label>
                <label class="select-wrap">
                  <span>Zielkonto</span>
                  <select data-import-income-account="${entry.id}">${optionMarkup(accountOptions, entry.accountId || "giro")}</select>
                </label>
                <label class="select-wrap planner-span-two">
                  <span>Notiz</span>
                  <input type="text" data-import-income-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}">
                </label>
              </div>
              <p class="mapping-source">Änderungen landen in den Import-Mappings (Projektdatei oder Browser-Fallback) und überschreiben die importierte Zeile für diese Ansicht.</p>
              <div class="filter-group">
                <button class="pill is-active" type="button" data-import-income-save="${entry.id}">Speichern</button>
              </div>
            `
        ) : ""}
      </article>
    `;
  }).join("");

  for (const button of target.querySelectorAll("[data-month-income-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-month-income-toggle");
      const scope = button.getAttribute("data-income-list-scope") || "month";
      const token = `${scope}/${id}`;
      setExpandedMonthIncomeKey(getExpandedMonthIncomeKey() === token ? null : token);
      rerenderSelectedMonthContext();
    });
  }

  for (const button of target.querySelectorAll("[data-month-income-save]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-income-save");
      const source = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!source) {
        return;
      }

      const amount = Number(target.querySelector(`[data-month-income-amount="${id}"]`)?.value);
      const selectedMonthKey = target.querySelector(`[data-month-income-date="${id}"]`)?.value || review.row.monthKey;
      const notes = target.querySelector(`[data-month-income-notes="${id}"]`)?.value?.trim() ?? "";
      if (!Number.isFinite(amount) || amount < 0) {
        showStatus("Musik-Istwert unvollständig", "Bitte einen gültigen Betrag eintragen.", "warn");
        return;
      }

      const collidingEntry = readMonthlyMusicIncomeOverrides().find((item) =>
        item.id !== id &&
        item.isActive !== false &&
        (item.monthKey ?? monthFromDate(item.entryDate)) === selectedMonthKey,
      );
      const nextEntry = {
        ...source,
        id: collidingEntry?.id ?? source.id,
        monthKey: selectedMonthKey,
        entryDate: `${selectedMonthKey}-01`,
        amount,
        reserveAmount: 0,
        availableAmount: amount,
        notes,
        updatedAt: new Date().toISOString(),
      };
      const nextState = readMonthlyMusicIncomeOverrides().map((item) => {
        const itemMonthKey = item.monthKey ?? monthFromDate(item.entryDate);
        if (item.id === nextEntry.id) {
          return nextEntry;
        }
        if (item.id !== nextEntry.id && item.isActive !== false && itemMonthKey === selectedMonthKey) {
          return { ...item, isActive: false, updatedAt: nextEntry.updatedAt };
        }
        return item.id === id ? { ...item, isActive: false, updatedAt: nextEntry.updatedAt } : item;
      });
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      setExpandedMonthIncomeKey(null);
      await refreshFinanceView({
        title: "Musik-Istwert aktualisiert",
        detail: `${statusDetailForMode(result.mode)} ${euro.format(amount)} netto gespeichert.`,
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-month-income-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-income-delete");
      const source = readMonthlyMusicIncomeOverrides().find((item) => item.id === id);
      if (!source || !confirmAction(`Musik-Istwert ${euro.format(source.amount)} für ${source.monthKey} wirklich löschen?`)) {
        return;
      }

      const nextState = readMonthlyMusicIncomeOverrides().map((item) =>
        item.id === id ? { ...item, isActive: false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      setExpandedMonthIncomeKey(null);
      await refreshFinanceView({
        title: "Musik-Istwert gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-import-income-save]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-import-income-save");
      const entry = entries.find((item) => item.id === id);
      if (!entry) {
        return;
      }

      const incomeStreamId = target.querySelector(`[data-import-income-stream="${id}"]`)?.value;
      const amount = Number(target.querySelector(`[data-import-income-amount="${id}"]`)?.value);
      let entryDate = target.querySelector(`[data-import-income-entrydate="${id}"]`)?.value?.trim() ?? "";
      const accountId = target.querySelector(`[data-import-income-account="${id}"]`)?.value || "giro";
      const notes = target.querySelector(`[data-import-income-notes="${id}"]`)?.value?.trim() ?? "";

      if (!incomeStreamId || !Number.isFinite(amount) || amount <= 0) {
        showStatus("Einnahme unvollständig", "Bitte Kategorie und einen positiven Betrag eintragen.", "warn");
        return;
      }
      if (!entryDate) {
        showStatus("Einnahme unvollständig", "Bitte Datum und Uhrzeit setzen.", "warn");
        return;
      }

      if (entryDate.length === 16) {
        entryDate = `${entryDate}:00`;
      }

      const result = await saveImportedIncomeMappingCorrection(entry, {
        incomeStreamId,
        amount,
        entryDate,
        accountId,
        notes,
      });
      setExpandedMonthIncomeKey(null);
      await refreshFinanceView({
        title: "Importierte Einnahme angepasst",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }
}

export function renderMonthExpenseList(importDraft, review, deps) {
  const {
    listTargetId = "monthUnifiedExpenseList",
    expenseListScope = "month",
    expenseEntryFilter,
    isManualExpenseEntry,
    getExpandedMonthExpenseKey,
    setExpandedMonthExpenseKey,
    euro,
    expenseCategoryLabel,
    unifiedEntrySourceLabel,
    escapeHtml,
    sourcePreview,
    optionMarkup,
    buildCategoryOptions,
    accountOptions,
    rerenderSelectedMonthContext,
    readMonthlyExpenseOverrides,
    showStatus,
    monthFromDate,
    saveMonthlyExpenseOverrides,
    saveImportedExpenseMappingCorrection,
    refreshFinanceView,
    statusDetailForMode,
    confirmAction,
  } = deps;

  const expandToken = (id) => `${expenseListScope}/${id}`;
  const target = document.getElementById(listTargetId);
  if (!target) {
    return;
  }

  const rawEntries = [...review.expenseEntries];
  const entries = (typeof expenseEntryFilter === "function" ? rawEntries.filter(expenseEntryFilter) : rawEntries).sort((left, right) =>
    String(left.entryDate).localeCompare(String(right.entryDate)),
  );
  if (entries.length === 0) {
    target.innerHTML = `<p class="empty-state">Keine Ausgaben für diesen Monat.</p>`;
    return;
  }

  target.innerHTML = entries.map((entry) => {
    const isManual = isManualExpenseEntry(entry);
    const expanded = getExpandedMonthExpenseKey() === expandToken(entry.id);
    const entryDateValue = String(entry.entryDate ?? "").slice(0, 10);
    return `
      <article class="mapping-card ${expanded ? "is-expanded" : ""}">
        <div class="mapping-card-head">
          <div>
            <strong>${entry.description}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${expenseCategoryLabel(importDraft, entry.expenseCategoryId)} · ${unifiedEntrySourceLabel(entry, "expense")}</p>
          </div>
          <div class="filter-group">
            <button class="pill" type="button" data-month-expense-toggle="${entry.id}" data-expense-list-scope="${escapeHtml(expenseListScope)}">${expanded ? "Schließen" : isManual ? "Bearbeiten" : "Bearbeiten"}</button>
          </div>
        </div>
        ${expanded ? (
          isManual
            ? `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Beschreibung</span>
                  <input type="text" data-month-expense-description="${entry.id}" value="${escapeHtml(entry.description)}">
                </label>
                <label class="select-wrap currency-wrap">
                  <span>Betrag</span>
                  <input type="number" min="0" step="0.01" data-month-expense-amount="${entry.id}" value="${escapeHtml(entry.amount)}">
                </label>
                <label class="select-wrap">
                  <span>Datum</span>
                  <input type="date" data-month-expense-date="${entry.id}" value="${escapeHtml(entryDateValue)}">
                </label>
                <label class="select-wrap">
                  <span>Kategorie</span>
                  <select data-month-expense-category="${entry.id}">${optionMarkup(buildCategoryOptions(importDraft.expenseCategories), entry.expenseCategoryId || "other")}</select>
                </label>
                <label class="select-wrap">
                  <span>Konto</span>
                  <select data-month-expense-account="${entry.id}">${optionMarkup(accountOptions, entry.accountId || "giro")}</select>
                </label>
                <label class="select-wrap">
                  <span>Notiz</span>
                  <input type="text" data-month-expense-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}">
                </label>
              </div>
              <div class="filter-group">
                <button class="pill is-active" type="button" data-month-expense-save="${entry.id}">Speichern</button>
                <button class="pill pill-danger" type="button" data-month-expense-delete="${entry.id}">Löschen</button>
              </div>
            `
            : `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Beschreibung</span>
                  <input type="text" data-import-expense-description="${entry.id}" value="${escapeHtml(entry.description)}">
                </label>
                <label class="select-wrap currency-wrap">
                  <span>Betrag</span>
                  <input type="number" min="0" step="0.01" data-import-expense-amount="${entry.id}" value="${escapeHtml(entry.amount)}">
                </label>
                <label class="select-wrap">
                  <span>Datum</span>
                  <input type="date" data-import-expense-date="${entry.id}" value="${escapeHtml(entryDateValue)}">
                </label>
                <label class="select-wrap">
                  <span>Kategorie</span>
                  <select data-import-expense-category="${entry.id}">${optionMarkup(buildCategoryOptions(importDraft.expenseCategories), entry.expenseCategoryId || "other")}</select>
                </label>
                <label class="select-wrap">
                  <span>Konto</span>
                  <select data-import-expense-account="${entry.id}">${optionMarkup(accountOptions, entry.accountId || "giro")}</select>
                </label>
                <label class="select-wrap">
                  <span>Notiz</span>
                  <input type="text" data-import-expense-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}">
                </label>
              </div>
              <p class="mapping-source">Änderungen landen in den Import-Mappings (Projektdatei oder Browser-Fallback) und überschreiben die importierte Zeile für diese Ansicht.</p>
              <div class="filter-group">
                <button class="pill is-active" type="button" data-import-expense-save="${entry.id}">Speichern</button>
              </div>
            `
        ) : ""}
      </article>
    `;
  }).join("");

  for (const button of target.querySelectorAll("[data-month-expense-toggle]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-month-expense-toggle");
      const scope = button.getAttribute("data-expense-list-scope") || "month";
      const token = `${scope}/${id}`;
      setExpandedMonthExpenseKey(getExpandedMonthExpenseKey() === token ? null : token);
      rerenderSelectedMonthContext();
    });
  }

  for (const button of target.querySelectorAll("[data-month-expense-save]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-expense-save");
      const source = readMonthlyExpenseOverrides().find((item) => item.id === id);
      if (!source) {
        return;
      }

      const description = target.querySelector(`[data-month-expense-description="${id}"]`)?.value?.trim() ?? "";
      const amount = Number(target.querySelector(`[data-month-expense-amount="${id}"]`)?.value);
      const entryDate = target.querySelector(`[data-month-expense-date="${id}"]`)?.value || source.entryDate;
      const categoryId = target.querySelector(`[data-month-expense-category="${id}"]`)?.value || "other";
      const accountId = target.querySelector(`[data-month-expense-account="${id}"]`)?.value || "giro";
      const notes = target.querySelector(`[data-month-expense-notes="${id}"]`)?.value?.trim() ?? "";
      if (!description || !Number.isFinite(amount) || amount <= 0) {
        showStatus("Monatsausgabe unvollständig", "Bitte Beschreibung und positiven Betrag eintragen.", "warn");
        return;
      }

      const nextEntry = {
        ...source,
        monthKey: monthFromDate(entryDate),
        entryDate,
        description,
        amount,
        expenseCategoryId: categoryId,
        accountId,
        notes,
        updatedAt: new Date().toISOString(),
      };

      const nextState = readMonthlyExpenseOverrides().map((item) => (item.id === id ? nextEntry : item));
      const result = await saveMonthlyExpenseOverrides(nextState);
      setExpandedMonthExpenseKey(null);
      await refreshFinanceView({
        title: "Monatsausgabe aktualisiert",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-month-expense-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-month-expense-delete");
      const source = readMonthlyExpenseOverrides().find((item) => item.id === id);
      if (!source || !confirmAction(`Monatsausgabe "${source.description}" vom ${source.entryDate} wirklich löschen?`)) {
        return;
      }

      const nextState = readMonthlyExpenseOverrides().map((item) =>
        item.id === id ? { ...item, isActive: false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMonthlyExpenseOverrides(nextState);
      setExpandedMonthExpenseKey(null);
      await refreshFinanceView({
        title: "Monatsausgabe gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-import-expense-save]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-import-expense-save");
      const entry = entries.find((item) => item.id === id);
      if (!entry) {
        return;
      }

      const description = target.querySelector(`[data-import-expense-description="${id}"]`)?.value?.trim() ?? "";
      const amount = Number(target.querySelector(`[data-import-expense-amount="${id}"]`)?.value);
      const entryDate = target.querySelector(`[data-import-expense-date="${id}"]`)?.value || entry.entryDate;
      const expenseCategoryId = target.querySelector(`[data-import-expense-category="${id}"]`)?.value || "other";
      const accountId = target.querySelector(`[data-import-expense-account="${id}"]`)?.value || "giro";
      const notes = target.querySelector(`[data-import-expense-notes="${id}"]`)?.value?.trim() ?? "";

      if (!description || !Number.isFinite(amount) || amount <= 0) {
        showStatus("Ausgabe unvollständig", "Bitte Beschreibung und positiven Betrag eintragen.", "warn");
        return;
      }

      const result = await saveImportedExpenseMappingCorrection(entry, {
        description,
        amount,
        entryDate,
        expenseCategoryId,
        accountId,
        notes,
      });
      setExpandedMonthExpenseKey(null);
      await refreshFinanceView({
        title: "Importierte Ausgabe angepasst",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }
}

export function renderMonthAllocationGuidance(importDraft, review, deps) {
  const {
    buildMonthAllocationInstructionsFromReview,
    allocationInstructionKey,
    readAllocationActionState,
    formatHistoryTimestamp,
    euro,
    thresholdAccountLabel,
    formatDisplayDate,
    escapeHtml,
    saveAllocationActionState,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const target = document.getElementById("monthAllocationGuidance");
  if (!target) {
    return;
  }

  const instructions = buildMonthAllocationInstructionsFromReview(review, importDraft);

  if (instructions.length === 0) {
    target.innerHTML = `<p class="empty-state">Noch keine konkreten Anweisungen für diesen Monat. Sobald Gehalt, Musik oder Monatswerte vorliegen, erscheint hier die Tagesansicht.</p>`;
    return;
  }

  target.innerHTML = instructions.map((instruction) => {
    const actionKey = allocationInstructionKey(review.row.monthKey, instruction);
    const actionState = readAllocationActionState()[actionKey];
    const isDone = actionState?.done === true;
    const completedAt = actionState?.completedAt ? formatHistoryTimestamp(actionState.completedAt) : "";
    if (instruction.kind === "salary") {
      return `
        <div class="mapping-card">
          <strong>${instruction.title}</strong>
          <p>${euro.format(instruction.toInvestmentAmount)} direkt ins Investment. ${euro.format(instruction.toCashAmount)} bleiben zunächst im Cash-Puffer.</p>
          <p class="mapping-source">Monatslogik für ${review.row.monthKey}. Das ist deine sofortige Aktion beim Gehaltseingang.</p>
          <div class="filter-group">
            <button class="pill ${isDone ? "is-active" : ""}" type="button" data-allocation-done="${escapeHtml(actionKey)}" ${isDone ? "disabled" : ""}>${isDone ? "Erledigt" : "Als erledigt markieren"}</button>
          </div>
          ${isDone ? `<p class="mapping-source">Für diesen Monat erledigt am ${completedAt}.</p>` : ""}
        </div>
      `;
    }

    const thresholdTarget = instruction.thresholdAccountId ? thresholdAccountLabel(instruction.thresholdAccountId) : "dein Cash-Puffer";
    const thresholdReason = instruction.thresholdAmountBeforeEntry !== undefined && instruction.thresholdGapBeforeEntry !== undefined
      ? `${thresholdTarget} liegt am ${formatDisplayDate(instruction.effectiveDate)} vor dem Zufluss bei ${euro.format(instruction.thresholdAmountBeforeEntry)}. Bis zur Schwelle fehlen noch ${euro.format(instruction.thresholdGapBeforeEntry)}.`
      : `Die freie Musik wird zuerst bis zur aktiven Schwelle in ${thresholdTarget} geleitet.`;
    const statusReason = instruction.happenedBeforeMonthStart
      ? `Der Zufluss kam schon vor Monatsbeginn ${review.row.monthKey}, bleibt fachlich aber diesem Monat zugeordnet.`
      : `Das ist die konkrete Verteilung zum Zuflussdatum ${formatDisplayDate(instruction.effectiveDate)}.`;
    return `
      <div class="mapping-card">
        <strong>${instruction.title}</strong>
        <p>${euro.format(instruction.reserveAmount)} für Steuer parken. Von ${euro.format(instruction.availableAmount)} nach Steuer gehen ${euro.format(instruction.toCashAmount)} zu ${thresholdTarget} und ${euro.format(instruction.toInvestmentAmount)} ins Investment.</p>
        <p class="mapping-source">${thresholdReason}</p>
        <p class="mapping-source">${statusReason}</p>
        <div class="filter-group">
          <button class="pill ${isDone ? "is-active" : ""}" type="button" data-allocation-done="${escapeHtml(actionKey)}" ${isDone ? "disabled" : ""}>${isDone ? "Umbuchung erledigt" : "Umbuchung fertig"}</button>
        </div>
        ${isDone ? `<p class="mapping-source">Für diesen Monat erledigt am ${completedAt}.</p>` : ""}
      </div>
    `;
  }).join("");

  for (const button of target.querySelectorAll("[data-allocation-done]")) {
    button.addEventListener("click", async () => {
      const key = button.getAttribute("data-allocation-done");
      if (!key) {
        return;
      }

      const nextState = {
        ...readAllocationActionState(),
        [key]: {
          done: !(readAllocationActionState()[key]?.done === true),
          completedAt: new Date().toISOString(),
        },
      };
      const result = await saveAllocationActionState(nextState);
      await refreshFinanceView({
        title: nextState[key].done ? "Anweisung als erledigt markiert" : "Anweisung wieder geöffnet",
        detail: `${statusDetailForMode(result.mode)} Deine Ist-Stände bleiben davon unverändert.`,
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }
}
