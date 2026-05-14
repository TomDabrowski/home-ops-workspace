import test from "node:test";
import assert from "node:assert/strict";

import { validateWatchTargets } from "../src/validation.ts";

test("validates http and tcp targets", () => {
  const targets = validateWatchTargets([
    { id: "site", label: "Site", kind: "http", url: "http://127.0.0.1", expectedStatus: 200 },
    { id: "ssh", label: "SSH", kind: "tcp", host: "127.0.0.1", port: 22 },
  ]);

  assert.equal(targets.length, 2);
  assert.equal(targets[0]?.kind, "http");
  assert.equal(targets[1]?.kind, "tcp");
});

test("rejects tcp targets without a port", () => {
  assert.throws(
    () => validateWatchTargets([{ id: "bad", label: "Bad", kind: "tcp", host: "127.0.0.1" }]),
    /port must be a finite number/,
  );
});
