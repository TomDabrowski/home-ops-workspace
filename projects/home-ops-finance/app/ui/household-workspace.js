// Household workspace UI lives here so app.js can remain the app shell rather
// than also owning the item-management workflow inline.

function householdAreaLabel(value) {
  return value === "music" ? "Musik-Equipment" : "Allgemeiner Hausrat";
}

function activeHouseholdItems(readHouseholdState) {
  return (readHouseholdState().items ?? [])
    .filter((item) => item.isActive !== false)
    .sort((left, right) => String(left.area ?? "").localeCompare(String(right.area ?? "")) || String(left.name ?? "").localeCompare(String(right.name ?? "")));
}

export function renderHouseholdWorkspace(deps) {
  const {
    readHouseholdState,
    euro,
    persistenceModeLabel,
    householdPersistence,
    escapeHtml,
    focusAndSelectField,
    confirmAction,
    saveHouseholdState,
    refreshFinanceView,
    statusDetailForMode,
  } = deps;

  const summaryTarget = document.getElementById("householdSummary");
  const listTarget = document.getElementById("householdItemList");
  const nameField = document.getElementById("householdItemName");
  const areaField = document.getElementById("householdItemArea");
  const valueField = document.getElementById("householdItemValue");
  const notesField = document.getElementById("householdItemNotes");
  const saveButton = document.getElementById("saveHouseholdItemButton");
  const metaTarget = document.getElementById("householdMeta");
  const coverageAmountField = document.getElementById("householdCoverageAmount");
  const coverageLabelField = document.getElementById("householdCoverageLabel");
  const coverageSaveButton = document.getElementById("saveHouseholdCoverageButton");
  const coverageMetaTarget = document.getElementById("householdCoverageMeta");

  if (
    !summaryTarget || !listTarget || !nameField || !areaField || !valueField || !notesField ||
    !saveButton || !metaTarget || !coverageAmountField || !coverageLabelField || !coverageSaveButton || !coverageMetaTarget
  ) {
    return;
  }

  const state = readHouseholdState();
  const items = activeHouseholdItems(readHouseholdState);
  const generalTotal = items
    .filter((item) => item.area !== "music")
    .reduce((sum, item) => sum + Number(item.estimatedValue ?? 0), 0);
  const musicTotal = items
    .filter((item) => item.area === "music")
    .reduce((sum, item) => sum + Number(item.estimatedValue ?? 0), 0);
  const total = generalTotal + musicTotal;
  const coverageAmount = Number(state.insuranceCoverageAmount ?? 0);

  summaryTarget.innerHTML = [
    ["Gesamtsumme", euro.format(total)],
    ["Allgemeiner Hausrat", euro.format(generalTotal)],
    ["Musik-Equipment", euro.format(musicTotal)],
    ["Versicherungssumme", coverageAmount > 0 ? euro.format(coverageAmount) : "-"],
    ["Abweichung", coverageAmount > 0 ? euro.format(coverageAmount - total) : "-"],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");

  const persistenceLabel = persistenceModeLabel(householdPersistence);
  metaTarget.textContent = items.length > 0
    ? `${items.length} Hausrat-Posten aktiv · Speicherort: ${persistenceLabel}`
    : `Noch keine Hausrat-Posten gespeichert · Speicherort: ${persistenceLabel}`;
  coverageMetaTarget.textContent = coverageAmount > 0
    ? `Aktuell ${euro.format(coverageAmount)}${state.insuranceCoverageLabel ? ` · ${state.insuranceCoverageLabel}` : ""} · Speicherort: ${persistenceLabel}`
    : `Noch keine Versicherungssumme gespeichert · Speicherort: ${persistenceLabel}`;

  coverageAmountField.value = coverageAmount > 0 ? String(coverageAmount) : "";
  coverageLabelField.value = state.insuranceCoverageLabel ?? "";

  if (items.length === 0) {
    listTarget.innerHTML = `<p class="empty-state">Noch keine Hausrat-Posten vorhanden.</p>`;
  } else {
    listTarget.innerHTML = items.map((item) => `
      <article class="mapping-card">
        <div class="mapping-card-head">
          <div>
            <strong>${escapeHtml(item.name ?? "")}</strong>
            <p>${householdAreaLabel(item.area)} · ${euro.format(Number(item.estimatedValue ?? 0))}</p>
          </div>
          <div class="filter-group">
            <button class="pill" type="button" data-household-edit="${item.id}">Bearbeiten</button>
            <button class="pill pill-danger" type="button" data-household-delete="${item.id}">Löschen</button>
          </div>
        </div>
        <p class="section-copy">${escapeHtml(item.notes || "Keine Notiz.")}</p>
      </article>
    `).join("");
  }

  for (const button of listTarget.querySelectorAll("[data-household-edit]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-household-edit");
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      saveButton.dataset.editingId = item.id;
      nameField.value = item.name ?? "";
      areaField.value = item.area ?? "general";
      valueField.value = String(item.estimatedValue ?? "");
      notesField.value = item.notes ?? "";
      saveButton.textContent = "Hausrat-Posten aktualisieren";
      metaTarget.textContent = `Bearbeite gerade: ${item.name}`;
      nameField.scrollIntoView({ behavior: "smooth", block: "center" });
      focusAndSelectField(nameField);
    });
  }

  for (const button of listTarget.querySelectorAll("[data-household-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-household-delete");
      const item = items.find((entry) => entry.id === id);
      if (!item || !confirmAction(`Hausrat-Posten "${item.name}" wirklich löschen?`)) {
        return;
      }

      const nextState = {
        ...state,
        items: (state.items ?? []).map((entry) =>
          entry.id === id ? { ...entry, isActive: false, updatedAt: new Date().toISOString() } : entry,
        ),
        updatedAt: new Date().toISOString(),
      };
      const result = await saveHouseholdState(nextState);
      await refreshFinanceView({
        title: "Hausrat-Posten gelöscht",
        detail: statusDetailForMode(result.mode),
        tone: result.mode === "project" ? "success" : "warn",
      });
    });
  }

  saveButton.onclick = async () => {
    const editingId = saveButton.dataset.editingId ?? "";
    const name = nameField.value.trim();
    const area = areaField.value === "music" ? "music" : "general";
    const estimatedValue = Number(valueField.value);
    const notes = notesField.value.trim();

    if (!name || !Number.isFinite(estimatedValue) || estimatedValue < 0) {
      metaTarget.textContent = "Bitte Name und gültigen Wert eintragen.";
      return;
    }

    const isEditing = Boolean(editingId);
    if (!confirmAction(
      isEditing
        ? `Hausrat-Posten "${name}" wirklich aktualisieren?`
        : `Hausrat-Posten "${name}" wirklich speichern?`,
    )) {
      return;
    }

    const nextEntry = {
      id: editingId || `household-${Date.now()}`,
      name,
      area,
      estimatedValue,
      notes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    const nextState = {
      ...state,
      items: editingId
        ? (state.items ?? []).map((entry) => (entry.id === editingId ? nextEntry : entry))
        : [...(state.items ?? []), nextEntry],
      updatedAt: new Date().toISOString(),
    };
    const result = await saveHouseholdState(nextState);
    saveButton.dataset.editingId = "";
    saveButton.textContent = "Hausrat-Posten speichern";
    nameField.value = "";
    areaField.value = "general";
    valueField.value = "";
    notesField.value = "";
    await refreshFinanceView({
      title: isEditing ? "Hausrat-Posten aktualisiert" : "Hausrat-Posten gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };

  coverageSaveButton.onclick = async () => {
    const insuranceCoverageAmount = Number(coverageAmountField.value);
    const insuranceCoverageLabel = coverageLabelField.value.trim();

    if (!Number.isFinite(insuranceCoverageAmount) || insuranceCoverageAmount < 0) {
      coverageMetaTarget.textContent = "Bitte eine gültige Versicherungssumme eintragen.";
      return;
    }

    if (!confirmAction(`Versicherungssumme von ${euro.format(insuranceCoverageAmount)} wirklich speichern?`)) {
      return;
    }

    const result = await saveHouseholdState({
      ...state,
      insuranceCoverageAmount,
      insuranceCoverageLabel,
      updatedAt: new Date().toISOString(),
    });
    await refreshFinanceView({
      title: "Versicherungssumme gespeichert",
      detail: statusDetailForMode(result.mode),
      tone: result.mode === "project" ? "success" : "warn",
    });
  };
}
