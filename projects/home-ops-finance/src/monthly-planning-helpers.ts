import type {
  BaselineLineItem,
  ExpenseEntry,
  IncomeEntry,
  MonthlyBaseline,
} from "./types.js";

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function monthFromDate(value: string): string {
  return value.slice(0, 7);
}

export function incomeMonthKey(entry: IncomeEntry): string {
  return entry.monthKey ?? monthFromDate(entry.entryDate);
}

export function uniqueMonthKeys(incomeEntries: IncomeEntry[], expenseEntries: ExpenseEntry[]): string[] {
  const keys = new Set<string>();

  for (const entry of incomeEntries) {
    keys.add(incomeMonthKey(entry));
  }

  for (const entry of expenseEntries) {
    keys.add(monthFromDate(entry.entryDate));
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}

export function compareMonthKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

export function selectBaselineLineItemsForMonth(
  lineItems: BaselineLineItem[],
  monthKey: string,
): BaselineLineItem[] {
  const currentByKey = new Map<string, BaselineLineItem>();

  for (const item of [...lineItems].sort((left, right) => compareMonthKeys(left.effectiveFrom, right.effectiveFrom))) {
    if (compareMonthKeys(item.effectiveFrom, monthKey) > 0) {
      continue;
    }

    const key = `${item.category}:${item.label}`;
    if (item.amount <= 0) {
      currentByKey.delete(key);
      continue;
    }

    currentByKey.set(key, item);
  }

  return [...currentByKey.values()];
}

export function sumLineItems(items: BaselineLineItem[], category: BaselineLineItem["category"]): number {
  return roundCurrency(
    items
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + item.amount, 0),
  );
}

export function selectBaselineForMonth(baselines: MonthlyBaseline[], monthKey: string): MonthlyBaseline {
  const sorted = [...baselines].sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
  let selected = sorted[0];

  for (const baseline of sorted) {
    if (compareMonthKeys(baseline.monthKey, monthKey) <= 0) {
      selected = baseline;
    } else {
      break;
    }
  }

  return selected;
}

export function buildBaselineForMonth(anchor: MonthlyBaseline, monthKey: string): MonthlyBaseline & {
  baselineProfile: "historical_liquidity" | "forecast_investing";
} {
  if (anchor.plannedSavingsAmount === 0) {
    return {
      ...anchor,
      monthKey,
      baselineProfile: "historical_liquidity",
    };
  }

  return {
    ...anchor,
    monthKey,
    baselineProfile: "forecast_investing",
  };
}

export function sumIncomeForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => incomeMonthKey(entry) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function sumIncomeReserveForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => incomeMonthKey(entry) === monthKey)
      .reduce((sum, entry) => sum + (entry.reserveAmount ?? 0), 0),
  );
}

export function sumIncomeAvailableForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => incomeMonthKey(entry) === monthKey)
      .reduce((sum, entry) => sum + (entry.availableAmount ?? entry.amount - (entry.reserveAmount ?? 0)), 0),
  );
}

export function sumIncomeAvailableAfterDate(entries: IncomeEntry[], monthKey: string, snapshotDate: string): number {
  return roundCurrency(
    entries
      .filter((entry) => incomeMonthKey(entry) === monthKey && String(entry.entryDate) > snapshotDate)
      .reduce((sum, entry) => sum + (entry.availableAmount ?? entry.amount - (entry.reserveAmount ?? 0)), 0),
  );
}

export function sumIncomeReserveAfterDate(entries: IncomeEntry[], monthKey: string, snapshotDate: string): number {
  return roundCurrency(
    entries
      .filter((entry) => incomeMonthKey(entry) === monthKey && String(entry.entryDate) > snapshotDate)
      .reduce((sum, entry) => sum + (entry.reserveAmount ?? 0), 0),
  );
}

export function sumMusicIncomeForMonth(entries: IncomeEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => entry.incomeStreamId === "music-income" && incomeMonthKey(entry) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function sumExpensesForMonth(entries: ExpenseEntry[], monthKey: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function sumExpensesAfterDate(entries: ExpenseEntry[], monthKey: string, snapshotDate: string): number {
  return roundCurrency(
    entries
      .filter((entry) => monthFromDate(entry.entryDate) === monthKey && String(entry.entryDate) > snapshotDate)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
}

export function selectIncomeEntriesForMonth(entries: IncomeEntry[], monthKey: string): IncomeEntry[] {
  return entries.filter((entry) => incomeMonthKey(entry) === monthKey);
}

export function selectExpenseEntriesForMonth(entries: ExpenseEntry[], monthKey: string): ExpenseEntry[] {
  return entries.filter((entry) => monthFromDate(entry.entryDate) === monthKey);
}
