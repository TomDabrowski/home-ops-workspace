import test from "node:test";
import assert from "node:assert/strict";

import { parseBackupCliCommand } from "../src/cli-options.ts";

test("parses status as the default command", () => {
  assert.deepEqual(parseBackupCliCommand([], new Date("2026-05-14T12:00:00Z")), {
    command: "status",
  });
});

test("parses record command flags", () => {
  assert.deepEqual(
    parseBackupCliCommand([
      "record",
      "--job",
      "documents-backup",
      "--status",
      "failed",
      "--completed-at",
      "2026-05-14T12:00",
      "--note=Disk missing",
    ]),
    {
      command: "record",
      input: {
        jobId: "documents-backup",
        completedAt: "2026-05-14T12:00",
        status: "failed",
        note: "Disk missing",
      },
    },
  );
});

test("defaults record timestamps and success status", () => {
  assert.deepEqual(
    parseBackupCliCommand(["record", "--job", "documents-backup"], new Date("2026-05-14T12:00:00Z")),
    {
      command: "record",
      input: {
        jobId: "documents-backup",
        completedAt: "2026-05-14T12:00",
        status: "success",
        note: undefined,
      },
    },
  );
});
