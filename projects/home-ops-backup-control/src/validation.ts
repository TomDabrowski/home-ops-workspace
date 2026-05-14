import {
  assertArray,
  assertDateLike,
  assertEnum,
  assertFiniteNumber,
  assertPlainObject,
  assertString,
  optionalBoolean,
  optionalString,
} from "@home-ops/framework";

import type { BackupJob, BackupRunRecord } from "./types.ts";

export function validateBackupJobs(value: unknown): BackupJob[] {
  return assertArray(value, "backup jobs").map((entry, index) => {
    const job = assertPlainObject(entry, `backup job ${index}`);
    return {
      id: assertString(job.id, `backup job ${index}.id`),
      label: assertString(job.label, `backup job ${index}.label`),
      sourceLabel: assertString(job.sourceLabel, `backup job ${index}.sourceLabel`),
      destinationLabel: assertString(job.destinationLabel, `backup job ${index}.destinationLabel`),
      maxAgeHours: assertFiniteNumber(job.maxAgeHours, `backup job ${index}.maxAgeHours`, { min: 1 }),
      enabled: optionalBoolean(job.enabled, `backup job ${index}.enabled`),
    };
  });
}

export function validateBackupRuns(value: unknown): BackupRunRecord[] {
  return assertArray(value, "backup runs").map((entry, index) => {
    const run = assertPlainObject(entry, `backup run ${index}`);
    return {
      id: assertString(run.id, `backup run ${index}.id`),
      jobId: assertString(run.jobId, `backup run ${index}.jobId`),
      completedAt: assertDateLike(run.completedAt, `backup run ${index}.completedAt`),
      status: assertEnum(run.status, `backup run ${index}.status`, ["success", "failed", "unknown"] as const),
      note: optionalString(run.note, `backup run ${index}.note`),
    };
  });
}

export function validateBackupRunInput(value: unknown): Omit<BackupRunRecord, "id"> {
  const run = assertPlainObject(value, "backup run input");
  return {
    jobId: assertString(run.jobId, "backup run input.jobId"),
    completedAt: assertDateLike(run.completedAt, "backup run input.completedAt"),
    status: assertEnum(run.status, "backup run input.status", ["success", "failed", "unknown"] as const),
    note: optionalString(run.note, "backup run input.note"),
  };
}
