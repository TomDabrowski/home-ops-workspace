import test from "node:test";
import assert from "node:assert/strict";

import { classifyMessage, classifyMessages } from "../src/classifier.ts";
import type { MailMessage } from "../src/types.ts";

test("classifies finance bills for manual review", () => {
  const message: MailMessage = {
    id: "bill-1",
    receivedAt: "2026-03-18T08:12:00Z",
    from: "billing@utility.example",
    subject: "Your electricity bill is ready",
    snippet: "The invoice is now available in the customer portal.",
  };

  const suggestion = classifyMessage(message);

  assert.equal(suggestion.category, "finance_bill");
  assert.equal(suggestion.action.type, "review_finance");
  assert.equal(suggestion.action.folder, "Finance/To Review");
  assert.ok(suggestion.confidence >= 0.6);
});

test("classifies marketing mail as automation-friendly", () => {
  const message: MailMessage = {
    id: "sale-1",
    receivedAt: "2026-03-18T12:03:00Z",
    from: "offers@shop.example",
    subject: "Weekend sale: 30% off selected items",
    snippet: "Unsubscribe any time to stop receiving these offers.",
  };

  const suggestion = classifyMessage(message);

  assert.equal(suggestion.category, "marketing");
  assert.equal(suggestion.action.type, "unsubscribe_or_archive");
  assert.equal(suggestion.action.automationReady, true);
});

test("keeps personal-looking messages in the inbox", () => {
  const message: MailMessage = {
    id: "personal-1",
    receivedAt: "2026-03-18T18:30:00Z",
    from: "alex@example.org",
    subject: "Dinner next week?",
    snippet: "Want to catch up and plan something quiet?",
  };

  const suggestion = classifyMessage(message);

  assert.equal(suggestion.category, "personal");
  assert.equal(suggestion.action.type, "keep_in_inbox");
  assert.equal(suggestion.action.automationReady, false);
});

test("falls back to unknown when no strong signal exists", () => {
  const message: MailMessage = {
    id: "unknown-1",
    receivedAt: "2026-03-20T06:00:00Z",
    from: "updates@example.net",
    subject: "Here is your update",
    snippet: "This message does not say much.",
  };

  const suggestion = classifyMessage(message);

  assert.equal(suggestion.category, "unknown");
  assert.equal(suggestion.action.type, "keep_in_inbox");
});

test("classifies a batch without dropping messages", () => {
  const suggestions = classifyMessages([
    {
      id: "statement-1",
      receivedAt: "2026-03-18T09:25:00Z",
      from: "noreply@bank.example",
      subject: "Monthly statement available",
      snippet: "Your account statement for February can now be viewed online.",
    },
    {
      id: "shipping-1",
      receivedAt: "2026-03-18T10:41:00Z",
      from: "updates@parcel.example",
      subject: "Your package is out for delivery",
      snippet: "Track the shipment and expected delivery window.",
    },
  ]);

  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0]?.category, "finance_statement");
  assert.equal(suggestions[1]?.category, "shipping_update");
});
