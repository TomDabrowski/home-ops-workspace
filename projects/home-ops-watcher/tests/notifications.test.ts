import test from "node:test";
import assert from "node:assert/strict";

import { notificationPayload, sendWebhookNotification, shouldNotify } from "../src/notifications.ts";
import type { WatchReport } from "../src/types.ts";

const warnReport: WatchReport = {
  summary: {
    checkedAt: "2026-05-15T12:00",
    total: 1,
    ok: 0,
    warn: 1,
    down: 0,
    status: "warn",
  },
  targets: [{ id: "backup", label: "Backup", kind: "json-status", url: "http://127.0.0.1:4321/api/status" }],
  latestResults: [{
    targetId: "backup",
    label: "Backup",
    kind: "json-status",
    checkedAt: "2026-05-15T12:00",
    status: "warn",
    latencyMs: 10,
    detail: "No check recorded yet.",
  }],
};

test("notifies only at or above the configured minimum status", () => {
  assert.equal(shouldNotify(warnReport, "warn"), true);
  assert.equal(shouldNotify(warnReport, "down"), false);
});

test("builds a compact webhook payload with problem targets", () => {
  const payload = notificationPayload(warnReport);

  assert.equal(payload.source, "home-ops-watcher");
  assert.equal(payload.status, "warn");
  assert.equal(payload.problems.length, 1);
  assert.equal(payload.problems[0]?.targetId, "backup");
});

test("sends webhook notifications as JSON", async () => {
  let requestBody = "";
  const fetchImpl: typeof fetch = async (_url, init) => {
    requestBody = String(init?.body ?? "");
    return new Response("", { status: 200 });
  };

  await sendWebhookNotification("http://127.0.0.1:9999/hook", warnReport, fetchImpl);
  assert.equal(JSON.parse(requestBody).status, "warn");
});
