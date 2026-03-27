import type { ForecastWealthAnchor } from "./types.js";
import { monthFromDate, roundCurrency } from "./monthly-planning-helpers.ts";

export interface MonthlyForecastRoutingInput {
  monthKey: string;
  useForecastRouting: boolean;
  musicThreshold: number;
  thresholdAccountCurrentAmount?: number;
  safetyMonthlyReturn: number;
  investmentMonthlyReturn: number;
  salaryAllocationToSafetyAmount: number;
  salaryAllocationToInvestmentAmount: number;
  importedIncomeAvailableAmount: number;
  importedExpenseAmount: number;
  safetyBucketStartAmount?: number;
  investmentBucketStartAmount?: number;
  explicitWealthAnchor?: ForecastWealthAnchor;
  incomeAvailableAfterAnchorAmount?: number;
  expenseAfterAnchorAmount?: number;
}

export interface MonthlyForecastRoutingResult {
  anchorAppliesWithinMonth: boolean;
  projectionIncomeAvailableAmount: number;
  projectionExpenseAmount: number;
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

export function buildMonthlyForecastRouting(
  input: MonthlyForecastRoutingInput,
): MonthlyForecastRoutingResult {
  const snapshotDate = input.explicitWealthAnchor?.snapshotDate;
  const anchorAppliesWithinMonth = Boolean(snapshotDate && monthFromDate(snapshotDate) === input.monthKey);
  const projectionIncomeAvailableAmount = anchorAppliesWithinMonth
    ? roundCurrency(input.incomeAvailableAfterAnchorAmount ?? 0)
    : roundCurrency(input.importedIncomeAvailableAmount);
  const projectionExpenseAmount = anchorAppliesWithinMonth
    ? roundCurrency(input.expenseAfterAnchorAmount ?? 0)
    : roundCurrency(input.importedExpenseAmount);
  const currentSafetyAmount = anchorAppliesWithinMonth
    ? Number(input.explicitWealthAnchor?.safetyBucketAmount ?? 0)
    : Number(input.safetyBucketStartAmount ?? 0);
  const thresholdAmount = Number(input.thresholdAccountCurrentAmount ?? currentSafetyAmount);
  const musicSafetyGapAmount = Math.max(0, input.musicThreshold - thresholdAmount);
  const musicAllocationToSafetyAmount = roundCurrency(
    !input.useForecastRouting ? 0 : Math.min(projectionIncomeAvailableAmount, musicSafetyGapAmount),
  );
  const musicAllocationToInvestmentAmount = roundCurrency(
    !input.useForecastRouting ? 0 : Math.max(0, projectionIncomeAvailableAmount - musicAllocationToSafetyAmount),
  );

  const safetyBucketCalculatedEndAmount = input.useForecastRouting
    ? roundCurrency(
        Number(input.safetyBucketStartAmount ?? 0) * (1 + input.safetyMonthlyReturn) +
          input.salaryAllocationToSafetyAmount +
          musicAllocationToSafetyAmount -
          projectionExpenseAmount,
      )
    : undefined;
  const investmentBucketCalculatedEndAmount = input.useForecastRouting
    ? roundCurrency(
        Number(input.investmentBucketStartAmount ?? 0) * (1 + input.investmentMonthlyReturn) +
          input.salaryAllocationToInvestmentAmount +
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
      ? roundCurrency(safetyBucketAnchorAmount + musicAllocationToSafetyAmount - projectionExpenseAmount)
      : undefined;
  const anchoredInvestmentEndAmount =
    anchorAppliesWithinMonth && investmentBucketAnchorAmount !== undefined
      ? roundCurrency(investmentBucketAnchorAmount + musicAllocationToInvestmentAmount)
      : undefined;
  const projectedWealthAnchorAmount =
    safetyBucketAnchorAmount !== undefined && investmentBucketAnchorAmount !== undefined
      ? roundCurrency(safetyBucketAnchorAmount + investmentBucketAnchorAmount)
      : input.explicitWealthAnchor?.totalWealthAmount;

  const safetyBucketEndAmount =
    anchoredSafetyEndAmount ??
    safetyBucketAnchorAmount ??
    safetyBucketCalculatedEndAmount;
  const investmentBucketEndAmount =
    anchoredInvestmentEndAmount ??
    investmentBucketAnchorAmount ??
    investmentBucketCalculatedEndAmount;
  const projectedWealthEndAmount =
    safetyBucketEndAmount !== undefined && investmentBucketEndAmount !== undefined
      ? roundCurrency(safetyBucketEndAmount + investmentBucketEndAmount)
      : undefined;

  return {
    anchorAppliesWithinMonth,
    projectionIncomeAvailableAmount,
    projectionExpenseAmount,
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
