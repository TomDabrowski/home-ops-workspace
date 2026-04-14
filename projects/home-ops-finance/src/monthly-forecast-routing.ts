import type { ForecastWealthAnchor } from "./types.js";
import { monthFromDate, roundCurrency } from "./monthly-planning-helpers.ts";

export interface MonthlyForecastRoutingInput {
  monthKey: string;
  useForecastRouting: boolean;
  musicThreshold: number;
  thresholdAccountCurrentAmount?: number;
  thresholdAccountExpenseAmount?: number;
  safetyMonthlyReturn: number;
  investmentMonthlyReturn: number;
  salaryAllocationToSafetyAmount: number;
  salaryAllocationToInvestmentAmount: number;
  importedIncomeAvailableAmount: number;
  importedIncomeReserveAmount: number;
  importedExpenseAmount: number;
  safetyBucketStartAmount?: number;
  investmentBucketStartAmount?: number;
  explicitWealthAnchor?: ForecastWealthAnchor;
  incomeAvailableAfterAnchorAmount?: number;
  incomeReserveAfterAnchorAmount?: number;
  expenseAfterAnchorAmount?: number;
  basisInvestmentState?: "open" | "included" | "pending_cash";
  extraExpensesIncluded?: boolean;
}

export interface MonthlyForecastRoutingResult {
  anchorAppliesAtMonthStart: boolean;
  anchorAppliesWithinMonth: boolean;
  projectionIncomeAvailableAmount: number;
  projectionIncomeReserveAmount: number;
  projectionExpenseAmount: number;
  projectionSalaryAllocationToSafetyAmount: number;
  projectionSalaryAllocationToInvestmentAmount: number;
  salaryInvestmentTransferFromSafetyAmount: number;
  salaryAllocationToThresholdAmount: number;
  musicAllocationToSafetyAmount: number;
  musicAllocationToInvestmentAmount: number;
  safetyBucketCalculatedEndAmount?: number;
  investmentBucketCalculatedEndAmount?: number;
  safetyBucketAnchorAmount?: number;
  investmentBucketAnchorAmount?: number;
  safetyBucketEndAmount?: number;
  investmentBucketEndAmount?: number;
  projectedWealthCalculatedEndAmount?: number;
  projectedWealthAnchorAmount?: number;
  projectedWealthEndAmount?: number;
  wealthAnchorApplied: boolean;
}

function snapshotCapturesBaseInvestment(snapshotDate?: string): boolean {
  const datePart = String(snapshotDate ?? "").slice(8, 10);
  const day = Number(datePart);
  return Number.isFinite(day) && day >= 25;
}

