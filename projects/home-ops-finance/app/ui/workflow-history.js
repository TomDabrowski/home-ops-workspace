// Workflow-history rendering stays UI-only: collect already persisted workflow
// changes and explain them in one place without pulling finance rules in here.

export function renderWorkflowHistory(importDraft, deps) {
  const {
    readSalarySettings,
    readWealthSnapshots,
    readBaselineOverrides,
    readForecastSettings,
    readMonthlyMusicIncomeOverrides,
    wealthSnapshotCashTotalForEntry,
    baselineCategoryLabel,
    assumptionNumber,
    formatHistoryTimestamp,
    escapeHtml,
    euro,
  } = deps;

  const target = document.getElementById("workflowHistoryList");
  if (!target) return;

  const entries = [];

  for (const entry of readSalarySettings().filter((item) => item.isActive !== false)) {
    entries.push({
      area: "Hauptgehalt",
      title: `${euro.format(entry.netSalaryAmount)} netto`,
      detail: `Gilt ab ${entry.effectiveFrom}`,
      updatedAt: entry.updatedAt ?? null,
      notes: entry.notes ?? "",
    });
  }

  for (const entry of readWealthSnapshots().filter((item) => item.isActive !== false)) {
    entries.push({
      area: "Depot- & Cash-Stand",
      title: entry.anchorMonthKey ? `Monatsanfang ${entry.anchorMonthKey}` : `${entry.snapshotDate}`,
      detail:
        `${entry.anchorMonthKey ? `Gesetzter Monatsanfang auf Basis von ${entry.snapshotDate}` : `Snapshot ${entry.snapshotDate}`} · ` +
        `Cash ${euro.format(wealthSnapshotCashTotalForEntry(entry))} · Investment ${euro.format(Number(entry.investmentAmount ?? 0))}`,
      updatedAt: entry.updatedAt ?? null,
      notes: entry.notes ?? "",
    });
  }

  for (const entry of readBaselineOverrides().filter((item) => item.isActive !== false)) {
    entries.push({
      area: "Kostenblöcke",
      title: `${entry.label}`,
      detail: `Ab ${entry.effectiveFrom} · ${baselineCategoryLabel(entry.category ?? "fixed")} · ${Number(entry.amount) > 0 ? euro.format(Number(entry.amount ?? 0)) : "beendet"}`,
      updatedAt: entry.updatedAt ?? null,
      notes: entry.notes ?? "",
    });
  }

  const forecast = readForecastSettings();
  if (forecast?.isActive !== false && forecast?.updatedAt) {
    entries.push({
      area: "Schwellen",
      title: `Cash-Ziel ${euro.format(Number(forecast.safetyThreshold ?? assumptionNumber(importDraft, "safety_threshold", 10000)))}`,
      detail: `Musik-Schwelle ${euro.format(Number(forecast.musicThreshold ?? assumptionNumber(importDraft, "music_threshold", 10000)))}`,
      updatedAt: forecast.updatedAt,
      notes: forecast.notes ?? "",
    });
  }

  for (const entry of readMonthlyMusicIncomeOverrides().filter((item) => item.isActive !== false)) {
    entries.push({
      area: "Musik-Istwert",
      title: `${entry.monthKey}`,
      detail: `${euro.format(Number(entry.amount ?? 0))} netto`,
      updatedAt: entry.updatedAt ?? null,
      notes: entry.notes ?? "",
    });
  }

  if (entries.length === 0) {
    target.innerHTML = `<p class="empty-state">Noch keine Änderungen mit Historie vorhanden.</p>`;
    return;
  }

  target.innerHTML = entries
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))
    .map((entry) => `
      <article class="mapping-card">
        <div class="mapping-card-head">
          <div>
            <strong>${entry.area} · ${entry.title}</strong>
            <p>${entry.detail}</p>
          </div>
        </div>
        <p class="section-copy">Zuletzt geändert: ${formatHistoryTimestamp(entry.updatedAt)}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}</p>
      </article>
    `)
    .join("");
}
