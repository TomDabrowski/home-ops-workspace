import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { extractEmailAddress, loadMessages, parseEml } from "../src/mail-loader.ts";

test("parses a single eml message", () => {
  const parsed = parseEml(
    [
      "From: billing@utility.example",
      "Date: Thu, 19 Mar 2026 08:12:00 +0000",
      "Subject: Your March electricity bill is ready",
      "Message-ID: <bill-2026-03@example>",
      "Content-Type: text/plain; charset=\"utf-8\"",
      "",
      "Please review the invoice for your latest electricity usage.",
    ].join("\n"),
    "/tmp/bill.eml",
  );

  assert.equal(parsed.id, "bill-2026-03@example");
  assert.equal(parsed.from, "billing@utility.example");
  assert.equal(parsed.subject, "Your March electricity bill is ready");
  assert.match(parsed.snippet ?? "", /invoice/i);
  assert.equal(parsed.sourceType, "eml");
});

test("loads every eml file from a directory", async () => {
  const directoryPath = path.resolve(process.cwd(), "data/sample-eml");
  const messages = await loadMessages(directoryPath);

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.sourceType, "eml");
  assert.equal(messages[1]?.sourceType, "eml");
  assert.match(messages.map((message) => message.subject).join(" "), /statement/i);
});

test("extracts the address from formatted from headers", () => {
  assert.equal(extractEmailAddress("Streaming Service <hello@streaming.example>"), "hello@streaming.example");
  assert.equal(extractEmailAddress("billing@utility.example"), "billing@utility.example");
});