export function buildMonthlyForecastRouting(
  input: MonthlyForecastRoutingInput,
): MonthlyForecastRoutingResult {
  const snapshotDate = input.explicitWealthAnchor?.snapshotDate;
  const anchorAppliesAtMonthStart = Boolean(snapshotDate && monthFromDate(snapshotDate) !== input.monthKey);
  const anchorAppliesWithinMonth = Boolean(snapshotDate && monthFromDate(snapshotDate) === input.monthKey);
  const projectionIncomeAvailableAmount = snapshotDate
    ? roundCurrency(input.incomeAvailableAfterAnchorAmount ?? 0)
    : roundCurrency(input.importedIncomeAvailableAmount);
  const projectionIncomeReserveAmount = snapshotDate
    ? roundCurrency(input.incomeReserveAfterAnchorAmount ?? 0)
    : roundCurrency(input.importedIncomeReserveAmount);
  const projectionExpenseAmount = snapshotDate
    ? roundCurrency(input.expenseAfterAnchorAmount ?? 0)
    : roundCurrency(input.importedExpenseAmount);
  const effectiveProjectionExpenseAmount = projectionExpenseAmount;
  const projectionSalaryAllocationToSafetyAmount =
    anchorAppliesWithinMonth && snapshotCapturesBaseInvestment(snapshotDate)
      ? 0
      : roundCurrency(input.salaryAllocationToSafetyAmount);
  const basisInvestmentHandledInSnapshot =
    input.basisInvestmentState === "included" ||
    (anchorAppliesWithinMonth && snapshotCapturesBaseInvestment(snapshotDate));
  const projectionSalaryAllocationToInvestmentAmount =
    basisInvestmentHandledInSnapshot
      ? 0
      : roundCurrency(input.salaryAllocationToInvestmentAmount);
  const salaryInvestmentTransferFromSafetyAmount =
    input.basisInvestmentState === "pending_cash"
      ? roundCurrency(input.salaryAllocationToInvestmentAmount)
      : 0;
  const currentSafetyAmount = anchorAppliesWithinMonth
    ? Number(input.explicitWealthAnchor?.safetyBucketAmount ?? 0)
    : Number(input.safetyBucketStartAmount ?? 0);
  const thresholdAmount = Number(input.thresholdAccountCurrentAmount ?? currentSafetyAmount);
  const thresholdAmountAfterExpenses = roundCurrency(
    Math.max(0, thresholdAmount - Number(input.thresholdAccountExpenseAmount ?? 0)),
  );
  const musicSafetyGapAmount = Math.max(0, input.musicThreshold - thresholdAmountAfterExpenses);
  const musicNetNeededForThresholdAmount = roundCurrency(
    Math.max(0, Math.min(projectionIncomeAvailableAmount, musicSafetyGapAmount - projectionIncomeReserveAmount)),
  );
  const musicAllocationToSafetyAmount = roundCurrency(
    !input.useForecastRouting ? 0 : projectionIncomeReserveAmount + musicNetNeededForThresholdAmount,
  );
  const musicAllocationToInvestmentAmount = roundCurrency(
    !input.useForecastRouting ? 0 : Math.max(0, projectionIncomeAvailableAmount - musicNetNeededForThresholdAmount),
  );
  const salarySafetyGapAmount = Math.max(0, musicSafetyGapAmount - musicAllocationToSafetyAmount);
  const salaryAllocationToThresholdAmount = roundCurrency(
    !input.useForecastRouting ? 0 : Math.min(projectionSalaryAllocationToSafetyAmount, salarySafetyGapAmount),
  );

  const safetyBucketCalculatedEndAmount = input.useForecastRouting
    ? roundCurrency(
          Number(input.safetyBucketStartAmount ?? 0) * (1 + input.safetyMonthlyReturn) +
          projectionSalaryAllocationToSafetyAmount +
          musicAllocationToSafetyAmount -
          effectiveProjectionExpenseAmount -
          salaryInvestmentTransferFromSafetyAmount,
      )
    : undefined;
  const investmentBucketCalculatedEndAmount = input.useForecastRouting
    ? roundCurrency(
        Number(input.investmentBucketStartAmount ?? 0) * (1 + input.investmentMonthlyReturn) +
          projectionSalaryAllocationToInvestmentAmount +
          musicAllocationToInvestmentAmount,
      )
    : undefined;
  const projectedWealthCalculatedEndAmount =
    safetyBucketCalculatedEndAmount !== undefined && investmentBucketCalculatedEndAmount !== undefined
      ? roundCurrency(safetyBucketCalculatedEndAmount + investmentBucketCalculatedEndAmount)
      : undefined;

  const safetyBucketAnchorAmount = input.explicitWealthAnchor?.safetyBucketAmount;
  const investmentBucketAnchorAmount = input.explicitWealthAnchor?.investmentBucketAmount;
  const anchoredSafetyEndAmount =
    anchorAppliesWithinMonth && safetyBucketAnchorAmount !== undefined
      ? roundCurrency(
          safetyBucketAnchorAmount +
            projectionSalaryAllocationToSafetyAmount +
            musicAllocationToSafetyAmount -
            effectiveProjectionExpenseAmount -
            salaryInvestmentTransferFromSafetyAmount,
        )
      : undefined;
  const anchoredInvestmentEndAmount =
    anchorAppliesWithinMonth && investmentBucketAnchorAmount !== undefined
      ? roundCurrency(
          investmentBucketAnchorAmount +
            projectionSalaryAllocationToInvestmentAmount +
            musicAllocationToInvestmentAmount,
        )
      : undefined;
  const projectedWealthAnchorAmount =
    safetyBucketAnchorAmount !== undefined && investmentBucketAnchorAmount !== undefined
      ? roundCurrency(safetyBucketAnchorAmount + investmentBucketAnchorAmount)
      : input.explicitWealthAnchor?.totalWealthAmount;

  const safetyBucketEndAmount =
    anchoredSafetyEndAmount ??
    (anchorAppliesAtMonthStart ? safetyBucketCalculatedEndAmount : safetyBucketAnchorAmount) ??
    safetyBucketCalculatedEndAmount;
  const investmentBucketEndAmount =
    anchoredInvestmentEndAmount ??
    (anchorAppliesAtMonthStart ? investmentBucketCalculatedEndAmount : investmentBucketAnchorAmount) ??
    investmentBucketCalculatedEndAmount;
  const projectedWealthEndAmount =
    safetyBucketEndAmount !== undefined && investmentBucketEndAmount !== undefined
      ? roundCurrency(safetyBucketEndAmount + investmentBucketEndAmount)
      : undefined;

  return {
    anchorAppliesAtMonthStart,
    anchorAppliesWithinMonth,
    projectionIncomeAvailableAmount,
    projectionIncomeReserveAmount,
    projectionExpenseAmount: effectiveProjectionExpenseAmount,
    projectionSalaryAllocationToSafetyAmount,
    projectionSalaryAllocationToInvestmentAmount,
    salaryInvestmentTransferFromSafetyAmount,
    salaryAllocationToThresholdAmount,
    musicAllocationToSafetyAmount,
    musicAllocationToInvestmentAmount,
    safetyBucketCalculatedEndAmount,
    investmentBucketCalculatedEndAmount,
    safetyBucketAnchorAmount,
    investmentBucketAnchorAmount,
    safetyBucketEndAmount,
    investmentBucketEndAmount,
    projectedWealthCalculatedEndAmount,
    projectedWealthAnchorAmount,
    projectedWealthEndAmount,
    wealthAnchorApplied: Boolean(input.explicitWealthAnchor),
  };
}
