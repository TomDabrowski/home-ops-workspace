import { readFile, writeFile } from "node:fs/promises";

import { extractEmailAddress } from "./mail-loader.ts";
import type {
  LearnedRule,
  MailCategory,
  MailMessage,
  ReviewDecision,
  ReviewState,
  SuggestedAction,
} from "./types.ts";

function normalize(value: string): string {
  return (extractEmailAddress(value) ?? value).trim().toLowerCase();
}

function extractDomain(sender: string): string | null {
  const [, domain] = normalize(sender).split("@");
  return domain || null;
}

export async function loadReviewState(filePath: string): Promise<ReviewState> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ReviewState;

    if (!parsed || !Array.isArray(parsed.decisions)) {
      throw new Error("Expected review-state JSON with a decisions array.");
    }

    return parsed;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { decisions: [] };
    }

    throw error;
  }
}

export async function saveReviewState(filePath: string, reviewState: ReviewState): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(reviewState, null, 2)}\n`, "utf8");
}

export function buildLearnedRules(reviewState: ReviewState): LearnedRule[] {
  const decisionsBySender = new Map<string, ReviewDecision[]>();
  const decisionsByDomain = new Map<string, ReviewDecision[]>();

  for (const decision of reviewState.decisions) {
    const sender = normalize(decision.sender);
    const decisions = decisionsBySender.get(sender) ?? [];
    decisions.push(decision);
    decisionsBySender.set(sender, decisions);

    const domain = extractDomain(decision.sender);
    if (domain) {
      const domainDecisions = decisionsByDomain.get(domain) ?? [];
      domainDecisions.push(decision);
      decisionsByDomain.set(domain, domainDecisions);
    }
  }

  const senderRules = [...decisionsBySender.entries()].map(([sender, decisions]) => {
    const sorted = [...decisions].sort((left, right) => right.decidedAt.localeCompare(left.decidedAt));
    const latest = sorted[0] as ReviewDecision;

    return {
      sender,
      matchType: "sender" as const,
      category: latest.category,
      action: latest.action,
      decisionCount: decisions.length,
      lastDecidedAt: latest.decidedAt,
    };
  });

  const domainRules = [...decisionsByDomain.entries()]
    .map(([domain, decisions]) => {
      const sorted = [...decisions].sort((left, right) => right.decidedAt.localeCompare(left.decidedAt));
      const latest = sorted[0] as ReviewDecision;
      const sameCategoryCount = decisions.filter((decision) => decision.category === latest.category).length;
      const sameActionCount = decisions.filter(
        (decision) =>
          decision.action.type === latest.action.type &&
          decision.action.folder === latest.action.folder,
      ).length;

      if (decisions.length < 2 || sameCategoryCount !== decisions.length || sameActionCount !== decisions.length) {
        return null;
      }

      const rule: LearnedRule = {
        sender: domain,
        matchType: "domain",
        category: latest.category,
        action: latest.action,
        decisionCount: decisions.length,
        lastDecidedAt: latest.decidedAt,
      };

      return rule;
    })
    .filter((rule) => rule !== null);

  return [...senderRules, ...domainRules];
}

export function createReviewDecision(input: {
  message: MailMessage;
  sourcePath: string;
  category: MailCategory;
  action: SuggestedAction;
  decidedAt?: string;
}): ReviewDecision {
  return {
    messageId: input.message.id,
    sender: input.message.from,
    subject: input.message.subject,
    sourcePath: input.sourcePath,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
    category: input.category,
    action: input.action,
  };
}

export function upsertReviewDecision(reviewState: ReviewState, decision: ReviewDecision): ReviewState {
  const remaining = reviewState.decisions.filter((entry) => entry.messageId !== decision.messageId);
  return {
    decisions: [...remaining, decision].sort((left, right) => left.decidedAt.localeCompare(right.decidedAt)),
  };
}
