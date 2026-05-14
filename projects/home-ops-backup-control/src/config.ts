import { createLocalConfigResolver } from "@home-ops/framework";

import type { BackupJob } from "./types.ts";
import { validateBackupJobs } from "./validation.ts";

export interface BackupControlConfig extends Record<string, unknown> {
  dataDir?: string;
  jobs?: BackupJob[];
}

export const backupConfig = createLocalConfigResolver<BackupControlConfig>({
  envPrefix: "HOME_OPS_BACKUP",
  defaultDataDir: "data",
  parseConfig(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    return {
      dataDir: typeof raw.dataDir === "string" ? raw.dataDir : undefined,
      jobs: raw.jobs === undefined ? undefined : validateBackupJobs(raw.jobs),
    };
  },
});

export function configuredJobs(): BackupJob[] {
  return (backupConfig.readConfig().jobs ?? []).filter((job) => job.enabled !== false);
}
