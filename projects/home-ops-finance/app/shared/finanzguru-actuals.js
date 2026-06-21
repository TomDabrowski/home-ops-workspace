export function analyzeFinanzguruActuals(actuals) {
  const transactions = Array.isArray(actuals?.transactions) ? actuals.transactions : [];
  const monthlySummaries = Array.isArray(actuals?.monthlySummaries) ? actuals.monthlySummaries : [];
  const completeMin = actuals?.completeMonthRange?.min ?? "";
  const completeMax = actuals?.completeMonthRange?.max ?? "";
  const completeMonths = monthlySummaries
    .map((row) => row.monthKey)
    .filter((monthKey) => isCompleteMonth(monthKey, completeMin, completeMax))
    .sort();

  if (!actuals || transactions.length === 0) {
    return {
      hasActuals: false,
      transactionCount: 0,
      completeMonths: [],
      recurringCandidates: [],
      outlierMonths: [],
      categoryTotals: [],
      musicExpenseTotal: 0,
      taxExpenseTotal: 0,
      investmentLikeTotal: 0,
      cashSnapshotTotal: 0,
      latestCashSnapshotDate: "",
    };
  }

  const stableByMonth = new Map(completeMonths.map((monthKey) => [monthKey, 0]));
  const rawCoreByMonth = new Map();
  const recurringGroups = new Map();
  const categoryTotals = new Map();
  let musicExpenseTotal = 0;
  let taxExpenseTotal = 0;

  for (const summary of monthlySummaries) {
    if (isCompleteMonth(summary.monthKey, completeMin, completeMax)) {
      rawCoreByMonth.set(summary.monthKey, Number(summary.coreExpenseAmount ?? 0));
    }
  }

  for (const entry of transactions) {
    const amount = Number(entry.amount ?? 0);
    if (amount >= 0 || entry.isTransfer) {
      continue;
    }

    const absoluteAmount = Math.abs(amount);
    if (isMusicLikeExpense(entry)) {
      musicExpenseTotal += absoluteAmount;
    }
    if (isTaxLikeExpense(entry)) {
      taxExpenseTotal += absoluteAmount;
    }

    if (isStableFinanzguruExpense(entry)) {
      if (isCompleteMonth(entry.monthKey, completeMin, completeMax)) {
        stableByMonth.set(entry.monthKey, (stableByMonth.get(entry.monthKey) ?? 0) + absoluteAmount);
      }
      const mainCategory = String(entry.mainCategory || "Sonstiges");
      categoryTotals.set(mainCategory, (categoryTotals.get(mainCategory) ?? 0) + absoluteAmount);
    }

    if (isRecurringCandidateExpense(entry)) {
      const groupKey = [
        entry.mainCategory || "Sonstiges",
        entry.subCategory || "Sonstige Ausgaben",
        entry.contractTurnus || "regelmaessig",
      ].join(" / ");
      const group = recurringGroups.get(groupKey) ?? {
        label: groupKey,
        monthAmounts: new Map(),
        count: 0,
        total: 0,
      };
      group.count += 1;
      group.total += absoluteAmount;
      if (isCompleteMonth(entry.monthKey, completeMin, completeMax)) {
        group.monthAmounts.set(entry.monthKey, (group.monthAmounts.get(entry.monthKey) ?? 0) + absoluteAmount);
      }
      recurringGroups.set(groupKey, group);
    }
  }

  const stableValues = completeMonths.map((monthKey) => Number(stableByMonth.get(monthKey) ?? 0));
  const rawCoreValues = completeMonths.map((monthKey) => Number(rawCoreByMonth.get(monthKey) ?? 0));
  const sortedStable = [...stableValues].sort((left, right) => left - right);
  const sortedRawCore = [...rawCoreValues].sort((left, right) => left - right);
  const stableP75 = Math.round(quantile(sortedStable, 0.75));
  const rawCoreMedian = Math.round(quantile(sortedRawCore, 0.5));

  const recurringCandidates = [...recurringGroups.values()]
    .map((group) => {
      const monthValues = completeMonths.map((monthKey) => Number(group.monthAmounts.get(monthKey) ?? 0));
      const activeMonthValues = monthValues.filter((value) => value > 0);
      const activeMonths = activeMonthValues.length;
      const medianMonthlyAmount = Math.round(quantile([...activeMonthValues].sort((left, right) => left - right), 0.5));
      const coverage = completeMonths.length > 0 ? activeMonths / completeMonths.length : 0;
      return {
        label: group.label,
        activeMonths,
        coverage,
        medianMonthlyAmount,
        totalAmount: roundCurrency(group.total),
        bookingCount: group.count,
      };
    })
    .filter((group) =>
      group.medianMonthlyAmount >= 20 &&
      (group.coverage >= 0.4 || group.bookingCount >= 8)
    )
    .sort((left, right) =>
      (right.coverage - left.coverage) ||
      (right.medianMonthlyAmount - left.medianMonthlyAmount)
    );

  const outlierMonths = completeMonths
    .map((monthKey) => {
      const stableAmount = Number(stableByMonth.get(monthKey) ?? 0);
      const rawCoreAmount = Number(rawCoreByMonth.get(monthKey) ?? 0);
      const reason = rawCoreAmount > Math.max(rawCoreMedian * 1.35, stableP75 * 1.35)
        ? "Roh-Core deutlich hoeher"
        : stableAmount > stableP75
          ? "stabile Ausgaben ueber 75%-Wert"
          : "";
      return { monthKey, stableAmount, rawCoreAmount, reason };
    })
    .filter((row) => row.reason)
    .sort((left, right) => right.rawCoreAmount - left.rawCoreAmount);

  const accountSnapshots = Array.isArray(actuals.accountSnapshots) ? actuals.accountSnapshots : [];
  const cashSnapshotTotal = roundCurrency(
    accountSnapshots.reduce((sum, entry) => sum + Number(entry.balance ?? 0), 0),
  );
  const latestCashSnapshotDate = accountSnapshots
    .map((entry) => String(entry.latestDate ?? ""))
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
  const investmentLikeTotal = roundCurrency(
    monthlySummaries.reduce((sum, row) => sum + Number(row.investmentLikeAmount ?? 0), 0),
  );

  return {
    hasActuals: true,
    transactionCount: transactions.length,
    dateRange: actuals.dateRange ?? null,
    completeMonthRange: actuals.completeMonthRange ?? null,
    completeMonths,
    monthlySpend: Math.round(trimmedAverage(stableValues)),
    stableMedian: Math.round(quantile(sortedStable, 0.5)),
    stableP75,
    rawCoreAverage: Math.round(average(rawCoreValues)),
    rawCoreMedian,
    stableMonthValues: completeMonths.map((monthKey) => ({
      monthKey,
      amount: roundCurrency(stableByMonth.get(monthKey) ?? 0),
    })),
    categoryTotals: [...categoryTotals.entries()]
      .map(([category, amount]) => [category, roundCurrency(amount)])
      .sort((left, right) => right[1] - left[1]),
    recurringCandidates,
    outlierMonths,
    musicExpenseTotal: roundCurrency(musicExpenseTotal),
    taxExpenseTotal: roundCurrency(taxExpenseTotal),
    investmentLikeTotal,
    cashSnapshotTotal,
    latestCashSnapshotDate,
    pendingCount: transactions.filter((entry) => entry.isPending).length,
    transferCount: transactions.filter((entry) => entry.isTransfer).length,
    excludedNote: "ohne Sparen, Umbuchungen, Finanzen, Sonstiges und als ausgeschlossen markierte Buchungen",
  };
}

