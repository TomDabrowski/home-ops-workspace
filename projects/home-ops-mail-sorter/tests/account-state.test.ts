import test from "node:test";
import assert from "node:assert/strict";

import { filterUnseenMessages, getMessageFingerprint, markMessagesProcessed } from "../src/account-state.ts";
import type { MailMessage, ProcessedState } from "../src/types.ts";

test("uses source path as the preferred message fingerprint", () => {
  const message: MailMessage = {
    id: "abc",
    receivedAt: "2026-03-20T16:00:00.000Z",
    from: "hello@example.com",
    subject: "Hello",
    sourcePath: "imap://account/INBOX#uid=123",
  };

  assert.equal(getMessageFingerprint(message), "imap://account/INBOX#uid=123");
});

test("filters out already processed messages per account", () => {
  const state: ProcessedState = {
    accounts: [
      {
        accountId: "personal",
        messages: [{ fingerprint: "imap://personal/INBOX#uid=123", seenAt: "2026-03-20T16:00:00.000Z" }],
      },
    ],
  };
  const messages: MailMessage[] = [
    {
      id: "one",
      receivedAt: "2026-03-20T16:00:00.000Z",
      from: "a@example.com",
      subject: "Seen",
      sourcePath: "imap://personal/INBOX#uid=123",
    },
    {
      id: "two",
      receivedAt: "2026-03-20T16:01:00.000Z",
      from: "b@example.com",
      subject: "New",
      sourcePath: "imap://personal/INBOX#uid=124",
    },
  ];

  const unseen = filterUnseenMessages(state, "personal", messages);

  assert.equal(unseen.length, 1);
  assert.equal(unseen[0]?.id, "two");
});

test("marks processed messages without duplicating the same fingerprint", () => {
  const state: ProcessedState = { accounts: [] };
  const message: MailMessage = {
    id: "one",
    receivedAt: "2026-03-20T16:00:00.000Z",
    from: "a@example.com",
    subject: "Hello",
    sourcePath: "imap://personal/INBOX#uid=123",
  };

  const once = markMessagesProcessed(state, "personal", [message]);
  const twice = markMessagesProcessed(once, "personal", [message]);

  assert.equal(once.accounts[0]?.messages.length, 1);
  assert.equal(twice.accounts[0]?.messages.length, 1);
});
