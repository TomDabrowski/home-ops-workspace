import type {
  CategoryScore,
  LearnedRule,
  MailCategory,
  MailboxConfig,
  MailMessage,
  MailSuggestion,
  SuggestedAction,
} from "./types.ts";
import { extractEmailAddress } from "./mail-loader.ts";

interface CategoryDefinition {
  category: MailCategory;
  senderTerms: string[];
  subjectTerms: string[];
  snippetTerms: string[];
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    category: "finance_bill",
    senderTerms: ["billing", "invoice", "utility", "insurance"],
    subjectTerms: ["bill", "invoice", "payment due", "amount due"],
    snippetTerms: ["invoice", "usage", "due date", "amount due"],
  },
  {
    category: "finance_statement",
    senderTerms: ["bank", "broker", "statement", "noreply@"],
    subjectTerms: ["statement", "account summary", "monthly summary"],
    snippetTerms: ["statement", "transactions", "balance", "available online"],
  },
  {
    category: "subscription",
    senderTerms: ["stream", "music", "video", "membership", "subscription"],
    subjectTerms: ["subscription", "renews", "membership", "trial ends"],
    snippetTerms: ["charge", "cancel", "renew", "payment method"],
  },
  {
    category: "shipping_update",
    senderTerms: ["parcel", "delivery", "shipping", "logistics"],
    subjectTerms: ["out for delivery", "shipped", "delivery update", "track your package"],
    snippetTerms: ["track", "shipment", "delivery window", "courier"],
  },
  {
    category: "marketing",
    senderTerms: ["offers", "news", "promo", "deals"],
    subjectTerms: ["sale", "off", "discount", "deal", "special offer"],
    snippetTerms: ["unsubscribe", "offer", "selected items", "limited time"],
  },
  {
    category: "personal",
    senderTerms: [],
    subjectTerms: ["dinner", "coffee", "weekend", "birthday"],
    snippetTerms: ["catch up", "see you", "next week", "want to plan"],
  },
];

const CATEGORY_PRIORITY: MailCategory[] = [
  "finance_bill",
  "finance_statement",
  "subscription",
  "shipping_update",
  "marketing",
  "personal",
  "unknown",
];

function normalize(value: string): string {
  return (extractEmailAddress(value) ?? value).trim().toLowerCase();
}

function looksLikeHumanSender(from: string): boolean {
  const localPart = from.split("@")[0] ?? "";
  const blockedTokens = ["hello", "info", "mail", "news", "notify", "noreply", "support", "team", "update", "updates"];

  if (!localPart || blockedTokens.some((token) => localPart.includes(token))) {
    return false;
  }

  return /^[a-z]+([._-][a-z]+)*$/.test(localPart);
}

function scoreTerms(text: string, terms: string[], weight: number, label: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  for (const term of terms) {
    if (!text.includes(term)) {
      continue;
    }

    score += weight;
    reasons.push(`${label} matched "${term}"`);
  }

  return { score, reasons };
}

export function scoreMessage(message: MailMessage): CategoryScore[] {
  const from = normalize(message.from);
  const subject = normalize(message.subject);
  const snippet = normalize(message.snippet ?? "");

  const scores = CATEGORY_DEFINITIONS.map((definition) => {
    const senderScore = scoreTerms(from, definition.senderTerms, 3, "sender");
    const subjectScore = scoreTerms(subject, definition.subjectTerms, 4, "subject");
    const snippetScore = scoreTerms(snippet, definition.snippetTerms, 2, "snippet");

    return {
      category: definition.category,
      score: senderScore.score + subjectScore.score + snippetScore.score,
      reasons: [...senderScore.reasons, ...subjectScore.reasons, ...snippetScore.reasons],
    };
  });

  const personalFallback = from.includes("@") && looksLikeHumanSender(from) && scores.every((score) => score.score === 0);
  if (personalFallback) {
    scores.push({
      category: "personal",
      score: 2,
      reasons: ["fallback for direct sender without automated markers"],
    });
  }

  scores.push({
    category: "unknown",
    score: 1,
    reasons: ["fallback category"],
  });

  return scores.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return CATEGORY_PRIORITY.indexOf(left.category) - CATEGORY_PRIORITY.indexOf(right.category);
  });
}

