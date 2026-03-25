// Shared month/date/assumption helpers used across local forecast logic and
// browser UI orchestration.

export function monthFromDate(value) {
  return String(value ?? "").slice(0, 7);
}

export function incomeMonthKey(entry) {
  return entry?.monthKey || monthFromDate(entry?.entryDate ?? "");
}

export function compareMonthKeys(left, right) {
  return String(left).localeCompare(String(right));
}

export function uniqueMonthKeys(incomeEntries, expenseEntries) {
  const keys = new Set();

  for (const entry of incomeEntries) {
    keys.add(incomeMonthKey(entry));
  }

  for (const entry of expenseEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  return [...keys].sort(compareMonthKeys);
}

export function currentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function monthKeyToDate(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function dateToMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(monthKey, count) {
  const date = monthKeyToDate(monthKey);
  date.setUTCMonth(date.getUTCMonth() + count);
  return dateToMonthKey(date);
}

export function assumptionNumber(importDraft, key, fallback) {
  const assumption = importDraft.forecastAssumptions?.find((entry) => entry.key === key);
  return typeof assumption?.value === "number" ? assumption.value : fallback;
}

export function assumptionString(importDraft, key, fallback) {
  const assumption = importDraft.forecastAssumptions?.find((entry) => entry.key === key);
  return typeof assumption?.value === "string" && assumption.value.trim() ? assumption.value.trim() : fallback;
}

export function futureForecastRows(monthlyPlan) {
  return monthlyPlan.rows.filter((row) => row.monthKey >= "2026-03" && row.projectedWealthEndAmount !== undefined);
}

export function buildRecurringForecastTemplates(monthlyPlan) {
  const rows = futureForecastRows(monthlyPlan);
  const lastTwelve = rows.slice(-12);
  const templates = new Map();

  for (const row of lastTwelve) {
    templates.set(Number(row.monthKey.slice(5, 7)), row);
  }

  return {
    orderedRows: rows,
    templates,
  };
}

export function rowTemplateForMonth(monthlyPlan, monthKey) {
  const { orderedRows, templates } = buildRecurringForecastTemplates(monthlyPlan);
  const existing = orderedRows.find((row) => row.monthKey === monthKey);
  if (existing) {
    return existing;
  }

  if (templates.size === 0) {
    return null;
  }

  return templates.get(Number(monthKey.slice(5, 7))) ?? orderedRows.at(-1) ?? null;
}

export function currentRentAmount(importDraft, monthKey) {
  const currentItems = importDraft.baselineLineItems
    .filter((item) => item.effectiveFrom <= monthKey && item.category === "fixed" && /miete/i.test(item.label))
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));

  return currentItems.at(-1)?.amount ?? 0;
}
