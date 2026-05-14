import type { BackupRunStatus } from "./types.ts";
import { validateBackupRunInput } from "./validation.ts";

export interface RecordRunCommand {
  command: "record";
  input: {
    jobId: string;
    completedAt: string;
    status: BackupRunStatus;
    note?: string;
  };
}

export interface StatusCommand {
  command: "status";
}

export interface RunsCommand {
  command: "runs";
}

export interface HelpCommand {
  command: "help";
}

export type BackupCliCommand = RecordRunCommand | StatusCommand | RunsCommand | HelpCommand;

function readFlag(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 16);
}

export function parseBackupCliCommand(args: string[], now = new Date()): BackupCliCommand {
  const [command = "status", ...rest] = args;

  if (command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }

  if (command === "status") {
    return { command: "status" };
  }

  if (command === "runs") {
    return { command: "runs" };
  }

  if (command === "record") {
    return {
      command: "record",
      input: validateBackupRunInput({
        jobId: readFlag(rest, "--job") ?? readFlag(rest, "--job-id"),
        completedAt: readFlag(rest, "--completed-at") ?? toDateInput(now),
        status: readFlag(rest, "--status") ?? "success",
        note: readFlag(rest, "--note"),
      }),
    };
  }

  throw new Error(`Unknown command: ${command}`);
}