const DEFAULT_ACTIONS: Record<MailCategory, SuggestedAction> = {
  finance_bill: {
    type: "review_finance",
    folder: "Finance/To Review",
    automationReady: false,
    summary: "Flag for review before filing because it may require payment.",
  },
  finance_statement: {
    type: "archive_after_review",
    folder: "Finance/Statements",
    automationReady: false,
    summary: "Review briefly, then archive into statements.",
  },
  subscription: {
    type: "file_to_folder",
    folder: "Finance/Subscriptions",
    automationReady: false,
    summary: "File with subscription notices and check whether the renewal is still wanted.",
  },
  shipping_update: {
    type: "archive_after_review",
    folder: "Operations/Deliveries",
    automationReady: true,
    summary: "Useful short-term, then archive once the delivery is complete.",
  },
  marketing: {
    type: "unsubscribe_or_archive",
    folder: "Archive/Marketing",
    automationReady: true,
    summary: "Low-value marketing mail, likely safe to archive or unsubscribe from.",
  },
  personal: {
    type: "keep_in_inbox",
    automationReady: false,
    summary: "Keep visible because it looks like a personal conversation.",
  },
  unknown: {
    type: "keep_in_inbox",
    automationReady: false,
    summary: "Confidence is too low for automation, keep it in the inbox.",
  },
};

export function selectAction(category: MailCategory, config?: MailboxConfig): SuggestedAction {
  return config?.actions[category] ?? DEFAULT_ACTIONS[category];
}

function findLearnedRule(message: MailMessage, learnedRules: LearnedRule[]): LearnedRule | undefined {
  const sender = normalize(message.from);
  const [, domain = ""] = sender.split("@");

  return learnedRules.find((rule) => {
    if (rule.matchType === "sender") {
      return normalize(rule.sender) === sender;
    }

    return normalize(rule.sender) === domain;
  });
}

export function classifyMessage(
  message: MailMessage,
  options?: { config?: MailboxConfig; learnedRules?: LearnedRule[] },
): MailSuggestion {
  const learnedRule = findLearnedRule(message, options?.learnedRules ?? []);

  if (learnedRule) {
    const reasonSubject = learnedRule.matchType === "sender" ? "this sender" : `domain ${learnedRule.sender}`;
    return {
      message,
      category: learnedRule.category,
      confidence: learnedRule.matchType === "sender" ? 0.99 : 0.93,
      reasons: [`Learned from ${learnedRule.decisionCount} saved review decision(s) for ${reasonSubject}.`],
      action: learnedRule.action,
      alternatives: [{
        category: learnedRule.category,
        score: learnedRule.matchType === "sender" ? 99 : 93,
        reasons: [`${learnedRule.matchType} matched stored review rule`],
      }],
      learnedRule,
    };
  }

  const alternatives = scoreMessage(message);
  const [best, second] = alternatives;
  const bestScore = best?.score ?? 0;
  const secondScore = second?.score ?? 0;
  const confidenceBase = bestScore <= 1 ? 0.25 : Math.min(0.98, 0.45 + (bestScore - secondScore) * 0.08 + bestScore * 0.03);
  const confidence = Number(confidenceBase.toFixed(2));
  const category = confidence < 0.45 ? "unknown" : best.category;
  const reasons = category === "unknown"
    ? ["No category scored strongly enough for a safe suggestion."]
    : best.reasons;

  return {
    message,
    category,
    confidence,
    reasons,
    action: selectAction(category, options?.config),
    alternatives: alternatives.slice(0, 3),
  };
}

export function classifyMessages(
  messages: MailMessage[],
  options?: { config?: MailboxConfig; learnedRules?: LearnedRule[] },
): MailSuggestion[] {
  return messages.map((message) => classifyMessage(message, options));
}
