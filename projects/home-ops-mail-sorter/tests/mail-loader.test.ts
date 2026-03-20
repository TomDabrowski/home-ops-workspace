import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { extractEmailAddress, loadMessages, parseEml, parseMbox } from "../src/mail-loader.ts";

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

test("parses multiple messages from an mbox export", () => {
  const messages = parseMbox(
    [
      "From sender@example.com Thu Mar 19 08:12:00 2026",
      "From: billing@utility.example",
      "Date: Thu, 19 Mar 2026 08:12:00 +0000",
      "Subject: Your March electricity bill is ready",
      "Message-ID: <bill-2026-03@example>",
      "",
      "Please review the invoice for your latest electricity usage.",
      "",
      "From sender@example.com Thu Mar 19 09:25:00 2026",
      "From: noreply@bank.example",
      "Date: Thu, 19 Mar 2026 09:25:00 +0000",
      "Subject: Monthly statement available",
      "Message-ID: <statement-2026-03@example>",
      "",
      "Your account statement for February can now be viewed online.",
    ].join("\n"),
    "/tmp/export.mbox",
  );

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.subject, "Your March electricity bill is ready");
  assert.equal(messages[1]?.subject, "Monthly statement available");
});

test("loads a tracked mbox sample file", async () => {
  const filePath = path.resolve(process.cwd(), "data/sample-export.mbox");
  const messages = await loadMessages(filePath);

  assert.equal(messages.length, 2);
  assert.match(messages.map((message) => message.subject).join(" "), /subscription|statement/i);
});

test("prefers the text/plain part from a multipart message", () => {
  const parsed = parseEml(
    [
      "From: Shop <offers@shop.example>",
      "Date: Thu, 19 Mar 2026 12:03:00 +0000",
      "Subject: Weekend sale: 30% off selected items",
      "Message-ID: <multipart-marketing@example>",
      "Content-Type: multipart/alternative; boundary=\"mix-123\"",
      "",
      "--mix-123",
      "Content-Type: text/plain; charset=\"utf-8\"",
      "",
      "Weekend sale with unsubscribe link at the bottom.",
      "--mix-123",
      "Content-Type: text/html; charset=\"utf-8\"",
      "",
      "<html><body><p><strong>Weekend sale</strong></p></body></html>",
      "--mix-123--",
    ].join("\n"),
    "/tmp/multipart.eml",
  );

  assert.match(parsed.snippet ?? "", /unsubscribe/i);
  assert.doesNotMatch(parsed.snippet ?? "", /<strong>/i);
});
