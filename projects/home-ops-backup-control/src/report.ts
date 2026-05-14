import type {
  BackupHealthStatus,
  BackupJob,
  BackupJobStatus,
  BackupReport,
  BackupRunRecord,
} from "./types.ts";

export function hoursBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (to - from) / 36e5);
}

export function latestRunForJob(runs: BackupRunRecord[], jobId: string): BackupRunRecord | null {
  return runs
    .filter((run) => run.jobId === jobId)
    .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)))[0] ?? null;
}

export function statusForJob(job: BackupJob, latestRun: BackupRunRecord | null, checkedAt: string): BackupJobStatus {
  if (!latestRun) {
    return {
      job,
      latestRun,
      status: "warn",
      ageHours: null,
      detail: "No recorded backup run yet.",
    };
  }

  const ageHours = hoursBetween(latestRun.completedAt, checkedAt);
  if (latestRun.status === "failed") {
    return {
      job,
      latestRun,
      status: "failed",
      ageHours,
      detail: `Latest run failed ${ageHours.toFixed(1)} hours ago.`,
    };
  }

  if (latestRun.status !== "success") {
    return {
      job,
      latestRun,
      status: "warn",
      ageHours,
      detail: `Latest run status is ${latestRun.status}.`,
    };
  }

  if (ageHours > job.maxAgeHours) {
    return {
      job,
      latestRun,
      status: "warn",
      ageHours,
      detail: `Latest successful backup is ${ageHours.toFixed(1)} hours old; max is ${job.maxAgeHours}.`,
    };
  }

  return {
    job,
    latestRun,
    status: "ok",
    ageHours,
    detail: `Latest successful backup is ${ageHours.toFixed(1)} hours old.`,
  };
}

function worstStatus(statuses: BackupHealthStatus[]): BackupHealthStatus {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

export function buildBackupReport(jobs: BackupJob[], runs: BackupRunRecord[], checkedAt = new Date().toISOString()): BackupReport {
  const activeJobs = jobs.filter((job) => job.enabled !== false);
  const jobStatuses = activeJobs.map((job) => statusForJob(job, latestRunForJob(runs, job.id), checkedAt));
  const statuses = jobStatuses.map((entry) => entry.status);
  return {
    summary: {
      checkedAt,
      total: jobStatuses.length,
      ok: jobStatuses.filter((entry) => entry.status === "ok").length,
      warn: jobStatuses.filter((entry) => entry.status === "warn").length,
      failed: jobStatuses.filter((entry) => entry.status === "failed").length,
      status: worstStatus(statuses),
    },
    jobs: jobStatuses,
  };
}
