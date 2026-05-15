import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { buildWatchReport, latestResultsForTargets, runTargetCheck, summarizeResults } from "../src/checks.ts";

test("summarizes worst status across results", () => {
  const checkedAt = "2026-05-14T12:00:00.000Z";
  const summary = summarizeResults([
    { targetId: "ok", label: "OK", kind: "http", checkedAt, status: "ok", latencyMs: 10, detail: "ok" },
    { targetId: "warn", label: "Warn", kind: "http", checkedAt, status: "warn", latencyMs: 10, detail: "warn" },
  ]);

  assert.equal(summary.status, "warn");
  assert.equal(summary.total, 2);
});

test("runs an http check against a local server", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(204);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await runTargetCheck({
      id: "local",
      label: "Local",
      kind: "http",
      url: `http://127.0.0.1:${address.port}`,
      expectedStatus: 204,
    });
    assert.equal(result.status, "ok");
    assert.match(result.detail, /HTTP 204/);
  } finally {
    server.close();
  }
});

test("maps json status checks from local apps", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ summary: { status: "failed" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await runTargetCheck({
      id: "backup-control",
      label: "Backup Control",
      kind: "json-status",
      url: `http://127.0.0.1:${address.port}/api/status`,
    });
    assert.equal(result.status, "down");
    assert.match(result.detail, /summary\.status=failed/);
  } finally {
    server.close();
  }
});

test("builds a report from targets and latest results", () => {
  const report = buildWatchReport(
    [{ id: "one", label: "One", kind: "http", url: "http://example.test" }],
    [{ targetId: "one", label: "One", kind: "http", checkedAt: "now", status: "down", latencyMs: 1, detail: "nope" }],
    "2026-05-14T12:00",
  );

  assert.equal(report.summary.status, "down");
  assert.equal(report.targets.length, 1);
});

test("marks targets without checks as warn", () => {
  const report = buildWatchReport(
    [{ id: "one", label: "One", kind: "http", url: "http://example.test" }],
    [],
    "2026-05-14T12:00",
  );

  assert.equal(report.summary.status, "warn");
  assert.equal(report.latestResults[0]?.detail, "No check recorded yet.");
});

test("marks stale checks as warn when staleAfterHours is exceeded", () => {
  const report = buildWatchReport(
    [{ id: "one", label: "One", kind: "http", url: "http://example.test", staleAfterHours: 2 }],
    [{ targetId: "one", label: "One", kind: "http", checkedAt: "2026-05-14T09:00", status: "ok", latencyMs: 1, detail: "HTTP 200" }],
    "2026-05-14T12:00",
  );

  assert.equal(report.summary.status, "warn");
  assert.match(report.latestResults[0]?.detail ?? "", /stale after 3.0 hours/);
});

test("keeps down stale checks down", () => {
  const report = buildWatchReport(
    [{ id: "one", label: "One", kind: "http", url: "http://example.test", staleAfterHours: 2 }],
    [{ targetId: "one", label: "One", kind: "http", checkedAt: "2026-05-14T09:00", status: "down", latencyMs: 1, detail: "timeout" }],
    "2026-05-14T12:00",
  );

  assert.equal(report.summary.status, "down");
  assert.equal(report.latestResults[0]?.status, "down");
});

test("selects latest history result for each configured target", () => {
  const latest = latestResultsForTargets(
    [{ id: "one", label: "One", kind: "http", url: "http://example.test" }],
    [
      { id: "old", targetId: "one", label: "One", kind: "http", checkedAt: "2026-05-14T09:00", status: "down", latencyMs: 1, detail: "old" },
      { id: "new", targetId: "one", label: "One", kind: "http", checkedAt: "2026-05-14T10:00", status: "ok", latencyMs: 1, detail: "new" },
    ],
  );

  assert.equal(latest.length, 1);
  assert.equal(latest[0]?.detail, "new");
});
