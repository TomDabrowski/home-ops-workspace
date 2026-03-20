import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { runAccountSuggestions, validateAccountsConfig } from "./account-runner.ts";
import { classifyMessages } from "./classifier.ts";
import { loadMessages } from "./mail-loader.ts";
import { runScheduledAccountCycle } from "./ops-runner.ts";
import { renderSuggestionReport, renderSuggestionReportAsJson } from "./report.ts";
import type {
  MailCategory,
  MailSuggestionReport,
  MailboxConfig,
} from "./types.ts";

async function loadMailboxConfig(filePath: string): Promise<MailboxConfig> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as MailboxConfig;
}

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readFlagValue(args: string[], flagName: string): string | undefined {
  const index = args.findIndex((arg) => arg === flagName);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], flagName: string): boolean {
  return args.includes(flagName);
}

function readInputArg(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--format" || arg === "--category") {
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      continue;
    }

    return arg;
  }

  return undefined;
}

function buildCategoryCounts(report: MailSuggestionReport["suggestions"]): MailSuggestionReport["countsByCategory"] {
  return report.reduce<MailSuggestionReport["countsByCategory"]>((counts, suggestion) => {
    counts[suggestion.category] = (counts[suggestion.category] ?? 0) + 1;
    return counts;
  }, {});
}

async function runSuggest(args: string[]): Promise<void> {
  const format = readFlagValue(args, "--format") ?? "text";
  const categoryFilter = readFlagValue(args, "--category") as MailCategory | undefined;
  const outputArg = readFlagValue(args, "--output");
  const onlyReady = hasFlag(args, "--only-ready");
  const inputArg = readInputArg(args);
  const inputPath = inputArg
    ? path.resolve(process.cwd(), inputArg)
    : resolveProjectPath("data/sample-mails.json");
  const configPath = resolveProjectPath("data/mailbox-config.json");
  const messages = await loadMessages(inputPath);
  const config = await loadMailboxConfig(configPath);
  const suggestions = classifyMessages(messages, { config })
    .map((suggestion) => ({
      ...suggestion,
      safeToAutomate: suggestion.action.automationReady && suggestion.confidence >= config.autoArchiveThreshold,
    }))
    .filter((suggestion) => !categoryFilter || suggestion.category === categoryFilter)
    .filter((suggestion) => !onlyReady || suggestion.safeToAutomate);
  const report: MailSuggestionReport = {
    generatedAt: new Date().toISOString(),
    sourcePath: inputPath,
    totalMessages: suggestions.length,
    countsByCategory: buildCategoryCounts(suggestions),
    suggestions,
  };
  const output = format === "json"
    ? `${renderSuggestionReportAsJson(report)}\n`
    : `${renderSuggestionReport(report)}\n`;

  if (outputArg) {
    const outputPath = path.resolve(process.cwd(), outputArg);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
  }

  if (format === "json") {
    process.stdout.write(output);
    return;
  }

  process.stdout.write(output);
}

async function main(): Promise<void> {
  const [command = "suggest", ...args] = process.argv.slice(2);

  if (command === "suggest") {
    await runSuggest(args);
    return;
  }

  if (command === "accounts") {
    const configArg = readInputArg(args);
    const configPath = configArg
      ? path.resolve(process.cwd(), configArg)
      : resolveProjectPath("data/accounts.json");
    await runAccountSuggestions(configPath);
    return;
  }

  if (command === "validate-accounts") {
    const configArg = readInputArg(args);
    const configPath = configArg
      ? path.resolve(process.cwd(), configArg)
      : resolveProjectPath("data/accounts.json");
    await validateAccountsConfig(configPath);
    return;
  }

  if (command === "run-scheduled") {
    const configArg = readInputArg(args);
    const configPath = configArg
      ? path.resolve(process.cwd(), configArg)
      : resolveProjectPath("data/accounts.json");
    await runScheduledAccountCycle(configPath);
    return;
  }

  throw new Error(`Unknown command "${command}". Use "suggest", "accounts", "validate-accounts", or "run-scheduled".`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mail-sorter failed: ${message}\n`);
  process.exitCode = 1;
});
