import {
  assertArray,
  assertEnum,
  assertFiniteNumber,
  assertPlainObject,
  assertString,
  optionalBoolean,
  optionalFiniteNumber,
  optionalString,
} from "@home-ops/framework";

import type { WatchHistoryEntry, WatchTarget } from "./types.ts";

export function validateWatchTargets(value: unknown): WatchTarget[] {
  return assertArray(value, "watch targets").map((entry, index) => {
    const target = assertPlainObject(entry, `watch target ${index}`);
    const kind = assertEnum(target.kind, `watch target ${index}.kind`, ["http", "tcp"] as const);
    const normalized: WatchTarget = {
      id: assertString(target.id, `watch target ${index}.id`),
      label: assertString(target.label, `watch target ${index}.label`),
      kind,
      url: optionalString(target.url, `watch target ${index}.url`),
      host: optionalString(target.host, `watch target ${index}.host`),
      port: optionalFiniteNumber(target.port, `watch target ${index}.port`, { min: 1, max: 65535 }),
      expectedStatus: optionalFiniteNumber(target.expectedStatus, `watch target ${index}.expectedStatus`, { min: 100, max: 599 }),
      timeoutMs: optionalFiniteNumber(target.timeoutMs, `watch target ${index}.timeoutMs`, { min: 100, max: 120000 }),
      enabled: optionalBoolean(target.enabled, `watch target ${index}.enabled`),
    };

    if (kind === "http") {
      assertString(normalized.url, `watch target ${index}.url`);
    }
    if (kind === "tcp") {
      assertString(normalized.host, `watch target ${index}.host`);
      assertFiniteNumber(normalized.port, `watch target ${index}.port`, { min: 1, max: 65535 });
    }
    return normalized;
  });
}

export function validateWatchHistory(value: unknown): WatchHistoryEntry[] {
  return assertArray(value, "watch history").map((entry, index) => {
    const item = assertPlainObject(entry, `watch history ${index}`);
    return {
      id: assertString(item.id, `watch history ${index}.id`),
      targetId: assertString(item.targetId, `watch history ${index}.targetId`),
      label: assertString(item.label, `watch history ${index}.label`),
      kind: assertEnum(item.kind, `watch history ${index}.kind`, ["http", "tcp"] as const),
      checkedAt: assertString(item.checkedAt, `watch history ${index}.checkedAt`),
      status: assertEnum(item.status, `watch history ${index}.status`, ["ok", "warn", "down"] as const),
      latencyMs: assertFiniteNumber(item.latencyMs, `watch history ${index}.latencyMs`, { min: 0 }),
      detail: assertString(item.detail, `watch history ${index}.detail`),
    };
  });
}
