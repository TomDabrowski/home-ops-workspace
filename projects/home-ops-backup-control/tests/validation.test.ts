import test from "node:test";
import assert from "node:assert/strict";

import { validateBackupJobs, validateBackupRunInput } from "../src/validation.ts";

test("validates backup jobs and run input", () => {
  const jobs = validateBackupJobs([
    {
      id: "docs",
      label: "Documents",
      sourceLabel: "Documents",
      destinationLabel: "NAS",
      maxAgeHours: 30,
    },
  ]);
  const run = validateBackupRunInput({
    jobId: "docs",
    completedAt: "2026-05-14T10:00",
    status: "success",
  });

  assert.equal(jobs[0]?.id, "docs");
  assert.equal(run.status, "success");
});

test("rejects malformed backup jobs", () => {
  assert.throws(
    () => validateBackupJobs([{ id: "bad", label: "Bad", sourceLabel: "A", destinationLabel: "B", maxAgeHours: 0 }]),
    /maxAgeHours must be >= 1/,
  );
});
