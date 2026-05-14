import { createJsonStore } from "@home-ops/framework";

import { backupConfig } from "./config.ts";
import type { BackupRunRecord } from "./types.ts";
import { validateBackupRuns } from "./validation.ts";

export const backupRunStore = createJsonStore<BackupRunRecord[]>(
  backupConfig.dataPath("backup-runs.json"),
  {
    fallback: [],
    validator: validateBackupRuns,
  },
);

export function appendBackupRun(input: Omit<BackupRunRecord, "id">, limit = 1000): BackupRunRecord[] {
  return backupRunStore.update((current) => {
    const record = {
      ...input,
      id: `${input.jobId}-${input.completedAt}`,
    };
    const next = [...current.filter((entry) => entry.id !== record.id), record]
      .sort((left, right) => String(left.completedAt).localeCompare(String(right.completedAt)));
    return next.slice(Math.max(0, next.length - limit));
  });
}
