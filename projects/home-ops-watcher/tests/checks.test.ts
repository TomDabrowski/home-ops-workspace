import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { buildWatchReport, runTargetCheck, summarizeResults } from "../src/checks.ts";

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

test("builds a report from targets and latest results", () => {
  const report = buildWatchReport(
    [{ id: "one", label: "One", kind: "http", url: "http://example.test" }],
    [{ targetId: "one", label: "One", kind: "http", checkedAt: "now", status: "down", latencyMs: 1, detail: "nope" }],
  );

  assert.equal(report.summary.status, "down");
  assert.equal(report.targets.length, 1);
});
