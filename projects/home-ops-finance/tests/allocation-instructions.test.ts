import test from "node:test";
import assert from "node:assert/strict";

import { buildMonthAllocationInstructionsFromReview } from "../src/core/allocation/build-month-allocation-instructions.js";

test("builds stable month allocation instructions for next-month music from latest snapshot", () => {
  const importDraft = {
    forecastAssumptions: [
      { key: "safety_threshold", value: 10000, valueType: "number" },
      { key: "music_threshold", value: 10000, valueType: "number" },
      { key: "music_threshold_account_id", value: "savings", valueType: "string" },
    ],
    forecastWealthAnchors: [
      {
        monthKey: "2026-03",
        safetyBucketAmount: 9369.37,
        investmentBucketAmount: 9200,
        cashAccounts: {
          giro: 17.38,
          cash: 292.5,
          savings: 9059.49,
        },
        snapshotDate: "2026-03-24",
      },
    ],
  };

  const review = {
    row: {
      monthKey: "2026-04",
      anchorAppliesWithinMonth: false,
      safetyBucketStartAmount: 9369.37,
      salaryAllocationToSafetyAmount: 39.51,
      salaryAllocationToInvestmentAmount: 1050,
    },
    incomeEntries: [
      {
        incomeStreamId: "music-income",
        entryDate: "2026-04-01",
        amount: 1642.65,
        reserveAmount: 418.86,
        availableAmount: 1223.79,
      },
    ],
    expenseEntries: [],
  };

  const instructions = buildMonthAllocationInstructionsFromReview(review, importDraft);
  const musicInstruction = instructions.find((entry: { kind?: string }) => entry.kind === "music");

  assert.equal(instructions.length, 2);
  assert.equal(instructions[0]?.effectiveDate, "2026-04-01");
  assert.equal(musicInstruction?.thresholdAmountBeforeEntry, 9059.49);
  assert.equal(musicInstruction?.thresholdGapBeforeEntry, 940.51);
  assert.equal(musicInstruction?.toCashAmount, 940.51);
  assert.equal(musicInstruction?.toInvestmentAmount, 283.28);
});

test("keeps April music instructions visible when the money arrived before month start", () => {
  const importDraft = {
    forecastAssumptions: [
      { key: "safety_threshold", value: 10000, valueType: "number" },
      { key: "music_threshold", value: 10000, valueType: "number" },
      { key: "music_threshold_account_id", value: "savings", valueType: "string" },
    ],
    forecastWealthAnchors: [
      {
        monthKey: "2026-03",
        safetyBucketAmount: 10000,
        investmentBucketAmount: 9200,
        cashAccounts: {
          giro: 731.89,
          cash: 292.5,
          savings: 10000,
        },
        snapshotDate: "2026-03-25T20:36",
      },
    ],
  };

  const review = {
    row: {
      monthKey: "2026-04",
      anchorAppliesWithinMonth: false,
      safetyBucketStartAmount: 10000,
      salaryAllocationToSafetyAmount: 39.51,
      salaryAllocationToInvestmentAmount: 1050,
    },
    incomeEntries: [
      {
        incomeStreamId: "music-income",
        monthKey: "2026-04",
        entryDate: "2026-03-25T18:00",
        amount: 1642.65,
        reserveAmount: 418.86,
        availableAmount: 1223.79,
      },
    ],
    expenseEntries: [],
  };

  const instructions = buildMonthAllocationInstructionsFromReview(review, importDraft);
  const musicInstruction = instructions.find((entry: { kind?: string }) => entry.kind === "music");

  assert.equal(instructions.length, 2);
  assert.ok(musicInstruction);
  assert.equal(musicInstruction?.effectiveDate, "2026-03-25T18:00");
  assert.equal(musicInstruction?.happenedBeforeMonthStart, true);
  assert.equal(musicInstruction?.thresholdAmountBeforeEntry, 10000);
  assert.equal(musicInstruction?.thresholdGapBeforeEntry, 0);
  assert.equal(musicInstruction?.toCashAmount, 0);
  assert.equal(musicInstruction?.toInvestmentAmount, 1223.79);
});

test("prefers the reviewed threshold-account start over total cash when building music instructions", () => {
  const importDraft = {
    forecastAssumptions: [
      { key: "safety_threshold", value: 10000, valueType: "number" },
      { key: "music_threshold", value: 10000, valueType: "number" },
      { key: "music_threshold_account_id", value: "savings", valueType: "string" },
    ],
    forecastWealthAnchors: [
      {
        monthKey: "2026-04",
        safetyBucketAmount: 10172,
        investmentBucketAmount: 13258,
        snapshotDate: "2026-03-27T22:32",
      },
    ],
  };

  const review = {
    row: {
      monthKey: "2026-04",
      anchorAppliesWithinMonth: false,
      safetyBucketStartAmount: 10172,
      thresholdAccountStartAmount: 9059.49,
      salaryAllocationToSafetyAmount: 283.51,
      salaryAllocationToInvestmentAmount: 1050,
    },
    incomeEntries: [
      {
        incomeStreamId: "music-income",
        entryDate: "2026-04-05",
        amount: 1642.65,
        reserveAmount: 418.86,
        availableAmount: 1223.79,
      },
    ],
    expenseEntries: [],
  };

  const instructions = buildMonthAllocationInstructionsFromReview(review, importDraft);
  const musicInstruction = instructions.find((entry: { kind?: string }) => entry.kind === "music");

  assert.ok(musicInstruction);
  assert.equal(musicInstruction?.thresholdAmountBeforeEntry, 9059.49);
  assert.equal(musicInstruction?.thresholdGapBeforeEntry, 940.51);
  assert.equal(musicInstruction?.toCashAmount, 940.51);
  assert.equal(musicInstruction?.toInvestmentAmount, 283.28);
});
