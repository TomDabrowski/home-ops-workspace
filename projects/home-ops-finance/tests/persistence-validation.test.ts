import test from "node:test";
import assert from "node:assert/strict";

import {
  ValidationError,
  assertImportDraft,
  parseHouseholdState,
  parseMappingState,
  parseMonthlyExpenseOverrideCollection,
} from "../src/persistence-validation.ts";

test("parses persisted mapping state and keeps optional fields", () => {
  const parsed = parseMappingState({
    "expense-1": {
      categoryId: "food",
      accountId: "giro",
      reviewed: true,
      updatedAt: "2026-03-25T08:00:00.000Z",
    },
  });

  assert.deepEqual(parsed, {
    "expense-1": {
      categoryId: "food",
      accountId: "giro",
      reviewed: true,
      updatedAt: "2026-03-25T08:00:00.000Z",
    },
  });
});

test("rejects malformed monthly expense override payloads early", () => {
  assert.throws(
    () =>
      parseMonthlyExpenseOverrideCollection([
        {
          id: "expense-1",
          monthKey: "2026-03",
          entryDate: "2026-03-10",
          description: "Broken amount",
          amount: "120",
        },
      ]),
    ValidationError,
  );
});

test("parses household state with insurance metadata", () => {
  const parsed = parseHouseholdState({
    items: [
      {
        id: "household-1",
        name: "Bett",
        area: "general",
        estimatedValue: 950,
        isActive: true,
      },
    ],
    insuranceCoverageAmount: 20000,
    insuranceCoverageLabel: "Stand 2026",
  });

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.insuranceCoverageAmount, 20000);
  assert.equal(parsed.insuranceCoverageLabel, "Stand 2026");
});

test("rejects import drafts that are missing required top-level collections", () => {
  assert.throws(
    () =>
      assertImportDraft({
        source: "xlsx",
        workbookPath: "/tmp/example.xlsx",
      }),
    ValidationError,
  );
});
