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
    ? Number(latestAnchor?.cashAccounts?.[thresholdAccountId] ?? review.row.safetyBucketStartAmount ?? 0)
    : Number(review.row.safetyBucketStartAmount ?? 0);

  const instructions = [];

  if (Number(review.row.salaryAllocationToInvestmentAmount ?? 0) > 0 || Number(review.row.salaryAllocationToSafetyAmount ?? 0) > 0) {
    instructions.push({
      kind: "salary",
      effectiveDate: instructionStartDate,
      title: "Bei Gehaltseingang",
      reserveAmount: 0,
      availableAmount: roundCurrency(
        Number(review.row.salaryAllocationToSafetyAmount ?? 0) + Number(review.row.salaryAllocationToInvestmentAmount ?? 0),
      ),
      toCashAmount: Number(review.row.salaryAllocationToSafetyAmount ?? 0),
      toInvestmentAmount: Number(review.row.salaryAllocationToInvestmentAmount ?? 0),
      thresholdAccountId: thresholdAccountId || null,
    });
  }

  const musicEntries = (review.incomeEntries ?? [])
    .filter((entry) => entry.incomeStreamId === "music-income")
    .sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));

  for (const entry of musicEntries) {
    const effectiveDate = String(entry.entryDate);
    const happenedBeforeMonthStart = effectiveDate < monthStartDate;

    const expensesBeforeEntry = roundCurrency(
      (review.expenseEntries ?? [])
        .filter((item) =>
          String(item.entryDate) < effectiveDate &&
          monthFromDate(item.entryDate) === monthKey &&
          (!thresholdAccountId || item.accountId === thresholdAccountId),
        )
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    );
    const priorMusicToCash = roundCurrency(
      instructions
        .filter((item) => item.kind === "music" && item.effectiveDate < effectiveDate)
        .reduce((sum, item) => sum + Number(item.toCashAmount ?? 0), 0),
    );
    const thresholdAmountBeforeEntry = roundCurrency(Math.max(0, thresholdStartAmount - expensesBeforeEntry + priorMusicToCash));
    const availableAmount = Number(entry.availableAmount ?? Number(entry.amount ?? 0) - Number(entry.reserveAmount ?? 0));
    const gapAmount = Math.max(0, musicThreshold - thresholdAmountBeforeEntry);
    const toCashAmount = roundCurrency(Math.min(availableAmount, gapAmount));
    const toInvestmentAmount = roundCurrency(Math.max(0, availableAmount - toCashAmount));

    instructions.push({
      kind: "music",
      effectiveDate,
      title: happenedBeforeMonthStart
        ? `Musik bereits eingegangen (${effectiveDate})`
        : `Wenn Musik eingeht (${effectiveDate})`,
      happenedBeforeMonthStart,
      thresholdAmountBeforeEntry,
      thresholdGapBeforeEntry: roundCurrency(gapAmount),
      reserveAmount: Number(entry.reserveAmount ?? 0),
      availableAmount: roundCurrency(availableAmount),
      toCashAmount,
      toInvestmentAmount,
      thresholdAccountId: thresholdAccountId || null,
    });
  }

  return instructions;
}
