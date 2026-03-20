import type { MailSuggestionReport } from "./types.ts";

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function renderSuggestionReport(report: MailSuggestionReport): string {
  const categorySummary = Object.entries(report.countsByCategory)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category, count]) => `${category}: ${count}`)
    .join(", ");
  const lines: string[] = [
    "Home Ops Mail Sorter",
    `Generated: ${report.generatedAt}`,
    `Source: ${report.sourcePath}`,
    `Messages: ${report.totalMessages}`,
    `Summary: ${categorySummary || "no suggestions"}`,
    "",
  ];

  for (const suggestion of report.suggestions) {
    lines.push(`- ${suggestion.message.subject}`);
    lines.push(`  From: ${suggestion.message.from}`);
    lines.push(`  Category: ${suggestion.category} (${formatConfidence(suggestion.confidence)})`);
    lines.push(`  Action: ${suggestion.action.type}${suggestion.action.folder ? ` -> ${suggestion.action.folder}` : ""}`);
    lines.push(`  Automation: ${suggestion.safeToAutomate ? "ready" : "review-first"}`);
    lines.push(`  Why: ${suggestion.reasons.join("; ")}`);
    lines.push(`  Note: ${suggestion.action.summary}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderSuggestionReportAsJson(report: MailSuggestionReport): string {
  return JSON.stringify(report, null, 2);
}
