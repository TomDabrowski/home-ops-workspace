import test from "node:test";
import assert from "node:assert/strict";

import { classifyMessage } from "../src/classifier.ts";
import { buildLearnedRules, createReviewDecision, upsertReviewDecision } from "../src/review-state.ts";
import type { MailMessage, ReviewState } from "../src/types.ts";

test("reuses a stored sender decision as a learned rule", () => {
  const message: MailMessage = {
    id: "stream-1",
    receivedAt: "2026-03-19T07:55:00Z",
    from: "hello@streaming.example",
    subject: "Your subscription renews tomorrow",
    snippet: "We will charge your saved payment method unless you cancel.",
  };

  const initialState: ReviewState = { decisions: [] };
  const updatedState = upsertReviewDecision(
    initialState,
    createReviewDecision({
      message,
      sourcePath: "/tmp/sample-mails.json",
      category: "subscription",
      action: {
        type: "file_to_folder",
        folder: "Finance/Streaming",
        automationReady: false,
        summary: "Manual decision for streaming renewals.",
      },
      decidedAt: "2026-03-20T12:30:00Z",
    }),
  );

  const learnedRules = buildLearnedRules(updatedState);
  const suggestion = classifyMessage(message, { learnedRules });

  assert.equal(suggestion.category, "subscription");
  assert.equal(suggestion.action.folder, "Finance/Streaming");
  assert.equal(suggestion.learnedRule?.matchType, "sender");
  assert.equal(suggestion.learnedRule?.decisionCount, 1);
  assert.equal(suggestion.confidence, 0.99);
});

test("builds a domain rule after repeated consistent decisions", () => {
  const firstMessage: MailMessage = {
    id: "stream-2",
    receivedAt: "2026-03-20T07:55:00Z",
    from: "billing@streaming.example",
    subject: "Your subscription renews tomorrow",
    snippet: "We will charge your saved payment method unless you cancel.",
  };
  const secondMessage: MailMessage = {
    id: "stream-3",
    receivedAt: "2026-03-21T07:55:00Z",
    from: "support@streaming.example",
    subject: "Your subscription renews tomorrow",
    snippet: "We will charge your saved payment method unless you cancel.",
  };
  let reviewState: ReviewState = { decisions: [] };

  for (const [index, message] of [firstMessage, secondMessage].entries()) {
    reviewState = upsertReviewDecision(
      reviewState,
      createReviewDecision({
        message,
        sourcePath: "/tmp/sample-mails.json",
        category: "subscription",
        action: {
          type: "file_to_folder",
          folder: "Finance/Streaming",
          automationReady: false,
          summary: "Manual decision for streaming renewals.",
        },
        decidedAt: `2026-03-2${index}T12:30:00Z`,
      }),
    );
  }

  const learnedRules = buildLearnedRules(reviewState);
  const suggestion = classifyMessage(
    {
      id: "stream-4",
      receivedAt: "2026-03-22T07:55:00Z",
      from: "news@streaming.example",
      subject: "Your subscription renews tomorrow",
      snippet: "We will charge your saved payment method unless you cancel.",
    },
    { learnedRules },
  );

  assert.equal(suggestion.category, "subscription");
  assert.equal(suggestion.action.folder, "Finance/Streaming");
  assert.equal(suggestion.learnedRule?.matchType, "domain");
  assert.equal(suggestion.learnedRule?.sender, "streaming.example");
  assert.equal(suggestion.confidence, 0.93);
});
