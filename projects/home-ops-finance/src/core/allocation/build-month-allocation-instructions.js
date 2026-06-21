// Canonical allocation rule path for month guidance.
// Both the Node/core side and the browser UI should consume this module
// so the finance rule only lives in one place.
function monthFromDate(value) {
  return String(value ?? "").slice(0, 7);
}

function compareMonthKeys(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function roundCurrency(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function latestWealthAnchorOnOrBeforeMonth(importDraft, monthKey) {
  return [...(importDraft?.forecastWealthAnchors ?? [])]
    .filter((anchor) => compareMonthKeys(anchor.monthKey, monthKey) <= 0)
    .sort((left, right) => String(left.snapshotDate ?? `${left.monthKey}-01`).localeCompare(String(right.snapshotDate ?? `${right.monthKey}-01`)))
    .at(-1);
}

function assumptionNumber(importDraft, key, fallback) {
  const assumption = importDraft?.forecastAssumptions?.find((entry) => entry.key === key);
  return typeof assumption?.value === "number" ? assumption.value : fallback;
}

function assumptionString(importDraft, key, fallback) {
  const assumption = importDraft?.forecastAssumptions?.find((entry) => entry.key === key);
  return typeof assumption?.value === "string" && assumption.value.trim() ? assumption.value.trim() : fallback;
}

export function buildMonthAllocationInstructionsFromReview(review, importDraft) {
  if (!review?.row) {
    return [];
  }

  const monthKey = review.row.monthKey;
  const thresholdAccountId = assumptionString(importDraft, "music_threshold_account_id", "savings");
  const safetyThreshold = assumptionNumber(importDraft, "safety_threshold", 10000);
  const musicThreshold = assumptionNumber(importDraft, "music_threshold", safetyThreshold);
  const monthAnchor = (importDraft?.forecastWealthAnchors ?? []).find((anchor) => anchor.monthKey === monthKey);
  const instructionStartDate = review.row.anchorAppliesWithinMonth
    ? String(monthAnchor?.snapshotDate ?? `${monthKey}-01`)
    : `${monthKey}-01`;
  const monthStartDate = `${monthKey}-01`;
  const latestAnchor = latestWealthAnchorOnOrBeforeMonth(importDraft, monthKey);
  const thresholdStartAmount = thresholdAccountId
    ? Number(latestAnchor?.cashAccounts?.[thresholdAccountId] ?? review.row.thresholdAccountInstructionStartAmount ?? review.row.thresholdAccountStartAmount ?? 0)
    : Number(review.row.safetyBucketStartAmount ?? 0);
  const expenseEntries = (review.expenseEntries ?? [])
    .filter((entry) => Number(entry.amount ?? 0) > 0)
    .sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));
  const reserveEntries = expenseEntries
    .filter((entry) => monthFromDate(entry.entryDate) === monthKey);
  const reservedExpenseTotal = roundCurrency(
    reserveEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
  );

  const instructions = [];
  let remainingExpenseReserveAmount = reservedExpenseTotal;
  let thresholdRunningAmount = thresholdStartAmount;

  if (reservedExpenseTotal > 0) {
    instructions.push({
      kind: "expense_reserve",
      effectiveDate: monthStartDate,
      title: "Zum Monatsanfang zurueckhalten",
      reserveAmount: reservedExpenseTotal,
      availableAmount: reservedExpenseTotal,
      toCashAmount: reservedExpenseTotal,
      toInvestmentAmount: 0,
      thresholdAccountId: thresholdAccountId || null,
      expenseEntries: reserveEntries.map((entry) => ({
        id: entry.id,
        entryDate: entry.entryDate,
        description: entry.description,
        amount: Number(entry.amount ?? 0),
        accountId: entry.accountId,
      })),
    });
    remainingExpenseReserveAmount = 0;
  }

  const salaryToThresholdAmount = Number(review.row.salaryAllocationToThresholdAmount ?? review.row.salaryAllocationToSafetyAmount ?? 0);
  const salaryCapacityAmount = roundCurrency(
    Number(review.row.salaryAllocationToSafetyAmount ?? 0) + Number(review.row.salaryAllocationToInvestmentAmount ?? 0),
  );
  const salaryToInvestmentAmount = roundCurrency(Math.max(0, salaryCapacityAmount - salaryToThresholdAmount));

  if (salaryToInvestmentAmount > 0 || salaryToThresholdAmount > 0) {
    instructions.push({
      kind: "salary",
      effectiveDate: instructionStartDate,
      title: "Bei Gehaltseingang",
      reserveAmount: 0,
      availableAmount: roundCurrency(
        Number(review.row.salaryAllocationToSafetyAmount ?? 0) + Number(review.row.salaryAllocationToInvestmentAmount ?? 0),
      ),
      toCashAmount: salaryToThresholdAmount,
      toInvestmentAmount: salaryToInvestmentAmount,
      thresholdAccountId: thresholdAccountId || null,
    });
  }

  const musicEntries = (review.incomeEntries ?? [])
    .filter((entry) => entry.incomeStreamId === "music-income")
    .sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));

  for (const entry of musicEntries) {
    const effectiveDate = String(entry.entryDate);
    const happenedBeforeMonthStart = effectiveDate < monthStartDate;

    const reserveAmount = 0;
    const availableAmount = roundCurrency(Number(entry.amount ?? entry.availableAmount ?? 0));
    const expenseReserveAmount = roundCurrency(Math.min(availableAmount, remainingExpenseReserveAmount));
    remainingExpenseReserveAmount = roundCurrency(Math.max(0, remainingExpenseReserveAmount - expenseReserveAmount));
    const thresholdAmountBeforeEntry = roundCurrency(thresholdRunningAmount);
    const gapAmount = Math.max(0, musicThreshold - thresholdAmountBeforeEntry);
    const availableAfterExpenseReserveAmount = roundCurrency(Math.max(0, availableAmount - expenseReserveAmount));
    const toCashAmount = roundCurrency(Math.min(availableAfterExpenseReserveAmount, gapAmount));
    thresholdRunningAmount = roundCurrency(Math.min(musicThreshold, thresholdRunningAmount + toCashAmount));
    const toInvestmentAmount = roundCurrency(Math.max(0, availableAmount - expenseReserveAmount - toCashAmount));

    instructions.push({
      kind: "music",
      effectiveDate,
      title: happenedBeforeMonthStart
        ? `Musik bereits eingegangen (${effectiveDate})`
        : `Wenn Musik eingeht (${effectiveDate})`,
      happenedBeforeMonthStart,
      thresholdAmountBeforeEntry,
      thresholdGapBeforeEntry: roundCurrency(gapAmount),
      reserveAmount,
      expenseReserveAmount,
      availableAmount: roundCurrency(availableAmount),
      toCashAmount,
      toInvestmentAmount,
      thresholdAccountId: thresholdAccountId || null,
    });
  }

  return instructions;
}
