import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeAccountId } from "../src/account-runner.ts";
import { selectUids } from "../src/imap-source.ts";

test("sanitizes account ids for report directories", () => {
  assert.equal(sanitizeAccountId("Personal Inbox"), "personal-inbox");
  assert.equal(sanitizeAccountId("mail/account#1"), "mail-account-1");
});

test("selects the newest uids up to the configured limit", () => {
  assert.deepEqual(selectUids([100, 102, 101, 98], 2), [101, 102]);
  assert.deepEqual(selectUids([], 10), []);
});
