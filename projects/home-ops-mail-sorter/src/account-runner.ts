import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { filterUnseenMessages, loadProcessedState, markMessagesProcessed, saveProcessedState } from "./account-state.ts";
import { classifyMessages } from "./classifier.ts";
import { loadMessagesFromImap } from "./imap-source.ts";
import { renderSuggestionReport, renderSuggestionReportAsJson } from "./report.ts";
import type {
  MailAccountConfig,
  MailAccountsConfig,
  MailSuggestionReport,
  MailboxConfig,
} from "./types.ts";

export async function loadMailboxConfig(filePath: string): Promise<MailboxConfig> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as MailboxConfig;
}

export async function loadAccountsConfig(filePath: string): Promise<MailAccountsConfig> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as MailAccountsConfig;

  if (!parsed || !Array.isArray(parsed.accounts)) {
    throw new Error("Expected accounts config JSON with an accounts array.");
  }

  return parsed;
}

export function sanitizeAccountId(accountId: string): string {
  return accountId.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function buildCategoryCounts(report: MailSuggestionReport["suggestions"]): MailSuggestionReport["countsByCategory"] {
  return report.reduce<MailSuggestionReport["countsByCategory"]>((counts, suggestion) => {
    counts[suggestion.category] = (counts[suggestion.category] ?? 0) + 1;
    return counts;
  }, {});
}

function resolveFromProject(rootDir: string, relativePath: string | undefined, fallback: string): string {
  return path.resolve(rootDir, relativePath ?? fallback);
}

async function writeAccountOutputs(outputDir: string, report: MailSuggestionReport): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "report.txt"), `${renderSuggestionReport(report)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.json"), `${renderSuggestionReportAsJson(report)}\n`, "utf8");
}

export async function buildAccountReport(
  rootDir: string,
  defaults: Pick<MailAccountsConfig, "mailboxConfigPath">,
  account: MailAccountConfig,
): Promise<MailSuggestionReport> {
  const mailboxConfigPath = resolveFromProject(rootDir, account.mailboxConfigPath ?? defaults.mailboxConfigPath, "data/mailbox-config.json");
  const config = await loadMailboxConfig(mailboxConfigPath);
  const messages = await loadMessagesFromImap(account);
  const suggestions = classifyMessages(messages, { config }).map((suggestion) => ({
    ...suggestion,
    safeToAutomate: suggestion.action.automationReady && suggestion.confidence >= config.autoArchiveThreshold,
  }));

  return {
    generatedAt: new Date().toISOString(),
    sourcePath: `imap:${account.id}`,
    totalMessages: suggestions.length,
    countsByCategory: buildCategoryCounts(suggestions),
    suggestions,
  };
}

export async function runAccountSuggestions(configPath: string): Promise<void> {
  const rootDir = process.cwd();
  const config = await loadAccountsConfig(configPath);
  const reportsDir = resolveFromProject(rootDir, config.reportsDir, "reports/accounts");
  const statePath = resolveFromProject(rootDir, config.statePath, "data/account-state.json");
  let processedState = await loadProcessedState(statePath);

  for (const account of config.accounts) {
    const report = await buildAccountReport(rootDir, config, account);
    const unseenSuggestions = filterUnseenMessages(
      processedState,
      account.id,
      report.suggestions.map((suggestion) => suggestion.message),
    );
    const unseenFingerprints = new Set(unseenSuggestions.map((message) => message.sourcePath || `${message.id}:${message.receivedAt}`));
    const filteredReport: MailSuggestionReport = {
      ...report,
      totalMessages: unseenSuggestions.length,
      suggestions: report.suggestions.filter((suggestion) =>
        unseenFingerprints.has(suggestion.message.sourcePath || `${suggestion.message.id}:${suggestion.message.receivedAt}`)),
      countsByCategory: buildCategoryCounts(
        report.suggestions.filter((suggestion) =>
          unseenFingerprints.has(suggestion.message.sourcePath || `${suggestion.message.id}:${suggestion.message.receivedAt}`)),
      ),
    };
    const outputDir = path.join(reportsDir, account.reportsSubdir ?? sanitizeAccountId(account.id));
    await writeAccountOutputs(outputDir, filteredReport);
    processedState = markMessagesProcessed(processedState, account.id, unseenSuggestions);
    process.stdout.write(`Account ${account.id}: wrote ${filteredReport.totalMessages} new suggestions to ${outputDir}\n`);
  }

  await saveProcessedState(statePath, processedState);
}

export async function validateAccountsConfig(configPath: string): Promise<void> {
  const rootDir = process.cwd();
  const config = await loadAccountsConfig(configPath);
  const missing: string[] = [];

  resolveFromProject(rootDir, config.mailboxConfigPath, "data/mailbox-config.json");
  resolveFromProject(rootDir, config.statePath, "data/account-state.json");

  for (const account of config.accounts) {
    if (!account.id.trim()) {
      missing.push("Account with empty id.");
    }

    if (!account.label.trim()) {
      missing.push(`Account ${account.id || "<unknown>"} is missing a label.`);
    }

    if (!account.source.host.trim()) {
      missing.push(`Account ${account.id} is missing source.host.`);
    }

    if (!account.source.username.trim()) {
      missing.push(`Account ${account.id} is missing source.username.`);
    }

    if (!account.source.mailbox.trim()) {
      missing.push(`Account ${account.id} is missing source.mailbox.`);
    }

    if (!account.source.passwordEnv.trim()) {
      missing.push(`Account ${account.id} is missing source.passwordEnv.`);
      continue;
    }

    if (!process.env[account.source.passwordEnv]) {
      missing.push(`Account ${account.id} is missing env var ${account.source.passwordEnv}.`);
    }
  }

  if (missing.length > 0) {
    throw new Error(missing.join(" "));
  }

  process.stdout.write(`Validated ${config.accounts.length} account configuration(s).\n`);
}
