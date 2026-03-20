import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MailMessage, ProcessedAccountState, ProcessedState } from "./types.ts";

const MAX_STORED_MESSAGES_PER_ACCOUNT = 2000;

export function getMessageFingerprint(message: MailMessage): string {
  return message.sourcePath || `${message.id}:${message.receivedAt}`;
}

export async function loadProcessedState(filePath: string): Promise<ProcessedState> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ProcessedState;

    if (!parsed || !Array.isArray(parsed.accounts)) {
      throw new Error("Expected processed-state JSON with an accounts array.");
    }

    return parsed;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { accounts: [] };
    }

    throw error;
  }
}

export async function saveProcessedState(filePath: string, state: ProcessedState): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function getAccountState(state: ProcessedState, accountId: string): ProcessedAccountState {
  return state.accounts.find((account) => account.accountId === accountId) ?? { accountId, messages: [] };
}

export function filterUnseenMessages(state: ProcessedState, accountId: string, messages: MailMessage[]): MailMessage[] {
  const fingerprints = new Set(getAccountState(state, accountId).messages.map((message) => message.fingerprint));
  return messages.filter((message) => !fingerprints.has(getMessageFingerprint(message)));
}

export function markMessagesProcessed(state: ProcessedState, accountId: string, messages: MailMessage[]): ProcessedState {
  const accountState = getAccountState(state, accountId);
  const known = new Map(accountState.messages.map((message) => [message.fingerprint, message]));

  for (const message of messages) {
    const fingerprint = getMessageFingerprint(message);
    known.set(fingerprint, { fingerprint, seenAt: new Date().toISOString() });
  }

  const nextAccountState: ProcessedAccountState = {
    accountId,
    messages: [...known.values()]
      .sort((left, right) => right.seenAt.localeCompare(left.seenAt))
      .slice(0, MAX_STORED_MESSAGES_PER_ACCOUNT),
  };

  return {
    accounts: [
      ...state.accounts.filter((account) => account.accountId !== accountId),
      nextAccountState,
    ].sort((left, right) => left.accountId.localeCompare(right.accountId)),
  };
}
