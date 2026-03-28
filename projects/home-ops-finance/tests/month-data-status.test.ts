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

test("explains when a future month has a prior snapshot but no explicit month-start anchor", () => {
  const result = buildMonthDataStatus({
    monthKey: "2026-04",
    currentMonthKey: "2026-03",
    row: {
      safetyBucketStartAmount: 11063.9,
      investmentBucketStartAmount: 14308,
    },
    previousRow: {
      safetyBucketEndAmount: 11063.9,
      investmentBucketEndAmount: 14308,
    },
    latestSnapshot: {
      snapshotDate: "2026-03-27T22:27",
    },
    wealthSnapshotPersistence: "project",
    formatDisplayDate: (value) => value,
  });

  assert.equal(result.status, "Info");
  assert.match(result.detail, /keinen expliziten Monatsanfang für 2026-04/);
  assert.equal(result.summaryEntries.find(([label]) => label === "Monatsanfang gesetzt")?.[1], "Nein");
});
