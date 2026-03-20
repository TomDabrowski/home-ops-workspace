import path from "node:path";

import { classifyMessages, selectAction } from "./classifier.ts";
import { loadMessages } from "./mail-loader.ts";
import { renderSuggestionReport, renderSuggestionReportAsJson } from "./report.ts";
import { buildLearnedRules, createReviewDecision, loadReviewState, saveReviewState, upsertReviewDecision } from "./review-state.ts";
import type {
  MailCategory,
  MailSuggestionReport,
  MailboxConfig,
  SuggestedActionType,
} from "./types.ts";
import { readFile } from "node:fs/promises";

async function loadMailboxConfig(filePath: string): Promise<MailboxConfig> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as MailboxConfig;
}

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function buildCategoryCounts(report: MailSuggestionReport["suggestions"]): MailSuggestionReport["countsByCategory"] {
  return report.reduce<MailSuggestionReport["countsByCategory"]>((counts, suggestion) => {
    counts[suggestion.category] = (counts[suggestion.category] ?? 0) + 1;
    return counts;
  }, {});
}

async function runSuggest(args: string[]): Promise<void> {
  const formatFlagIndex = args.findIndex((arg) => arg === "--format");
  const format = formatFlagIndex >= 0 ? args[formatFlagIndex + 1] ?? "text" : "text";
  const inputArg = args.find((arg, index) => index === 0 || (formatFlagIndex >= 0 && index !== formatFlagIndex + 1 && index !== formatFlagIndex));
  const inputPath = inputArg
    ? path.resolve(process.cwd(), inputArg)
    : resolveProjectPath("data/sample-mails.json");
  const configPath = resolveProjectPath("data/mailbox-config.json");
  const reviewStatePath = resolveProjectPath("data/review-state.json");
  const messages = await loadMessages(inputPath);
  const config = await loadMailboxConfig(configPath);
  const reviewState = await loadReviewState(reviewStatePath);
  const learnedRules = buildLearnedRules(reviewState);
  const suggestions = classifyMessages(messages, { config, learnedRules });
  const report: MailSuggestionReport = {
    generatedAt: new Date().toISOString(),
    sourcePath: inputPath,
    totalMessages: messages.length,
    countsByCategory: buildCategoryCounts(suggestions),
    suggestions,
  };

  if (format === "json") {
    process.stdout.write(`${renderSuggestionReportAsJson(report)}\n`);
    return;
  }

  process.stdout.write(`${renderSuggestionReport(report)}\n`);
}

async function runReview(args: string[]): Promise<void> {
  const [messageId, categoryArg, actionTypeArg, folderArg, inputArg] = args;

  if (!messageId || !categoryArg || !actionTypeArg) {
    throw new Error("Usage: review <message-id> <category> <action-type> [folder] [input-path]");
  }

  const inputPath = inputArg
    ? path.resolve(process.cwd(), inputArg)
    : resolveProjectPath("data/sample-mails.json");
  const configPath = resolveProjectPath("data/mailbox-config.json");
  const reviewStatePath = resolveProjectPath("data/review-state.json");
  const messages = await loadMessages(inputPath);
  const message = messages.find((entry) => entry.id === messageId);

  if (!message) {
    throw new Error(`Message "${messageId}" was not found in ${inputPath}.`);
  }

  const category = categoryArg as MailCategory;
  const config = await loadMailboxConfig(configPath);
  const baseAction = selectAction(category, config);
  const action = {
    ...baseAction,
    type: actionTypeArg as SuggestedActionType,
    folder: folderArg || baseAction.folder,
  };
  const reviewState = await loadReviewState(reviewStatePath);
  const decision = createReviewDecision({
    message,
    sourcePath: inputPath,
    category,
    action,
  });
  const nextState = upsertReviewDecision(reviewState, decision);

  await saveReviewState(reviewStatePath, nextState);
  process.stdout.write(`Saved review decision for ${message.id} -> ${category} (${action.type})\n`);
}

async function main(): Promise<void> {
  const [command = "suggest", ...args] = process.argv.slice(2);

  if (command === "suggest") {
    await runSuggest(args);
    return;
  }

  if (command === "review") {
    await runReview(args);
    return;
  }

  throw new Error(`Unknown command "${command}". Use "suggest" or "review".`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mail-sorter failed: ${message}\n`);
  process.exitCode = 1;
});
