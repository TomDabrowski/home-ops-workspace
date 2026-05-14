import test from "node:test";
import assert from "node:assert/strict";

import { buildBackupReport, hoursBetween } from "../src/report.ts";

test("calculates backup age in hours", () => {
  assert.equal(hoursBetween("2026-05-14T00:00", "2026-05-14T12:00"), 12);
});

test("marks stale successful backups as warn", () => {
  const report = buildBackupReport(
    [{
      id: "docs",
      label: "Documents",
      sourceLabel: "Documents",
      destinationLabel: "NAS",
      maxAgeHours: 24,
    }],
    [{
      id: "docs-2026-05-12",
      jobId: "docs",
      completedAt: "2026-05-12T12:00",
      status: "success",
    }],
    "2026-05-14T12:00",
  );

  assert.equal(report.summary.status, "warn");
  assert.match(report.jobs[0]?.detail ?? "", /48.0 hours old/);
});

test("failed latest backups dominate the summary", () => {
  const report = buildBackupReport(
    [{
      id: "docs",
      label: "Documents",
      sourceLabel: "Documents",
      destinationLabel: "NAS",
      maxAgeHours: 24,
    }],
    [{
      id: "docs-failed",
      jobId: "docs",
      completedAt: "2026-05-14T11:00",
      status: "failed",
    }],
    "2026-05-14T12:00",
  );

  assert.equal(report.summary.status, "failed");
  assert.equal(report.jobs[0]?.status, "failed");
});

test("ignores disabled backup jobs", () => {
  const report = buildBackupReport(
    [
      {
        id: "docs",
        label: "Documents",
        sourceLabel: "Documents",
        destinationLabel: "NAS",
        maxAgeHours: 24,
        enabled: false,
      },
    ],
    [],
    "2026-05-14T12:00",
  );

  assert.equal(report.summary.total, 0);
  assert.equal(report.summary.status, "ok");
});
