import process from "node:process";

import { configuredJobs } from "./config.ts";
import { buildBackupReport } from "./report.ts";
import { appendBackupRun, backupRunStore } from "./state.ts";
import { parseBackupCliCommand } from "./cli-options.ts";

function printHelp() {
  console.log(`Home Ops Backup Control

Commands:
  status
    Print the current backup health report as JSON.

  runs
    Print stored backup run records as JSON.

  record --job <id> [--status success|failed|unknown] [--completed-at <date>] [--note <text>]
    Record one backup run for a configured job.

Examples:
  npm run backup -- status
  npm run record -- --job documents-backup --status success --note "Manual check"
`);
}

function assertConfiguredJob(jobId: string) {
  if (!configuredJobs().some((job) => job.id === jobId)) {
    throw new Error(`Unknown backup job: ${jobId}`);
  }
}

try {
  const command = parseBackupCliCommand(process.argv.slice(2));

  if (command.command === "help") {
    printHelp();
  }

  if (command.command === "status") {
    console.log(JSON.stringify(buildBackupReport(configuredJobs(), backupRunStore.read()), null, 2));
  }

  if (command.command === "runs") {
    console.log(JSON.stringify(backupRunStore.read(), null, 2));
  }

  if (command.command === "record") {
    assertConfiguredJob(command.input.jobId);
    appendBackupRun(command.input);
    console.log(JSON.stringify(buildBackupReport(configuredJobs(), backupRunStore.read()), null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
