import test from "node:test";
import assert from "node:assert/strict";

import { validateWatchTargets } from "../src/validation.ts";

test("validates http and tcp targets", () => {
  const targets = validateWatchTargets([
    { id: "site", label: "Site", kind: "http", url: "http://127.0.0.1", expectedStatus: 200 },
    { id: "ssh", label: "SSH", kind: "tcp", host: "127.0.0.1", port: 22 },
    { id: "backup", label: "Backup", kind: "json-status", url: "http://127.0.0.1:4321/api/status" },
  ]);

  assert.equal(targets.length, 3);
  assert.equal(targets[0]?.kind, "http");
  assert.equal(targets[1]?.kind, "tcp");
  assert.equal(targets[2]?.kind, "json-status");
});

test("rejects tcp targets without a port", () => {
  assert.throws(
    () => validateWatchTargets([{ id: "bad", label: "Bad", kind: "tcp", host: "127.0.0.1" }]),
    /port must be a finite number/,
  );
});
