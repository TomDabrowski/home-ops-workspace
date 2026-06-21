import test from "node:test";
import assert from "node:assert/strict";

// @ts-ignore
import { analyzeFinanzguruActuals, isStableFinanzguruExpense } from "../app/shared/finanzguru-actuals.js";

test("analyzes Finanzguru actuals for forecast-safe monthly spending", () => {
  const actuals = {
    dateRange: { min: "2026-01-01", max: "2026-04-30" },
    completeMonthRange: { min: "2026-01", max: "2026-04" },
    accountSnapshots: [
      { accountId: "cash", latestDate: "2026-04-30", balance: 1000 },
      { accountId: "savings", latestDate: "2026-04-29", balance: 2500 },
    ],
    monthlySummaries: [
      { monthKey: "2026-01", transactionCount: 4, coreExpenseAmount: 1100, investmentLikeAmount: 500, transferAmount: 0 },
      { monthKey: "2026-02", transactionCount: 4, coreExpenseAmount: 1200, investmentLikeAmount: 500, transferAmount: 0 },
      { monthKey: "2026-03", transactionCount: 4, coreExpenseAmount: 4500, investmentLikeAmount: 500, transferAmount: 0 },
      { monthKey: "2026-04", transactionCount: 4, coreExpenseAmount: 1300, investmentLikeAmount: 500, transferAmount: 0 },
    ],
    transactions: [
      ...["2026-01", "2026-02", "2026-03", "2026-04"].map((monthKey) => ({
        id: `${monthKey}-rent`,
        bookingDate: `${monthKey}-01`,
        monthKey,
        amount: -800,
        currency: "EUR",
        accountId: "cash",
        mainCategory: "Wohnen",
        subCategory: "Miete",
        contractTurnus: "monatlich",
        isTransfer: false,
        excludedFromFreeIncome: false,
        isPending: false,
      })),
      {
        id: "music",
        bookingDate: "2026-03-10",
        monthKey: "2026-03",
        amount: -300,
        currency: "EUR",
        accountId: "cash",
        mainCategory: "Freizeit",
        subCategory: "Musik Equipment",
        isTransfer: false,
        excludedFromFreeIncome: false,
        isPending: false,
      },
      {
        id: "tax",
        bookingDate: "2026-03-12",
        monthKey: "2026-03",
        amount: -400,
        currency: "EUR",
        accountId: "cash",
        mainCategory: "Finanzen",
        subCategory: "Steuern",
        isTransfer: false,
        excludedFromFreeIncome: false,
        isPending: false,
      },
      {
        id: "saving",
        bookingDate: "2026-03-15",
        monthKey: "2026-03",
        amount: -500,
        currency: "EUR",
        accountId: "cash",
        mainCategory: "Sparen",
        subCategory: "Kapitalanlage",
        isTransfer: false,
        excludedFromFreeIncome: false,
        isPending: false,
      },
    ],
  };

  const analysis = analyzeFinanzguruActuals(actuals);

  assert.equal(analysis.hasActuals, true);
  assert.equal(analysis.transactionCount, 7);
  assert.equal(analysis.cashSnapshotTotal, 3500);
  assert.equal(analysis.latestCashSnapshotDate, "2026-04-30");
  assert.equal(analysis.investmentLikeTotal, 2000);
  assert.equal(analysis.monthlySpend, 800);
  assert.equal(analysis.stableMedian, 800);
  assert.equal(analysis.musicExpenseTotal, 300);
  assert.equal(analysis.taxExpenseTotal, 400);
  assert.equal(analysis.recurringCandidates[0]?.label, "Wohnen / Miete / monatlich");
  assert.equal(analysis.recurringCandidates[0]?.activeMonths, 4);
  assert.equal(analysis.outlierMonths[0]?.monthKey, "2026-03");
});

test("stable Finanzguru expenses exclude transfers, savings, finance and explicitly excluded bookings", () => {
  assert.equal(isStableFinanzguruExpense({ amount: -10, mainCategory: "Wohnen", subCategory: "Miete" }), true);
  assert.equal(isStableFinanzguruExpense({ amount: -10, mainCategory: "Sparen", subCategory: "Kapitalanlage" }), false);
  assert.equal(isStableFinanzguruExpense({ amount: -10, mainCategory: "Finanzen", subCategory: "Steuern" }), false);
  assert.equal(isStableFinanzguruExpense({ amount: -10, mainCategory: "Wohnen", subCategory: "Miete", isTransfer: true }), false);
  assert.equal(
    isStableFinanzguruExpense({
      amount: -10,
      mainCategory: "Wohnen",
      subCategory: "Miete",
      excludedFromFreeIncome: true,
    }),
    false,
  );
});