export function isStableFinanzguruExpense(entry) {
  if (!entry || Number(entry.amount ?? 0) >= 0 || entry.isTransfer || entry.excludedFromFreeIncome) {
    return false;
  }
  if (entry.mainCategory === "Sparen" || entry.mainCategory === "Finanzen" || entry.mainCategory === "Sonstiges") {
    return false;
  }
  if (entry.subCategory === "Kapitalanlage" || entry.subCategory === "Sparen") {
    return false;
  }
  return true;
}

function isCompleteMonth(monthKey, completeMin, completeMax) {
  return Boolean(monthKey) && (!completeMin || monthKey >= completeMin) && (!completeMax || monthKey <= completeMax);
}

function isRecurringCandidateExpense(entry) {
  if (!entry || Number(entry.amount ?? 0) >= 0 || entry.isTransfer) {
    return false;
  }
  if (entry.mainCategory === "Sparen" || entry.subCategory === "Kapitalanlage" || entry.subCategory === "Sparen") {
    return false;
  }
  if (entry.mainCategory === "Sonstiges") {
    return false;
  }
  return true;
}

function isMusicLikeExpense(entry) {
  return /musik|equipment|instrument|gvl|gema|spotify|distro|master|mix/i.test(
    `${entry.mainCategory ?? ""} ${entry.subCategory ?? ""}`,
  );
}

function isTaxLikeExpense(entry) {
  return entry.subCategory === "Steuern" || /steuer|finanzamt/i.test(
    `${entry.mainCategory ?? ""} ${entry.subCategory ?? ""}`,
  );
}

function average(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length > 0 ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : 0;
}

function trimmedAverage(values) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length > 6) {
    return average(sorted.slice(2, -2));
  }
  if (sorted.length > 2) {
    return average(sorted.slice(1, -1));
  }
  return average(sorted);
}

function quantile(sortedValues, percentile) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  return sortedValues[lower] + ((sortedValues[upper] - sortedValues[lower]) * (index - lower));
}

function roundCurrency(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}
