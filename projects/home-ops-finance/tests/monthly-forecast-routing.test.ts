import test from "node:test";
import assert from "node:assert/strict";

import { buildMonthlyForecastRouting } from "../src/monthly-forecast-routing.ts";

test("routes forecast music into safety until the threshold is filled", () => {
  const result = buildMonthlyForecastRouting({
    monthKey: "2026-03",
    useForecastRouting: true,
    musicThreshold: 10000,
    safetyMonthlyReturn: 0.02 / 12,
    investmentMonthlyReturn: Math.pow(1 + 0.05, 1 / 12) - 1,
    salaryAllocationToSafetyAmount: 283.51,
    salaryAllocationToInvestmentAmount: 1050,
    importedIncomeAvailableAmount: 490,
    importedExpenseAmount: 300,
    safetyBucketStartAmount: 9916,
    investmentBucketStartAmount: 9916,
  });

  assert.equal(result.anchorAppliesWithinMonth, false);
  assert.equal(result.projectionIncomeAvailableAmount, 490);
  assert.equal(result.projectionExpenseAmount, 300);
  assert.equal(result.musicAllocationToSafetyAmount, 84);
  assert.equal(result.musicAllocationToInvestmentAmount, 406);
  assert.equal(result.safetyBucketEndAmount, 10000.04);
  assert.equal(result.investmentBucketEndAmount, 11412.4);
  assert.equal(result.projectedWealthEndAmount, 21412.44);
});

test("resolves explicit in-month wealth anchors before continuing the forecast", () => {
  const result = buildMonthlyForecastRouting({
    monthKey: "2026-02",
    useForecastRouting: true,
    musicThreshold: 10000,
    safetyMonthlyReturn: 0.02 / 12,
    investmentMonthlyReturn: Math.pow(1 + 0.05, 1 / 12) - 1,
    salaryAllocationToSafetyAmount: 0,
    salaryAllocationToInvestmentAmount: 1050,
    importedIncomeAvailableAmount: 420,
    importedExpenseAmount: 250,
    safetyBucketStartAmount: 9913.74,
    investmentBucketStartAmount: 9956.4,
    explicitWealthAnchor: {
      monthKey: "2026-02",
      safetyBucketAmount: 6300,
      investmentBucketAmount: 12077,
      totalWealthAmount: 18377,
      sourceSheet: "Übersicht Vermögen",
      sourceRowNumber: 38,
      isManualAnchor: true,
      snapshotDate: "2026-02-10",
    },
    incomeAvailableAfterAnchorAmount: 0,
    expenseAfterAnchorAmount: 0,
  });

  assert.equal(result.anchorAppliesWithinMonth, true);
  assert.equal(result.projectionIncomeAvailableAmount, 0);
  assert.equal(result.projectionExpenseAmount, 0);
  assert.equal(result.projectionSalaryAllocationToSafetyAmount, 0);
  assert.equal(result.projectionSalaryAllocationToInvestmentAmount, 1050);
  assert.equal(result.musicAllocationToSafetyAmount, 0);
  assert.equal(result.musicAllocationToInvestmentAmount, 0);
  assert.equal(result.safetyBucketAnchorAmount, 6300);
  assert.equal(result.investmentBucketAnchorAmount, 12077);
  assert.equal(result.safetyBucketEndAmount, 6300);
  assert.equal(result.investmentBucketEndAmount, 13127);
  assert.equal(result.projectedWealthAnchorAmount, 18377);
  assert.equal(result.projectedWealthEndAmount, 19427);
});

test("late in-month wealth anchors do not re-add the base investment when the snapshot likely already contains it", () => {
  const result = buildMonthlyForecastRouting({
    monthKey: "2026-03",
    useForecastRouting: true,
    musicThreshold: 10000,
    safetyMonthlyReturn: 0.02 / 12,
    investmentMonthlyReturn: Math.pow(1 + 0.05, 1 / 12) - 1,
    salaryAllocationToSafetyAmount: 39.51,
    salaryAllocationToInvestmentAmount: 1050,
    importedIncomeAvailableAmount: 0,
    importedExpenseAmount: 0,
    safetyBucketStartAmount: 10172,
    investmentBucketStartAmount: 12077,
    explicitWealthAnchor: {
      monthKey: "2026-03",
      safetyBucketAmount: 10172,
      investmentBucketAmount: 13258,
      totalWealthAmount: 23430,
      sourceSheet: "manual_snapshot",
      sourceRowNumber: 1,
      isManualAnchor: true,
      snapshotDate: "2026-03-27T22:32",
    },
    incomeAvailableAfterAnchorAmount: 0,
    expenseAfterAnchorAmount: 0,
  });

  assert.equal(result.projectionSalaryAllocationToSafetyAmount, 0);
  assert.equal(result.projectionSalaryAllocationToInvestmentAmount, 0);
  assert.equal(result.investmentBucketEndAmount, 13258);
});

test("routes against the configured threshold account when it differs from total safety cash", () => {
  const result = buildMonthlyForecastRouting({
    monthKey: "2026-03",
    useForecastRouting: true,
    musicThreshold: 10000,
    thresholdAccountCurrentAmount: 8500,
    safetyMonthlyReturn: 0.02 / 12,
    investmentMonthlyReturn: Math.pow(1 + 0.05, 1 / 12) - 1,
    salaryAllocationToSafetyAmount: 0,
    salaryAllocationToInvestmentAmount: 1050,
    importedIncomeAvailableAmount: 1223.79,
    importedExpenseAmount: 0,
    safetyBucketStartAmount: 12000,
    investmentBucketStartAmount: 9916,
    explicitWealthAnchor: {
      monthKey: "2026-03",
      safetyBucketAmount: 12000,
      investmentBucketAmount: 9916,
      totalWealthAmount: 21916,
      sourceSheet: "manual_snapshot",
      sourceRowNumber: 1,
      isManualAnchor: true,
      snapshotDate: "2026-03-01",
    },
    incomeAvailableAfterAnchorAmount: 1223.79,
    expenseAfterAnchorAmount: 0,
  });

  assert.equal(result.musicAllocationToSafetyAmount, 1223.79);
  assert.equal(result.musicAllocationToInvestmentAmount, 0);
});
