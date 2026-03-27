// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import { buildMonthDataStatus } from "../app/shared/month-data-status.js";

test("flags browser fallback snapshots in the current month", () => {
  const result = buildMonthDataStatus({
    monthKey: "2026-03",
    currentMonthKey: "2026-03",
    row: {
      safetyBucketStartAmount: 100,
      investmentBucketStartAmount: 200,
    },
    previousRow: {
      safetyBucketEndAmount: 100,
      investmentBucketEndAmount: 200,
    },
    latestSnapshot: {
      snapshotDate: "2026-03-27T10:00",
    },
    wealthSnapshotPersistence: "browser",
    formatDisplayDate: (value) => value,
  });

  assert.equal(result.status, "Prüfen");
  assert.match(result.detail, /Browser-Ist-Stand/);
});
