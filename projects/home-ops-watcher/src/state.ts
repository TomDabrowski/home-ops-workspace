import { createJsonStore } from "@home-ops/framework";

import type { WatchHistoryEntry } from "./types.ts";
import { watcherConfig } from "./config.ts";
import { validateWatchHistory } from "./validation.ts";

export const watchHistoryStore = createJsonStore<WatchHistoryEntry[]>(
  watcherConfig.dataPath("watch-history.json"),
  {
    fallback: [],
    validator: validateWatchHistory,
  },
);

export function appendWatchHistory(results: Omit<WatchHistoryEntry, "id">[], limit = 500): WatchHistoryEntry[] {
  return watchHistoryStore.update((current) => {
    const next = [
      ...current,
      ...results.map((entry) => ({
        ...entry,
        id: `${entry.targetId}-${entry.checkedAt}`,
      })),
    ];
    return next.slice(Math.max(0, next.length - limit));
  });
}
