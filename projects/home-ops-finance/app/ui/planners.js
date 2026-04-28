// Planner-oriented UI surfaces: forecast thresholds, salary settings and
// music tax settings. The surrounding app should wire these screens together.

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

export function renderForecastPlanner(importDraft, deps) {
  const {
    readForecastSettings,
    assumptionNumber,
    assumptionString,
    optionMarkup,
    accountOptions,
    forecastPersistence,
    formatHistoryTimestamp,
    euro,
    thresholdAccountLabel,
    confirmAction,
    saveForecastSettings,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const safetyField = document.getElementById("forecastSafetyThreshold");
  const musicField = document.getElementById("forecastMusicThreshold");
  const musicAccountField = document.getElementById("forecastMusicThresholdAccount");
  const notesField = document.getElementById("forecastNotes");
  const metaTarget = document.getElementById("forecastMeta");
  const summaryTarget = document.getElementById("forecastSummary");
  const saveButton = document.getElementById("saveForecastButton");

  if (!safetyField || !musicField || !musicAccountField || !notesField || !metaTarget || !summaryTarget || !saveButton) {
    return;
  }

  const stored = readForecastSettings();
  const safetyThreshold = Number(
    stored?.safetyThreshold ??
    assumptionNumber(importDraft, "safety_threshold", 10000),
  );
  const musicThreshold = Number(
    stored?.musicThreshold ??
    assumptionNumber(importDraft, "music_threshold", safetyThreshold),
  );
  const musicThresholdAccountId =
    String(stored?.musicThresholdAccountId ?? assumptionString(importDraft, "music_threshold_account_id", "savings")) || "savings";

  safetyField.value = String(safetyThreshold);
  musicField.value = String(musicThreshold);
  musicAccountField.innerHTML = optionMarkup(accountOptions, musicThresholdAccountId);
  musicAccountField.value = musicThresholdAccountId;
  notesField.value = stored?.notes ?? "";
  const forecastNote = bindAutoNote(
    notesField,
    () => {
      const selectedAccountId = musicAccountField.value || musicThresholdAccountId;
      const selectedSafetyThreshold = Number(safetyField.value);
      const selectedMusicThreshold = Number(musicField.value);
      return `Cash-Ziel ${euro.format(Number.isFinite(selectedSafetyThreshold) ? selectedSafetyThreshold : safetyThreshold)}, Musik-Schwelle ${euro.format(Number.isFinite(selectedMusicThreshold) ? selectedMusicThreshold : musicThreshold)} auf ${thresholdAccountLabel(selectedAccountId)}.`;
    },
    [safetyField, musicField, musicAccountField],
  );
  if (stored?.notes) {
    forecastNote.setManualValue(stored.notes);
  } else {
    forecastNote.refresh(true);
  }

  const persistenceLabel = forecastPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = stored?.updatedAt
    ? `Zuletzt gespeichert: ${formatHistoryTimestamp(stored.updatedAt)} · Speicherort: ${persistenceLabel}`
    : `Noch keine eigene Schwelle gespeichert · Speicherort: ${persistenceLabel}`;

  function updateSummary() {
    const selectedAccountId = musicAccountField.value || musicThresholdAccountId;
    const selectedSafetyThreshold = Number(safetyField.value);
    const selectedMusicThreshold = Number(musicField.value);
    summaryTarget.innerHTML = [
      `<div class="mapping-card"><strong>Cash-Ziel</strong><p>Bis ${euro.format(Number.isFinite(selectedSafetyThreshold) ? selectedSafetyThreshold : safetyThreshold)} bleibt freies Gehalt im Sicherheitskonto. Darüber wandert der Gehaltsüberschuss automatisch ins Investment.</p></div>`,
      `<div class="mapping-card"><strong>Musik-Schwelle</strong><p>Bis ${euro.format(Number.isFinite(selectedMusicThreshold) ? selectedMusicThreshold : musicThreshold)} füllt freie Musik zuerst ${thresholdAccountLabel(selectedAccountId)} auf. Alles darüber geht ins Investment.</p></div>`,
      `<div class="mapping-card"><strong>Wirkung</strong><p>Für die Musik-Schwelle zählt nur ${thresholdAccountLabel(selectedAccountId)}. Cash auf anderen Konten wird dabei nicht mitgerechnet.</p></div>`,
    ].join("");
  }

  updateSummary();
  musicAccountField.onchange = updateSummary;
  safetyField.oninput = updateSummary;
  musicField.oninput = updateSummary;

  saveButton.onclick = async () => {
    const nextSafetyThreshold = Number(safetyField.value);
    const nextMusicThreshold = Number(musicField.value);
    const nextMusicThresholdAccountId = musicAccountField.value || "savings";
    const notes = notesField.value.trim();

    if (!Number.isFinite(nextSafetyThreshold) || nextSafetyThreshold < 0 || !Number.isFinite(nextMusicThreshold) || nextMusicThreshold < 0) {
      metaTarget.textContent = "Bitte gültige Schwellen eintragen.";
      return;
    }

    if (!confirmAction(`Cash-Ziel ${euro.format(nextSafetyThreshold)}, Musik-Schwelle ${euro.format(nextMusicThreshold)} und ${thresholdAccountLabel(nextMusicThresholdAccountId)} als Schwellenkonto wirklich speichern?`)) {
      return;
    }

    const result = await saveForecastSettings({
      safetyThreshold: nextSafetyThreshold,
      musicThreshold: nextMusicThreshold,
      musicThresholdAccountId: nextMusicThresholdAccountId,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await refreshFinanceView({
      title: "Schwellen gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

export function renderSalaryPlanner(importDraft, deps) {
  const {
    readSalarySettings,
    currentSelectedMonthKey,
    reviewFocusMonthKey,
    euro,
    salaryPersistence,
    formatHistoryTimestamp,
    confirmAction,
    saveSalarySettings,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const amountField = document.getElementById("salaryAmount");
  const effectiveFromField = document.getElementById("salaryEffectiveFrom");
  const notesField = document.getElementById("salaryNotes");
  const metaTarget = document.getElementById("salaryMeta");
  const listTarget = document.getElementById("salaryList");
  const historySummaryTarget = document.getElementById("salaryHistorySummary");
  const saveButton = document.getElementById("saveSalaryButton");

  if (!amountField || !effectiveFromField || !notesField || !metaTarget || !listTarget || !saveButton) {
    return;
  }

  const settings = [...readSalarySettings()].sort((left, right) =>
    (left.effectiveFrom ?? "").localeCompare(right.effectiveFrom ?? ""),
  );
  const suggestedMonth =
    currentSelectedMonthKey() ??
    importDraft.monthlyBaselines.find((entry) => entry.monthKey >= "2026-01")?.monthKey ??
    importDraft.monthlyBaselines.at(-1)?.monthKey ??
    reviewFocusMonthKey;

  function resetForm() {
    amountField.value = "";
    effectiveFromField.value = suggestedMonth;
    salaryNote.refresh(true);
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Gehaltsstand speichern";
  }

  if (!(saveButton.dataset.editingId ?? "")) {
    effectiveFromField.value = suggestedMonth;
  }

  const salaryNote = bindAutoNote(
    notesField,
    () => {
      const amount = Number(amountField.value);
      const effectiveFrom = effectiveFromField.value || suggestedMonth;
      if (Number.isFinite(amount) && amount > 0) {
        return `Gehalt für ${effectiveFrom}: ${euro.format(amount)} netto.`;
      }
      return `Gehalt für ${effectiveFrom}.`;
    },
    [amountField, effectiveFromField],
  );
  if (!(saveButton.dataset.editingId ?? "")) {
    salaryNote.refresh(true);
  }

  if (settings.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch keine eigenen Gehaltsstände gespeichert.</p>`;
  } else {
    listTarget.innerHTML = settings
      .map((entry) => `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${euro.format(entry.netSalaryAmount)} netto</strong>
              <p>${entry.effectiveFrom} · ${entry.isActive === false ? "deaktiviert" : "aktiv"}</p>
            </div>
            <div class="filter-group">
              <button class="pill" type="button" data-salary-edit="${entry.id}">Bearbeiten</button>
              <button class="pill" type="button" data-salary-toggle="${entry.id}">
                ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
              </button>
            </div>
          </div>
          <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
        </div>
      `)
      .join("");
  }

  const persistenceLabel = salaryPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = settings.length > 0
    ? `${settings.length} Gehaltsstände gespeichert · Speicherort: ${persistenceLabel}`
    : `Noch keine Gehaltsänderung gespeichert · Speicherort: ${persistenceLabel}`;
  if (historySummaryTarget) {
    const latestEntry = [...settings]
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))[0];
    historySummaryTarget.textContent = latestEntry
      ? `Zuletzt geändert: ${formatHistoryTimestamp(latestEntry.updatedAt)} · ${euro.format(latestEntry.netSalaryAmount)} für ${latestEntry.effectiveFrom}`
      : "Noch keine Gehaltsänderung gespeichert.";
  }

  for (const button of listTarget.querySelectorAll("[data-salary-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-salary-edit");
      const entry = readSalarySettings().find((item) => item.id === id);
      if (!entry) return;

      saveButton.dataset.editingId = entry.id;
      amountField.value = String(entry.netSalaryAmount ?? "");
      effectiveFromField.value = entry.effectiveFrom ?? suggestedMonth;
      salaryNote.setManualValue(entry.notes ?? "");
      saveButton.textContent = "Gehaltsstand aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${euro.format(entry.netSalaryAmount)} für ${entry.effectiveFrom}`;
    });
  }

  for (const button of listTarget.querySelectorAll("[data-salary-toggle]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-salary-toggle");
      if (!id) return;
      const entry = readSalarySettings().find((item) => item.id === id);
    if (!entry || !confirmAction(`Gehalt ${euro.format(entry.netSalaryAmount)} für ${entry.effectiveFrom} wirklich ${entry.isActive === false ? "aktivieren" : "deaktivieren"}?`)) {
        return;
      }

      const nextState = readSalarySettings().map((item) =>
        item.id === id
          ? { ...item, isActive: item.isActive === false, updatedAt: new Date().toISOString() }
          : item,
      );

      const result = await saveSalarySettings(nextState);
      await refreshFinanceView({
        title: `Gehalt ${entry.isActive === false ? "aktiviert" : "deaktiviert"}`,
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const netSalaryAmount = Number(amountField.value);
    const effectiveFrom = effectiveFromField.value;
    const notes = notesField.value.trim();

    if (!Number.isFinite(netSalaryAmount) || netSalaryAmount <= 0 || !effectiveFrom) {
      metaTarget.textContent = "Bitte Nettogehalt und Monat eintragen.";
      return;
    }

    const existingForMonth = readSalarySettings().find((item) =>
      item.id !== editingId &&
      item.isActive !== false &&
      String(item.effectiveFrom ?? "") === String(effectiveFrom),
    );
    const targetId = editingId || existingForMonth?.id || `salary-${Date.now()}`;
    const isEditing = Boolean(editingId || existingForMonth);
    if (!confirmAction(isEditing
      ? `Gehalt ${euro.format(netSalaryAmount)} für ${effectiveFrom} wirklich aktualisieren?`
      : `Gehalt ${euro.format(netSalaryAmount)} für ${effectiveFrom} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: targetId,
      netSalaryAmount,
      effectiveFrom,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    const nextState = (() => {
      let replaced = false;
      const nextItems = readSalarySettings().map((item) => {
        if (item.id === targetId) {
          replaced = true;
          return nextEntry;
        }
        if (item.id !== targetId && item.isActive !== false && String(item.effectiveFrom ?? "") === String(effectiveFrom)) {
          return { ...item, isActive: false, updatedAt: nextEntry.updatedAt };
        }
        return item.id === editingId ? { ...item, isActive: false, updatedAt: nextEntry.updatedAt } : item;
      });
      return replaced ? nextItems : [...nextItems, nextEntry];
    })();

    const result = await saveSalarySettings(nextState);
    resetForm();
    await refreshFinanceView({
      title: isEditing ? "Gehalt aktualisiert" : "Gehalt gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

export function renderMusicTaxPlanner(importDraft, deps) {
  const {
    readMusicTaxSettings,
    assumptionNumber,
    currentSelectedMonthKey,
    musicTaxPersistence,
    formatHistoryTimestamp,
    currentMonthlyPlan,
    quarterLabel,
    euro,
    confirmAction,
    saveMusicTaxSettings,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const amountField = document.getElementById("musicTaxQuarterlyAmount");
  const effectiveFromField = document.getElementById("musicTaxEffectiveFrom");
  const notesField = document.getElementById("musicTaxNotes");
  const metaTarget = document.getElementById("musicTaxMeta");
  const summaryTarget = document.getElementById("musicTaxSummary");
  const saveButton = document.getElementById("saveMusicTaxButton");

  if (!amountField || !effectiveFromField || !notesField || !metaTarget || !summaryTarget || !saveButton) {
    return;
  }

  const stored = readMusicTaxSettings();
  const workbookDefault = assumptionNumber(importDraft, "music_tax_prepayment_quarterly_amount", 501);
  const currentAmount = Number(stored?.quarterlyPrepaymentAmount ?? workbookDefault);
  const currentEffectiveFrom =
    currentSelectedMonthKey() ??
    stored?.effectiveFrom ??
    importDraft.monthlyBaselines.find((entry) => entry.monthKey >= "2026-01")?.monthKey ??
    "2026-03";

  amountField.value = Number.isFinite(currentAmount) ? String(currentAmount) : String(workbookDefault);
  effectiveFromField.value = currentEffectiveFrom;
  notesField.value = stored?.notes ?? "";
  const musicTaxNote = bindAutoNote(
    notesField,
    () => {
      const amount = Number(amountField.value);
      const effectiveFrom = effectiveFromField.value || currentEffectiveFrom;
      if (Number.isFinite(amount) && amount >= 0) {
        return `Quartals-Steuer-Vorauszahlung ab ${effectiveFrom}: ${euro.format(amount)} pro Quartal.`;
      }
      return `Quartals-Steuer-Vorauszahlung ab ${effectiveFrom}.`;
    },
    [amountField, effectiveFromField],
  );
  if (stored?.notes) {
    musicTaxNote.setManualValue(stored.notes);
  } else {
    musicTaxNote.refresh(true);
  }

  const persistenceLabel = musicTaxPersistence === "project" ? "Projektdatei" : "Browser-Fallback";
  metaTarget.textContent = stored?.updatedAt
    ? `Zuletzt gespeichert: ${formatHistoryTimestamp(stored.updatedAt)} · Speicherort: ${persistenceLabel}`
    : `Noch keine eigene Steuer-Vorauszahlung gespeichert · Speicherort: ${persistenceLabel}`;

  const quarterMonths = currentMonthlyPlan()?.rows
    .map((row) => row.monthKey)
    .filter((monthKey, index, all) =>
      monthKey >= currentEffectiveFrom &&
      ["03", "06", "09", "12"].includes(monthKey.slice(5, 7)) &&
      all.indexOf(monthKey) === index,
    )
    .slice(0, 4) ?? [];

  summaryTarget.innerHTML = [
    `<div class="mapping-card"><strong>Aktuell geplant</strong><p>${euro.format(currentAmount)} pro Quartal ab ${currentEffectiveFrom}.</p></div>`,
    `<div class="mapping-card"><strong>Betroffene Quartale zuerst</strong><p>${quarterMonths.length > 0 ? quarterMonths.map(quarterLabel).join(" · ") : "Noch keine künftigen Quartalsmonate im Plan."}</p></div>`,
    `<div class="mapping-card"><strong>Wichtig</strong><p>Zusätzliche echte Nachzahlungen oder Erstattungen kannst du weiterhin als normale Monatsausgabe bzw. Einnahme pflegen.</p></div>`,
  ].join("");

  saveButton.onclick = async () => {
    const quarterlyPrepaymentAmount = Number(amountField.value);
    const effectiveFrom = effectiveFromField.value;
    const notes = notesField.value.trim();

    if (!Number.isFinite(quarterlyPrepaymentAmount) || quarterlyPrepaymentAmount < 0 || !effectiveFrom) {
      metaTarget.textContent = "Bitte gültigen Quartalsbetrag und gültig-ab-Monat eintragen.";
      return;
    }

    if (!confirmAction(`Quartals-Steuer-Vorauszahlung von ${euro.format(quarterlyPrepaymentAmount)} ab ${effectiveFrom} wirklich speichern?`)) {
      return;
    }

    const result = await saveMusicTaxSettings({
      quarterlyPrepaymentAmount,
      effectiveFrom,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await refreshFinanceView({
      title: "Steuer-Plan gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}

export function renderMusicForecastPlanner(importDraft, deps) {
  const {
    readMusicForecastSettings,
    currentSelectedMonthKey,
    reviewFocusMonthKey,
    euro,
    formatDisplayDate,
    formatHistoryTimestamp,
    confirmAction,
    saveMusicForecastSettings,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const amountField = document.getElementById("musicForecastAmount");
  const effectiveFromField = document.getElementById("musicForecastEffectiveFrom");
  const notesField = document.getElementById("musicForecastNotes");
  const metaTarget = document.getElementById("musicForecastMeta");
  const listTarget = document.getElementById("musicForecastList");
  const saveButton = document.getElementById("saveMusicForecastButton");

  if (!amountField || !effectiveFromField || !notesField || !metaTarget || !listTarget || !saveButton) {
    return;
  }

  const settings = [...readMusicForecastSettings()].sort((left, right) =>
    (left.effectiveFrom ?? "").localeCompare(right.effectiveFrom ?? ""),
  );
  const suggestedMonth = currentSelectedMonthKey() ?? reviewFocusMonthKey;

  const musicForecastNote = bindAutoNote(
    notesField,
    () => {
      const amount = Number(amountField.value);
      const effectiveFrom = effectiveFromField.value || suggestedMonth;
      if (Number.isFinite(amount) && amount >= 0) {
        return `Musik-Forecast ab ${effectiveFrom}: ${euro.format(amount)} brutto pro Monat.`;
      }
      return `Musik-Forecast ab ${effectiveFrom}.`;
    },
    [amountField, effectiveFromField],
  );

  function resetForm() {
    amountField.value = "";
    effectiveFromField.value = suggestedMonth;
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Musik-Forecast speichern";
    musicForecastNote.refresh(true);
  }

  if (!(saveButton.dataset.editingId ?? "")) {
    effectiveFromField.value = suggestedMonth;
    musicForecastNote.refresh(true);
  }

  metaTarget.textContent = settings.length > 0
    ? `${settings.length} Musik-Forecast-Stand/-Stände gespeichert. Neuere "gültig ab"-Einträge überschreiben spätere Monate.`
    : "Noch kein fortlaufender Musik-Forecast gespeichert.";

  listTarget.innerHTML = settings.length > 0
    ? settings
        .map((entry) => `
          <div class="mapping-card">
            <div class="mapping-card-head">
              <div>
                <strong>${euro.format(entry.grossAmount)} brutto</strong>
                <p>Gültig ab ${entry.effectiveFrom} · ${entry.isActive === false ? "deaktiviert" : "aktiv"}</p>
              </div>
              <div class="filter-group">
                <button class="pill" type="button" data-music-forecast-edit="${entry.id}">Bearbeiten</button>
                <button class="pill" type="button" data-music-forecast-toggle="${entry.id}">
                  ${entry.isActive === false ? "Aktivieren" : "Deaktivieren"}
                </button>
              </div>
            </div>
            <p class="section-copy">${entry.notes || "Keine Notiz."}</p>
            <p class="section-copy">Zuletzt geändert: ${entry.updatedAt ? formatHistoryTimestamp(entry.updatedAt) : "unbekannt"}</p>
          </div>
        `)
        .join("")
    : `<p class="empty-state">Noch kein fortlaufender Musik-Forecast gespeichert.</p>`;

  for (const button of listTarget.querySelectorAll("[data-music-forecast-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-music-forecast-edit");
      const entry = readMusicForecastSettings().find((item) => item.id === id);
      if (!entry) return;
      saveButton.dataset.editingId = entry.id ?? "";
      amountField.value = String(entry.grossAmount ?? "");
      effectiveFromField.value = entry.effectiveFrom ?? suggestedMonth;
      musicForecastNote.setManualValue(entry.notes ?? "");
      saveButton.textContent = "Musik-Forecast aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${euro.format(entry.grossAmount)} brutto ab ${entry.effectiveFrom}`;
    });
  }

  for (const button of listTarget.querySelectorAll("[data-music-forecast-toggle]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-music-forecast-toggle");
      if (!id) return;
      const entry = readMusicForecastSettings().find((item) => item.id === id);
      if (!entry || !confirmAction(`Musik-Forecast ${euro.format(entry.grossAmount)} ab ${entry.effectiveFrom} wirklich ${entry.isActive === false ? "aktivieren" : "deaktivieren"}?`)) {
        return;
      }

      const nextState = readMusicForecastSettings().map((item) =>
        item.id === id ? { ...item, isActive: item.isActive === false, updatedAt: new Date().toISOString() } : item,
      );
      const result = await saveMusicForecastSettings(nextState);
      await refreshFinanceView({
        title: `Musik-Forecast ${entry.isActive === false ? "aktiviert" : "deaktiviert"}`,
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const grossAmount = Number(amountField.value);
    const effectiveFrom = effectiveFromField.value || suggestedMonth;
    const notes = notesField.value.trim();

    if (!Number.isFinite(grossAmount) || grossAmount < 0 || !effectiveFrom) {
      metaTarget.textContent = "Bitte Bruttobetrag und gültig-ab-Monat eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(isEditing
      ? `Musik-Forecast ${euro.format(grossAmount)} ab ${effectiveFrom} wirklich aktualisieren?`
      : `Musik-Forecast ${euro.format(grossAmount)} ab ${effectiveFrom} wirklich speichern?`)) {
      return;
    }

    const nextEntry = {
      id: editingId || `music-forecast-${Date.now()}`,
      grossAmount,
      effectiveFrom,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    const nextState = isEditing
      ? readMusicForecastSettings().map((item) => (item.id === editingId ? nextEntry : item))
      : [...readMusicForecastSettings(), nextEntry];

    const result = await saveMusicForecastSettings(nextState);
    resetForm();
    await refreshFinanceView({
      title: isEditing ? "Musik-Forecast aktualisiert" : "Musik-Forecast gespeichert",
      detail: `${statusDetailForMode(result.mode)} Gilt ab ${effectiveFrom} für alle späteren Monate, bis ein neuerer Eintrag übernimmt.`,
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}
