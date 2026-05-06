import test from "node:test";
import assert from "node:assert/strict";

// @ts-ignore
import { createProjectionTools } from "../app/projection-tools.js";

test("simulateForecast starts from requested startMonthKey template values", () => {
  const tools = createProjectionTools({
    assumptionNumber(_draft: unknown, _key: string, fallback: number) {
      return fallback;
    },
    assumptionString(_draft: unknown, _key: string, fallback: string) {
      return fallback;
    },
    futureForecastRows() {
      return [{ monthKey: "2026-03" }, { monthKey: "2026-05" }];
    },
    rowTemplateForMonth(_plan: unknown, monthKey: string) {
      if (monthKey === "2026-05") {
        return {
          monthKey,
          safetyBucketStartAmount: 12000,
          investmentBucketStartAmount: 15000,
          thresholdAccountStartAmount: 12000,
          thresholdAccountEndAmount: 12000,
          baselineFixedAmount: 1000,
          baselineVariableAmount: 300,
          annualReserveAmount: 100,
          netSalaryAmount: 3000,
          plannedSavingsAmount: 800,
          importedExpenseAmount: 0,
          musicIncomeAmount: 0,
        };
      }
      return {
        monthKey,
        safetyBucketStartAmount: 1000,
        investmentBucketStartAmount: 2000,
        thresholdAccountStartAmount: 1000,
        thresholdAccountEndAmount: 1000,
        baselineFixedAmount: 1000,
        baselineVariableAmount: 300,
        annualReserveAmount: 100,
        netSalaryAmount: 3000,
        plannedSavingsAmount: 800,
        importedExpenseAmount: 0,
        musicIncomeAmount: 0,
      };
    },
    addMonths(_monthKey: string, _delta: number) {
      return "2026-05";
    },
    roundCurrency(value: number) {
      return Math.round(value * 100) / 100;
    },
    uniqueMonthKeys() {
      return [];
    },
    buildMusicYearData() {
      return {
        yearlyMusicGross: 0,
        estimatedTaxAnnual: 0,
        yearlyMusicExpenses: 0,
      };
    },
    currentMonthKey() {
      return "2026-05";
    },
    readPlannerSettings() {
      return {
        currentAge: 35,
        targetAge: 50,
        retirementSpend: 2000,
        withdrawalRate: 4,
        inflationRate: 2,
        salaryGrowthRate: 0,
        rentGrowthRate: 0,
        expenseGrowthRate: 0,
        musicGrowthRate: 0,
        musicTaxRate: 42,
        minimumMusicGrossPerMonth: 0,
      };
    },
    currentRentAmount() {
      return 800;
    },
  });

  const result = tools.simulateForecast({}, {}, {
    startMonthKey: "2026-05",
    months: 1,
    constantMusicGrossPerMonth: 0,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.safetyStartAmount, 12000);
  assert.equal(result[0]?.investmentStartAmount, 15000);
  assert.equal(result[0]?.monthKey, "2026-05");
});
