import { cp, mkdir, open, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadAccountsConfig, runAccountSuggestions, sanitizeAccountId } from "./account-runner.ts";
import type {
  AccountLatestSummary,
  LatestSummaryReport,
  ScheduledRunLock,
  ScheduledRunLogEntry,
} from "./types.ts";

function timestampLabel(date = new Date()): string {
  return date.toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export async function acquireRunLock(lockPath: string, configPath: string): Promise<ScheduledRunLock> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const lockData: ScheduledRunLock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: os.hostname(),
    configPath,
  };

  const handle = await open(lockPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(lockData, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }

  return lockData;
}

export async function releaseRunLock(lockPath: string): Promise<void> {
  await unlink(lockPath).catch(() => undefined);
}

export async function appendRunLog(logPath: string, entry: ScheduledRunLogEntry): Promise<void> {
  await mkdir(path.dirname(logPath), { recursive: true });

  let entries: ScheduledRunLogEntry[] = [];
  try {
    const raw = await readFile(logPath, "utf8");
    const parsed = JSON.parse(raw) as ScheduledRunLogEntry[];
    if (Array.isArray(parsed)) {
      entries = parsed;
    }
  } catch {
    entries = [];
  }

  entries.push(entry);
  const trimmed = entries.slice(-100);
  await writeFile(logPath, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
}

export async function buildLatestSummary(reportsDir: string, accountIds: string[]): Promise<LatestSummaryReport> {
  const accounts: AccountLatestSummary[] = [];

  for (const accountId of accountIds) {
    const reportJsonPath = path.join(reportsDir, sanitizeAccountId(accountId), "report.json");

    try {
      const raw = await readFile(reportJsonPath, "utf8");
      const report = JSON.parse(raw) as {
        generatedAt?: string;
        totalMessages: number;
        countsByCategory: Record<string, number>;
        suggestions?: Array<{ safeToAutomate?: boolean }>;
      };

      accounts.push({
        accountId,
        generatedAt: report.generatedAt,
        totalMessages: report.totalMessages ?? 0,
        countsByCategory: report.countsByCategory ?? {},
        readyCount: (report.suggestions ?? []).filter((suggestion) => suggestion.safeToAutomate).length,
      });
    } catch {
      accounts.push({
        accountId,
        totalMessages: 0,
        countsByCategory: {},
        readyCount: 0,
      });
    }
  }

  const categoryCounts = new Map<string, number>();
  let totalMessages = 0;
  let readyCount = 0;
  let accountsWithMessages = 0;

  for (const account of accounts) {
    totalMessages += account.totalMessages;
    readyCount += account.readyCount;
    if (account.totalMessages > 0) {
      accountsWithMessages += 1;
    }

    for (const [category, count] of Object.entries(account.countsByCategory)) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + count);
    }
  }

  const topCategories = [...categoryCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  return {
    generatedAt: new Date().toISOString(),
    accountCount: accounts.length,
    accountsWithMessages,
    totalMessages,
    readyCount,
    topCategories,
    accounts,
  };
}

export async function writeLatestSummary(reportsDir: string, accountIds: string[]): Promise<LatestSummaryReport> {
  const summary = await buildLatestSummary(reportsDir, accountIds);
  const summaryTextLines = [
    "Mail Sorter Latest Summary",
    `Generated: ${summary.generatedAt}`,
    `Accounts: ${summary.accountCount}`,
    `Accounts with messages: ${summary.accountsWithMessages}`,
    `Total messages: ${summary.totalMessages}`,
    `Ready suggestions: ${summary.readyCount}`,
    `Top categories: ${summary.topCategories.map((entry) => `${entry.category}: ${entry.count}`).join(", ") || "none"}`,
    "",
  ];

  for (const account of summary.accounts) {
    summaryTextLines.push(`- ${account.accountId}`);
    summaryTextLines.push(`  Messages: ${account.totalMessages}`);
    summaryTextLines.push(`  Ready: ${account.readyCount}`);
    summaryTextLines.push(
      `  Categories: ${Object.entries(account.countsByCategory)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([category, count]) => `${category}: ${count}`)
        .join(", ") || "none"}`,
    );
    summaryTextLines.push("");
  }

  await mkdir(reportsDir, { recursive: true });
  await writeFile(path.join(reportsDir, "latest-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(path.join(reportsDir, "latest-summary.txt"), `${summaryTextLines.join("\n").trimEnd()}\n`, "utf8");

  return summary;
}

export async function snapshotAccountReports(reportsDir: string, accountIds: string[], snapshotRoot: string): Promise<string[]> {
  const label = timestampLabel();
  const created: string[] = [];

  for (const accountId of accountIds) {
    const sourceDir = path.join(reportsDir, sanitizeAccountId(accountId));

    try {
      const sourceStats = await stat(sourceDir);
      if (!sourceStats.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    const targetDir = path.join(snapshotRoot, sanitizeAccountId(accountId), label);
    await mkdir(path.dirname(targetDir), { recursive: true });
    await cp(sourceDir, targetDir, { recursive: true });
    created.push(targetDir);
  }

  return created;
}

export async function pruneSnapshots(snapshotBaseDir: string, keepSnapshots: number): Promise<void> {
  if (keepSnapshots < 1) {
    return;
  }

  let accountEntries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    accountEntries = await readdir(snapshotBaseDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const accountEntry of accountEntries) {
    if (!accountEntry.isDirectory()) {
      continue;
    }

    const accountDir = path.join(snapshotBaseDir, accountEntry.name);
    const snapshotEntries = await readdir(accountDir, { withFileTypes: true });
    const snapshots = snapshotEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));

    for (const stale of snapshots.slice(keepSnapshots)) {
      await rm(path.join(accountDir, stale), { recursive: true, force: true });
    }
  }
}

export async function runScheduledAccountCycle(configPath: string): Promise<void> {
  const rootDir = process.cwd();
  const config = await loadAccountsConfig(configPath);
  const reportsDir = path.resolve(rootDir, config.reportsDir ?? "reports/accounts");
  const lockPath = path.resolve(rootDir, config.lockPath ?? "reports/accounts/.run.lock");
  const runLogPath = path.resolve(rootDir, config.runLogPath ?? "reports/accounts/run-log.json");
  const startedAt = new Date().toISOString();

  try {
    await acquireRunLock(lockPath, configPath);
  } catch (error: unknown) {
    const message = `Another scheduled run is already active (${lockPath}).`;
    await appendRunLog(runLogPath, {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failure",
      configPath,
      message,
    });
    throw new Error(message);
  }

  try {
    await runAccountSuggestions(configPath);

    const snapshotRoot = path.join(reportsDir, "_history");
    await snapshotAccountReports(reportsDir, config.accounts.map((account) => account.id), snapshotRoot);
    await writeLatestSummary(reportsDir, config.accounts.map((account) => account.id));

    const keepSnapshots = config.retention?.keepSnapshots ?? 12;
    await pruneSnapshots(snapshotRoot, keepSnapshots);

    await appendRunLog(runLogPath, {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
      configPath,
      message: `Scheduled run completed for ${config.accounts.length} account(s).`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await appendRunLog(runLogPath, {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failure",
      configPath,
      message,
    });
    throw error;
  } finally {
    await releaseRunLock(lockPath);
  }
}
