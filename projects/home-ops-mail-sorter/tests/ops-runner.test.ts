import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { acquireRunLock, appendRunLog, buildLatestSummary, pruneSnapshots, releaseRunLock, snapshotAccountReports, writeLatestSummary } from "../src/ops-runner.ts";

test("creates timestamped snapshots for account report folders", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mail-sorter-ops-"));
  const reportsDir = path.join(tmpDir, "reports");
  const sourceDir = path.join(reportsDir, "personal-inbox");
  const snapshotRoot = path.join(reportsDir, "_history");

  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, "report.json"), "{\"ok\":true}\n", "utf8");

  const created = await snapshotAccountReports(reportsDir, ["personal-inbox"], snapshotRoot);

  assert.equal(created.length, 1);
  assert.match(created[0] ?? "", /personal-inbox/);
});

test("prunes old snapshot folders beyond the keep limit", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mail-sorter-prune-"));
  const accountDir = path.join(tmpDir, "personal-inbox");

  await mkdir(path.join(accountDir, "2026-03-20T10-00-00Z"), { recursive: true });
  await mkdir(path.join(accountDir, "2026-03-20T11-00-00Z"), { recursive: true });
  await mkdir(path.join(accountDir, "2026-03-20T12-00-00Z"), { recursive: true });

  await pruneSnapshots(tmpDir, 2);

  const remaining = (await readdir(accountDir)).sort();
  assert.deepEqual(remaining, ["2026-03-20T11-00-00Z", "2026-03-20T12-00-00Z"]);
});

test("acquires and releases a scheduled run lock", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mail-sorter-lock-"));
  const lockPath = path.join(tmpDir, "run.lock");

  await acquireRunLock(lockPath, "/tmp/accounts.json");

  await assert.rejects(() => acquireRunLock(lockPath, "/tmp/accounts.json"));

  await releaseRunLock(lockPath);
  await acquireRunLock(lockPath, "/tmp/accounts.json");
});

test("appends run log entries and keeps them as json", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mail-sorter-log-"));
  const logPath = path.join(tmpDir, "run-log.json");

  await appendRunLog(logPath, {
    startedAt: "2026-03-20T10:00:00.000Z",
    finishedAt: "2026-03-20T10:01:00.000Z",
    status: "success",
    configPath: "/tmp/accounts.json",
    message: "ok",
  });
  await appendRunLog(logPath, {
    startedAt: "2026-03-20T11:00:00.000Z",
    finishedAt: "2026-03-20T11:01:00.000Z",
    status: "failure",
    configPath: "/tmp/accounts.json",
    message: "failed",
  });

  const parsed = JSON.parse(await readFile(logPath, "utf8")) as Array<{ status: string; message: string }>;
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.status, "success");
  assert.equal(parsed[1]?.message, "failed");
});

test("builds a latest summary across accounts", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mail-sorter-summary-"));
  const reportsDir = path.join(tmpDir, "reports");
  const personalDir = path.join(reportsDir, "personal-inbox");
  const workDir = path.join(reportsDir, "work-inbox");

  await mkdir(personalDir, { recursive: true });
  await mkdir(workDir, { recursive: true });

  await writeFile(
    path.join(personalDir, "report.json"),
    JSON.stringify({
      generatedAt: "2026-03-20T16:00:00.000Z",
      totalMessages: 2,
      countsByCategory: { marketing: 1, subscription: 1 },
      suggestions: [{ safeToAutomate: true }, { safeToAutomate: false }],
    }),
    "utf8",
  );
  await writeFile(
    path.join(workDir, "report.json"),
    JSON.stringify({
      generatedAt: "2026-03-20T16:05:00.000Z",
      totalMessages: 1,
      countsByCategory: { finance_statement: 1 },
      suggestions: [{ safeToAutomate: false }],
    }),
    "utf8",
  );

  const summary = await buildLatestSummary(reportsDir, ["personal-inbox", "work-inbox"]);

  assert.equal(summary.totalMessages, 3);
  assert.equal(summary.readyCount, 1);
  assert.equal(summary.accountsWithMessages, 2);
  assert.deepEqual(summary.topCategories[0], { category: "finance_statement", count: 1 });
});

test("writes latest summary files", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mail-sorter-summary-files-"));
  const reportsDir = path.join(tmpDir, "reports");
  const personalDir = path.join(reportsDir, "personal-inbox");

  await mkdir(personalDir, { recursive: true });
  await writeFile(
    path.join(personalDir, "report.json"),
    JSON.stringify({
      generatedAt: "2026-03-20T16:00:00.000Z",
      totalMessages: 1,
      countsByCategory: { marketing: 1 },
      suggestions: [{ safeToAutomate: true }],
    }),
    "utf8",
  );

  await writeLatestSummary(reportsDir, ["personal-inbox"]);

  const summaryJson = await readFile(path.join(reportsDir, "latest-summary.json"), "utf8");
  const summaryText = await readFile(path.join(reportsDir, "latest-summary.txt"), "utf8");
  assert.match(summaryJson, /"totalMessages": 1/);
  assert.match(summaryText, /Ready suggestions: 1/);
});
