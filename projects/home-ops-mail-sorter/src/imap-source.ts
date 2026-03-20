import { ImapFlow } from "imapflow";

import { parseEml } from "./mail-loader.ts";
import type { ImapAccountSourceConfig, MailAccountConfig, MailMessage } from "./types.ts";

function buildSearchQuery(config: ImapAccountSourceConfig): {
  all: boolean;
  seen?: boolean;
  since?: Date;
} {
  const query: { all: boolean; seen?: boolean; since?: Date } = { all: true };

  if (config.unseenOnly) {
    query.seen = false;
  }

  if (typeof config.sinceDays === "number" && config.sinceDays > 0) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - config.sinceDays);
    query.since = since;
  }

  return query;
}

export function selectUids(uids: number[], maxMessages = 50): number[] {
  return [...uids]
    .sort((left, right) => right - left)
    .slice(0, maxMessages)
    .sort((left, right) => left - right);
}

export async function loadMessagesFromImap(account: MailAccountConfig): Promise<MailMessage[]> {
  const { source } = account;
  const password = process.env[source.passwordEnv];

  if (!password) {
    throw new Error(`Missing IMAP password in env var ${source.passwordEnv} for account ${account.id}.`);
  }

  const client = new ImapFlow({
    host: source.host,
    port: source.port,
    secure: source.secure ?? true,
    auth: {
      user: source.username,
      pass: password,
    },
    tls: {
      rejectUnauthorized: source.tlsRejectUnauthorized ?? true,
    },
    logger: false,
    disableAutoIdle: true,
  });

  try {
    await client.connect();
    await client.mailboxOpen(source.mailbox, { readOnly: true });
    const found = await client.search(buildSearchQuery(source), { uid: true });
    const selected = selectUids(found || [], source.maxMessages ?? 50);
    const messages: MailMessage[] = [];

    if (selected.length === 0) {
      return messages;
    }

    for await (const fetched of client.fetch(selected, { uid: true, source: true, envelope: true, internalDate: true }, { uid: true })) {
      if (!fetched.source) {
        continue;
      }

      const sourcePath = `imap://${account.id}/${encodeURIComponent(source.mailbox)}#uid=${fetched.uid}`;
      const parsed = parseEml(fetched.source.toString("utf8"), sourcePath);

      messages.push({
        ...parsed,
        id: parsed.id || `${account.id}-${fetched.uid}`,
        receivedAt: fetched.internalDate ? new Date(fetched.internalDate).toISOString() : parsed.receivedAt,
        sourceType: "imap",
        sourcePath,
      });
    }

    return messages;
  } finally {
    await client.logout().catch(() => undefined);
  }
}
