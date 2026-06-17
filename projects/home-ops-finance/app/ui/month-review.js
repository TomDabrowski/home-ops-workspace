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
    target.className = "month-tagesgeld-withdrawal-hint is-warn";
    target.innerHTML = `
      <ui5-message-strip design="Warning" hide-close-button class="month-message-strip">
        <strong>Tagesgeld-Entnahme für den Monatsplan</strong><br>
        Für <strong>${escapeHtml(monthKey)}</strong> übersteigen die Monatsausgaben das, was aus Hauptgehalt-Rest und geplanten Zuflüssen übrig bleibt —
        der Saldo „Übrig nach allem“ liegt bei <strong>${euro.format(net)}</strong>.
        Plane voraussichtlich <strong>${euro.format(shortfall)}</strong> vom <strong>Tagesgeld</strong> auf <strong>${checkingLabel}</strong>.
        <br><span class="mapping-source">Zweck: Ausgleich des Monatsdefizits und Deckung laufender Monatskosten.</span>
      </ui5-message-strip>
    `;
    return;
  }

  target.className = "month-tagesgeld-withdrawal-hint is-ok";
  target.innerHTML = `
    <ui5-message-strip design="Positive" hide-close-button class="month-message-strip">
      <strong>Tagesgeld und Monatsplan</strong><br>
      Für <strong>${escapeHtml(monthKey)}</strong> ist keine zusätzliche Entnahme aus dem Tagesgeld nötig (Übrig nach allem: ${euro.format(net)}).
    </ui5-message-strip>
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

function normalizeMonthKeyInput(value) {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return "";
  }

  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return "";
  }

  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

function normalizeIsoDateInput(value) {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return "";
  }

  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  function overrideKey(item) {
    const monthKey = item.monthKey ?? monthFromDate(item.entryDate);
    const streamId = item.incomeStreamId ?? "music-income";
    return `${item.id}__${streamId}__${monthKey}`;
  }
  function entryOverrideKey(entry) {
    const monthKey = entry.monthKey ?? monthFromDate(entry.entryDate);
    const streamId = entry.incomeStreamId ?? "music-income";
    return `${entry.id}__${streamId}__${monthKey}`;
  }
  const manualIncomeByKey = new Map(
    readMonthlyMusicIncomeOverrides()
      .filter((item) => (item.incomeStreamId ?? "music-income") === "music-income")
      .map((item) => {
      return [overrideKey(item), item];
      }),
  );
  const entryByRowKey = new Map();

  function rowKeyForEntry(entry, index) {
    return `${entry.id}__${entry.incomeStreamId ?? ""}__${entry.entryDate ?? ""}__${index}`;
  }

  target.innerHTML = entries.map((entry, index) => {
    const rowKey = rowKeyForEntry(entry, index);
    entryByRowKey.set(rowKey, entry);
    const isManual = isManualMusicIncomeEntry(entry);
    const expanded = getExpandedMonthIncomeKey() === expandToken(rowKey);
    const entryMonthKey = entry.monthKey ?? monthFromDate(entry.entryDate);
    const manualOverride = manualIncomeByKey.get(entryOverrideKey(entry));
    const isManualMusicIncome = isManual && entry.incomeStreamId === "music-income";
    const label = isManualMusicIncome
      ? incomeStreamLabel(importDraft, entry.incomeStreamId)
      : (isManual
        ? (manualOverride?.description?.trim() || incomeStreamLabel(importDraft, entry.incomeStreamId))
        : incomeStreamLabel(importDraft, entry.incomeStreamId));
    const amountLabel = isManualMusicIncome ? "Musik netto" : "Betrag";
    return `
      <article class="mapping-card ${expanded ? "is-expanded" : ""}">
        <div class="mapping-card-head">
          <div>
            <strong>${label}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${unifiedEntrySourceLabel(entry, "income")}</p>
          </div>
          <div class="filter-group">
            <ui5-button class="pill" design="${expanded ? "Emphasized" : "Transparent"}" data-month-income-toggle="${escapeHtml(rowKey)}" data-income-list-scope="${escapeHtml(incomeListScope)}">${expanded ? "Schließen" : "Bearbeiten"}</ui5-button>
          </div>
        </div>
        ${expanded ? (
          isManual
            ? `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap currency-wrap">
                  <span>${amountLabel}</span>
                  <ui5-input type="Number" data-month-income-amount="${escapeHtml(rowKey)}" value="${escapeHtml(entry.amount)}"></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Bezeichnung</span>
                  <ui5-input data-month-income-description="${escapeHtml(rowKey)}" value="${escapeHtml(isManualMusicIncome ? "" : (manualOverride?.description ?? ""))}" ${isManualMusicIncome ? "disabled" : ""}></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Monat</span>
                  <ui5-input data-month-income-date="${escapeHtml(rowKey)}" value="${escapeHtml(entry.monthKey ?? monthFromDate(entry.entryDate))}" placeholder="YYYY-MM"></ui5-input>
                </label>
                <label class="select-wrap planner-span-two">
                  <span>Notiz</span>
                  <ui5-input data-month-income-notes="${escapeHtml(rowKey)}" value="${escapeHtml(entry.notes ?? "")}"></ui5-input>
                </label>
              </div>
              <div class="filter-group">
                <ui5-button class="pill is-active" design="Emphasized" data-month-income-save="${escapeHtml(rowKey)}">Speichern</ui5-button>
                <ui5-button class="pill pill-danger" design="Negative" data-month-income-delete="${escapeHtml(rowKey)}">Löschen</ui5-button>
              </div>
            `
            : `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Einnahme-Kategorie</span>
                  <ui5-select data-import-income-stream="${escapeHtml(rowKey)}">${optionMarkup(incomeStreamOptions, entry.incomeStreamId)}</ui5-select>
                </label>
                <label class="select-wrap currency-wrap">
                  <span>Betrag brutto</span>
                  <ui5-input type="Number" data-import-income-amount="${escapeHtml(rowKey)}" value="${escapeHtml(entry.amount)}"></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Datum / Zeit</span>
                  <ui5-input data-import-income-entrydate="${escapeHtml(rowKey)}" value="${escapeHtml(incomeEntryDateForDatetimeLocal(entry.entryDate))}" placeholder="YYYY-MM-DDTHH:mm"></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Zielkonto</span>
                  <ui5-select data-import-income-account="${escapeHtml(rowKey)}">${optionMarkup(accountOptions, entry.accountId || "giro")}</ui5-select>
                </label>
                <label class="select-wrap planner-span-two">
                  <span>Notiz</span>
                  <ui5-input data-import-income-notes="${escapeHtml(rowKey)}" value="${escapeHtml(entry.notes ?? "")}"></ui5-input>
                </label>
              </div>
              <p class="mapping-source">Änderungen landen in den Import-Mappings (Projektdatei oder Browser-Fallback) und überschreiben die importierte Zeile für diese Ansicht.</p>
              <div class="filter-group">
                <ui5-button class="pill is-active" design="Emphasized" data-import-income-save="${escapeHtml(rowKey)}">Speichern</ui5-button>
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
      const rowKey = button.getAttribute("data-month-income-save");
      const entry = rowKey ? entryByRowKey.get(rowKey) : null;
      if (!entry) {
        return;
      }
      const source = readMonthlyMusicIncomeOverrides().find((item) => overrideKey(item) === entryOverrideKey(entry));
      if (!source) {
        return;
      }

      const amount = Number(target.querySelector(`[data-month-income-amount="${rowKey}"]`)?.value);
      const description = target.querySelector(`[data-month-income-description="${rowKey}"]`)?.value?.trim() ?? "";
      const rawMonthKey = target.querySelector(`[data-month-income-date="${rowKey}"]`)?.value ?? "";
      const selectedMonthKey = normalizeMonthKeyInput(rawMonthKey) || normalizeMonthKeyInput(review.row.monthKey);
      const notes = target.querySelector(`[data-month-income-notes="${rowKey}"]`)?.value?.trim() ?? "";
      if (!Number.isFinite(amount) || amount < 0) {
        showStatus("Einnahme unvollständig", "Bitte einen gültigen Betrag eintragen.", "warn");
        return;
      }
      if (!selectedMonthKey) {
        showStatus("Einnahme unvollständig", "Bitte einen gueltigen Monat im Format YYYY-MM eintragen.", "warn");
        return;
      }

      const nextEntry = {
        ...source,
        id: source.id,
        monthKey: selectedMonthKey,
        entryDate: `${selectedMonthKey}-01`,
        description: entry.incomeStreamId === "music-income" ? source.description : description,
        amount,
        reserveAmount: 0,
        availableAmount: amount,
        notes,
        updatedAt: new Date().toISOString(),
      };
      const sourceKey = overrideKey(source);
      const nextState = readMonthlyMusicIncomeOverrides().map((item) => (
        overrideKey(item) === sourceKey ? nextEntry : item
      ));
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      setExpandedMonthIncomeKey(null);
      const successTitle = entry.incomeStreamId === "music-income" ? "Musik-Istwert aktualisiert" : "Einnahme aktualisiert";
      await refreshFinanceView({
        title: successTitle,
        detail: `${statusDetailForMode(result.mode)} ${euro.format(amount)} gespeichert.`,
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-month-income-delete]")) {
    button.addEventListener("click", async () => {
      const rowKey = button.getAttribute("data-month-income-delete");
      const entry = rowKey ? entryByRowKey.get(rowKey) : null;
      const source = entry ? readMonthlyMusicIncomeOverrides().find((item) => overrideKey(item) === entryOverrideKey(entry)) : null;
      const deleteLabel = source?.incomeStreamId === "music-income" ? "Musik-Istwert" : "Einnahme";
      if (!source || !confirmAction(`${deleteLabel} ${euro.format(source.amount)} für ${source.monthKey} wirklich löschen?`)) {
        return;
      }

      const sourceKey = overrideKey(source);
      const nextState = readMonthlyMusicIncomeOverrides().map((item) =>
        overrideKey(item) === sourceKey ? { ...item, isActive: false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMonthlyMusicIncomeOverrides(nextState);
      setExpandedMonthIncomeKey(null);
      await refreshFinanceView({
        title: source.incomeStreamId === "music-income" ? "Musik-Istwert gelöscht" : "Einnahme gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  for (const button of target.querySelectorAll("[data-import-income-save]")) {
    button.addEventListener("click", async () => {
      const rowKey = button.getAttribute("data-import-income-save");
      const entry = rowKey ? entryByRowKey.get(rowKey) : null;
      if (!entry) {
        return;
      }

      const incomeStreamId = target.querySelector(`[data-import-income-stream="${rowKey}"]`)?.value;
      const amount = Number(target.querySelector(`[data-import-income-amount="${rowKey}"]`)?.value);
      let entryDate = target.querySelector(`[data-import-income-entrydate="${rowKey}"]`)?.value?.trim() ?? "";
      const accountId = target.querySelector(`[data-import-income-account="${rowKey}"]`)?.value || "giro";
      const notes = target.querySelector(`[data-import-income-notes="${rowKey}"]`)?.value?.trim() ?? "";

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
            <ui5-button class="pill" design="${expanded ? "Emphasized" : "Transparent"}" data-month-expense-toggle="${entry.id}" data-expense-list-scope="${escapeHtml(expenseListScope)}">${expanded ? "Schließen" : "Bearbeiten"}</ui5-button>
          </div>
        </div>
        ${expanded ? (
          isManual
            ? `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Beschreibung</span>
                  <ui5-input data-month-expense-description="${entry.id}" value="${escapeHtml(entry.description)}"></ui5-input>
                </label>
                <label class="select-wrap currency-wrap">
                  <span>Betrag</span>
                  <ui5-input type="Number" data-month-expense-amount="${entry.id}" value="${escapeHtml(entry.amount)}"></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Datum</span>
                  <ui5-input data-month-expense-date="${entry.id}" value="${escapeHtml(entryDateValue)}" placeholder="YYYY-MM-DD"></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Kategorie</span>
                  <ui5-select data-month-expense-category="${entry.id}">${optionMarkup(buildCategoryOptions(importDraft.expenseCategories), entry.expenseCategoryId || "other")}</ui5-select>
                </label>
                <label class="select-wrap">
                  <span>Konto</span>
                  <ui5-select data-month-expense-account="${entry.id}">${optionMarkup(accountOptions, entry.accountId || "giro")}</ui5-select>
                </label>
                <label class="select-wrap">
                  <span>Notiz</span>
                  <ui5-input data-month-expense-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}"></ui5-input>
                </label>
              </div>
              <div class="filter-group">
                <ui5-button class="pill is-active" design="Emphasized" data-month-expense-save="${entry.id}">Speichern</ui5-button>
                <ui5-button class="pill pill-danger" design="Negative" data-month-expense-delete="${entry.id}">Löschen</ui5-button>
              </div>
            `
            : `
              <div class="mapping-fields month-inline-form">
                <label class="select-wrap">
                  <span>Beschreibung</span>
                  <ui5-input data-import-expense-description="${entry.id}" value="${escapeHtml(entry.description)}"></ui5-input>
                </label>
                <label class="select-wrap currency-wrap">
                  <span>Betrag</span>
                  <ui5-input type="Number" data-import-expense-amount="${entry.id}" value="${escapeHtml(entry.amount)}"></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Datum</span>
                  <ui5-input data-import-expense-date="${entry.id}" value="${escapeHtml(entryDateValue)}" placeholder="YYYY-MM-DD"></ui5-input>
                </label>
                <label class="select-wrap">
                  <span>Kategorie</span>
                  <ui5-select data-import-expense-category="${entry.id}">${optionMarkup(buildCategoryOptions(importDraft.expenseCategories), entry.expenseCategoryId || "other")}</ui5-select>
                </label>
                <label class="select-wrap">
                  <span>Konto</span>
                  <ui5-select data-import-expense-account="${entry.id}">${optionMarkup(accountOptions, entry.accountId || "giro")}</ui5-select>
                </label>
                <label class="select-wrap">
                  <span>Notiz</span>
                  <ui5-input data-import-expense-notes="${entry.id}" value="${escapeHtml(entry.notes ?? "")}"></ui5-input>
                </label>
              </div>
              <p class="mapping-source">Änderungen landen in den Import-Mappings (Projektdatei oder Browser-Fallback) und überschreiben die importierte Zeile für diese Ansicht.</p>
              <div class="filter-group">
                <ui5-button class="pill is-active" design="Emphasized" data-import-expense-save="${entry.id}">Speichern</ui5-button>
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
      const rawEntryDate = target.querySelector(`[data-month-expense-date="${id}"]`)?.value ?? "";
      const entryDate = normalizeIsoDateInput(rawEntryDate) || normalizeIsoDateInput(source.entryDate);
      const categoryId = target.querySelector(`[data-month-expense-category="${id}"]`)?.value || "other";
      const accountId = target.querySelector(`[data-month-expense-account="${id}"]`)?.value || "giro";
      const notes = target.querySelector(`[data-month-expense-notes="${id}"]`)?.value?.trim() ?? "";
      if (!description || !Number.isFinite(amount) || amount <= 0) {
        showStatus("Monatsausgabe unvollständig", "Bitte Beschreibung und positiven Betrag eintragen.", "warn");
        return;
      }
      if (!entryDate) {
        showStatus("Monatsausgabe unvollständig", "Bitte ein gueltiges Datum im Format YYYY-MM-DD eintragen.", "warn");
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
      const thresholdTarget = instruction.thresholdAccountId ? thresholdAccountLabel(instruction.thresholdAccountId) : "dein Cash-Puffer";
      return `
        <div class="mapping-card">
          <strong>${instruction.title}</strong>
          <p>${euro.format(instruction.toInvestmentAmount)} direkt ins Investment. ${euro.format(instruction.toCashAmount)} bleiben zunächst in ${thresholdTarget}.</p>
          <p class="mapping-source">Monatslogik für ${review.row.monthKey}. Das ist deine sofortige Aktion beim Gehaltseingang.</p>
          <div class="filter-group">
            <ui5-button class="pill ${isDone ? "is-active" : ""}" design="${isDone ? "Positive" : "Transparent"}" data-allocation-done="${escapeHtml(actionKey)}" ${isDone ? "disabled" : ""}>${isDone ? "Erledigt" : "Als erledigt markieren"}</ui5-button>
          </div>
          ${isDone ? `<p class="mapping-source">Für diesen Monat erledigt am ${completedAt}.</p>` : ""}
        </div>
      `;
    }

    if (instruction.kind === "expense_reserve") {
      const thresholdTarget = instruction.thresholdAccountId ? thresholdAccountLabel(instruction.thresholdAccountId) : "dein Cash-Puffer";
      const expenseList = (instruction.expenseEntries ?? [])
        .map((entry) => `${formatDisplayDate(entry.entryDate)}: ${escapeHtml(entry.description ?? "Geplante Ausgabe")} ${euro.format(entry.amount ?? 0)}`)
        .join(" · ");
      return `
        <div class="mapping-card">
          <strong>${instruction.title}</strong>
          <p>${euro.format(instruction.toCashAmount)} fuer spaetere Abbuchungen reservieren. Falls die Abbuchung nicht direkt aus ${thresholdTarget} laeuft, bis zum Faelligkeitsdatum auf das Abbuchungskonto legen.</p>
          <p class="mapping-source">${expenseList}</p>
          <p class="mapping-source">Diese Ausgabe ist fachlich dem Monat ${review.row.monthKey} zugeordnet, auch wenn du sie frueher angelegt hast. Das Abbuchungsdatum steuert die Monatsreserve.</p>
          <div class="filter-group">
            <ui5-button class="pill ${isDone ? "is-active" : ""}" design="${isDone ? "Positive" : "Transparent"}" data-allocation-done="${escapeHtml(actionKey)}" ${isDone ? "disabled" : ""}>${isDone ? "Reserviert" : "Als reserviert markieren"}</ui5-button>
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
        <p>${euro.format(instruction.reserveAmount)} für Steuer parken. ${euro.format(instruction.expenseReserveAmount ?? 0)} für Monatsausgaben zurückhalten. Von ${euro.format(instruction.availableAmount)} nach Steuer gehen ${euro.format(instruction.toCashAmount)} zu ${thresholdTarget} und ${euro.format(instruction.toInvestmentAmount)} ins Investment.</p>
        <p class="mapping-source">${thresholdReason}</p>
        <p class="mapping-source">${statusReason}</p>
        <div class="filter-group">
          <ui5-button class="pill ${isDone ? "is-active" : ""}" design="${isDone ? "Positive" : "Transparent"}" data-allocation-done="${escapeHtml(actionKey)}" ${isDone ? "disabled" : ""}>${isDone ? "Umbuchung erledigt" : "Umbuchung fertig"}</ui5-button>
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
