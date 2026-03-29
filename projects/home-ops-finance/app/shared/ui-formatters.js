// Shared browser format/render helpers. Keep these stateless and generic so
// app.js and UI modules can reuse them without adding business logic here.

export function statusDetailForMode(mode) {
  return mode === "project"
    ? "Die Änderung wurde in den Projektdateien gespeichert."
    : "Der Server war nicht erreichbar. Die Änderung liegt vorerst nur im Browser-Fallback.";
}

export function persistenceModeLabel(mode) {
  if (mode === "project") {
    return "Projektdatei";
  }
  if (mode === "project_readonly") {
    return "Projektdatei (nur geladen)";
  }
  return "Browser-Fallback";
}

export function quarterLabel(monthKey) {
  const month = Number(monthKey.slice(5, 7));
  return `Q${Math.floor((month - 1) / 3) + 1} ${monthKey.slice(0, 4)}`;
}

export function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function focusAndSelectField(field) {
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) {
    return;
  }

  window.requestAnimationFrame(() => {
    field.focus();
    if (typeof field.setSelectionRange === "function") {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
  });
}

export function formatCurrency(value) {
  return `${Number(value ?? 0).toFixed(2)} EUR`;
}

export function formatPercent(value, digits = 1) {
  return `${(Number(value ?? 0) * 100).toFixed(digits)} %`;
}

export function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

export function classForValue(value) {
  return value >= 0 ? "positive" : "negative";
}

export function renderRows(targetId, rows, mapper) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = rows.map(mapper).join("");
}

export function renderDetailEntries(entries, deps) {
  const { readDeveloperMode, readFormulaTooltipsEnabled, escapeHtml } = deps;
  const showFormula = readDeveloperMode();
  const showTooltip = readFormulaTooltipsEnabled();
  return entries
    .map((entry) => {
      const label = Array.isArray(entry) ? entry[0] : entry.label;
      const value = Array.isArray(entry) ? entry[1] : entry.value;
      const formula = Array.isArray(entry) ? "" : (entry.formula ?? "");
      const note = Array.isArray(entry) ? "" : (entry.note ?? "");
      const itemClass = Array.isArray(entry) ? "" : (entry.itemClass ?? "");
      const valueClass = Array.isArray(entry) ? "" : (entry.valueClass ?? "");
      const valueMarkup = showTooltip && formula
        ? `<span class="detail-value ${valueClass} has-tooltip" data-tooltip="${escapeHtml(formula)}">${value}</span>`
        : `<span class="detail-value ${valueClass}">${value}</span>`;
      return `<div class="${itemClass}"><dt>${label}</dt><dd>${valueMarkup}${note ? `<p class="detail-note">${note}</p>` : ""}${showFormula && formula ? `<p class="detail-formula">${formula}</p>` : ""}</dd></div>`;
    })
    .join("");
}

export function formatHistoryTimestamp(value) {
  if (!value) return "unbekannt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function renderEmptyRow(targetId, colspan, message) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">${message}</td></tr>`;
}

export function makeMoneyCell(value, deps) {
  const { classForValue, euro } = deps;
  return `<span class="${classForValue(value)}">${euro.format(value)}</span>`;
}

export function planProfileLabel(value) {
  return value === "forecast_investing" ? "Zukunftsplanung" : "Vergangenheitsdaten";
}

export function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("de-DE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDisplayDate(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(value))) {
    const normalized = String(value).length === 16 ? `${value}:00` : String(value);
    return new Date(normalized).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return String(value);
}

export function renderSignalItems(signals, emptyMessage) {
  if (!signals || signals.length === 0) {
    return `<li class="signal-empty">${emptyMessage}</li>`;
  }

  return signals
    .map(
      (signal) => `
        <li>
          <span class="signal-label ${signal.severity}">${signal.severity === "warn" ? "Prüfen" : "Info"}</span>
          <strong>${signal.title}</strong>
          <p>${signal.detail}</p>
        </li>
      `,
    )
    .join("");
}

export function renderSignalInline(target, warnings) {
  if (!target) {
    return;
  }

  if (!warnings || warnings.length === 0) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = warnings
    .map((warning) => `
      <div class="signal-inline-item ${warning.severity}">
        <strong>${warning.title}</strong>
        <p>${warning.detail}</p>
      </div>
    `)
    .join("");
}
