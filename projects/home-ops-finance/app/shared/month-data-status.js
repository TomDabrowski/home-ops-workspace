export function buildMonthDataStatus(input) {
  const {
    monthKey,
    currentMonthKey,
    row,
    previousRow,
    latestSnapshot,
    wealthSnapshotPersistence,
    formatDisplayDate,
  } = input;

  const isFutureMonth = monthKey > currentMonthKey;
  const isCurrentMonth = monthKey === currentMonthKey;
  const snapshotMonthKey = String(latestSnapshot?.snapshotDate ?? "").slice(0, 7);
  const snapshotMatchesMonth = snapshotMonthKey === monthKey;
  const snapshotAnchorsThisMonth = latestSnapshot?.anchorMonthKey === monthKey;
  const explicitMonthStart = Boolean(row?.anchorAppliesAtMonthStart || snapshotAnchorsThisMonth);
  const sourceLabel = latestSnapshot
    ? (wealthSnapshotPersistence === "project" ? "Projektdatei" : "Browser-Fallback")
    : "Kein Ist-Stand";

  const safetyChainOk = !previousRow || previousRow.safetyBucketEndAmount === row.safetyBucketStartAmount;
  const investmentChainOk = !previousRow || previousRow.investmentBucketEndAmount === row.investmentBucketStartAmount;
  const chainOk = safetyChainOk && investmentChainOk;

  let status = "Passt";
  let detail = "Die Monatskette wirkt konsistent.";
  if (!chainOk && explicitMonthStart) {
    status = "Info";
    detail =
      `Für ${monthKey} ist ein expliziter Monatsanfang gesetzt. ` +
      "Darum darf der Startwert bewusst vom Monatsende des Vormonats abweichen.";
  } else if (!chainOk) {
    status = "Prüfen";
    detail = "Der Monatsanfang passt nicht sauber zum Monatsende des Vormonats.";
  } else if (isFutureMonth && latestSnapshot && !snapshotAnchorsThisMonth) {
    status = "Info";
    detail =
      `Es gibt schon einen Ist-Stand vom ${formatDisplayDate(latestSnapshot.snapshotDate)}, aber noch keinen expliziten Monatsanfang für ${monthKey}. ` +
      `Darum wird der Vormonat erst bis Monatsende weitergerechnet.`;
  } else if (isCurrentMonth && !snapshotMatchesMonth) {
    status = "Prüfen";
    detail = "Aktueller Monat ohne Ist-Stand in diesem Monat. Werte können noch Prognose sein.";
  } else if (latestSnapshot && wealthSnapshotPersistence !== "project") {
    status = "Prüfen";
    detail = "Es ist ein lokaler Browser-Ist-Stand aktiv. Dieser kann Projektwerte überlagern.";
  } else if (isFutureMonth) {
    status = "Info";
    detail = "Zukünftiger Monat. Die Werte basieren auf der aktuellen Prognosekette.";
  }

  const modeLabel = isFutureMonth
    ? "Prognose"
    : isCurrentMonth
      ? (snapshotMatchesMonth ? "Aktueller Monat mit Ist-Stand" : "Aktueller Monat ohne frischen Ist-Stand")
      : "Vergangener Monat";

  return {
    summaryEntries: [
      ["Heute", formatDisplayDate(`${currentMonthKey}-01`)],
      ["Ansicht", monthKey],
      ["Modus", modeLabel],
      ["Letzter Ist-Stand", latestSnapshot ? formatDisplayDate(latestSnapshot.snapshotDate) : "Keiner"],
      ["Quelle", sourceLabel],
      ["Monatsanfang gesetzt", snapshotAnchorsThisMonth ? "Ja" : "Nein"],
      ["Kette Vormonat → Monat", !chainOk && explicitMonthStart ? "Expliziter Monatsanfang" : chainOk ? "Passt" : "Auffällig"],
    ],
    status,
    detail,
  };
}
