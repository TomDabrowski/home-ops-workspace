export type BackupRunStatus = "success" | "failed" | "unknown";
export type BackupHealthStatus = "ok" | "warn" | "failed";

export interface BackupJob {
  id: string;
  label: string;
  sourceLabel: string;
  destinationLabel: string;
  maxAgeHours: number;
  enabled?: boolean;
}

export interface BackupRunRecord {
  id: string;
  jobId: string;
  completedAt: string;
  status: BackupRunStatus;
  note?: string;
}

export interface BackupJobStatus {
  job: BackupJob;
  latestRun: BackupRunRecord | null;
  status: BackupHealthStatus;
  ageHours: number | null;
  detail: string;
}

export interface BackupSummary {
  checkedAt: string;
  total: number;
  ok: number;
  warn: number;
  failed: number;
  status: BackupHealthStatus;
}

export interface BackupReport {
  summary: BackupSummary;
  jobs: BackupJobStatus[];
}
