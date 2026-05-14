import { createLocalConfigResolver } from "@home-ops/framework";

import type { WatchTarget } from "./types.ts";
import { validateWatchTargets } from "./validation.ts";

export interface WatcherConfig extends Record<string, unknown> {
  dataDir?: string;
  targets?: WatchTarget[];
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
    };
  },
});

export function configuredTargets(): WatchTarget[] {
  return watcherConfig.readConfig().targets ?? [];
}
