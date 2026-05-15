import { createLocalConfigResolver } from "@home-ops/framework";

import type { WatchStatus, WatchTarget } from "./types.ts";
import { validateWatchTargets } from "./validation.ts";

export interface WatcherConfig extends Record<string, unknown> {
  dataDir?: string;
  targets?: WatchTarget[];
  notificationWebhookUrl?: string;
  notificationMinimumStatus?: WatchStatus;
}

function parseNotificationMinimumStatus(value: unknown): WatchStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "warn" || value === "down") {
    return value;
  }
  throw new Error("notificationMinimumStatus must be warn or down");
}

export const watcherConfig = createLocalConfigResolver<WatcherConfig>({
  envPrefix: "HOME_OPS_WATCHER",
  defaultDataDir: "data",
  parseConfig(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    return {
      dataDir: typeof raw.dataDir === "string" ? raw.dataDir : undefined,
      targets: raw.targets === undefined ? undefined : validateWatchTargets(raw.targets),
      notificationWebhookUrl: typeof raw.notificationWebhookUrl === "string" ? raw.notificationWebhookUrl : undefined,
      notificationMinimumStatus: parseNotificationMinimumStatus(raw.notificationMinimumStatus),
    };
  },
});

export function configuredTargets(): WatchTarget[] {
  return watcherConfig.readConfig().targets ?? [];
}

export function notificationConfig() {
  const config = watcherConfig.readConfig();
  return {
    webhookUrl: process.env.HOME_OPS_WATCHER_NOTIFICATION_WEBHOOK_URL ?? config.notificationWebhookUrl,
    minimumStatus: config.notificationMinimumStatus ?? "down" as WatchStatus,
  };
}
