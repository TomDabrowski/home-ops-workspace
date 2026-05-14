export type WatchTargetKind = "http" | "tcp" | "json-status";
export type WatchStatus = "ok" | "warn" | "down";

export interface WatchTarget {
  id: string;
  label: string;
  kind: WatchTargetKind;
  url?: string;
  host?: string;
  port?: number;
  expectedStatus?: number;
  statusPath?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface WatchCheckResult {
  targetId: string;
  label: string;
  kind: WatchTargetKind;
  checkedAt: string;
  status: WatchStatus;
  latencyMs: number;
  detail: string;
}

export interface WatchHistoryEntry extends WatchCheckResult {
  id: string;
}

export interface WatchSummary {
  checkedAt: string | null;
  total: number;
  ok: number;
  warn: number;
  down: number;
  status: WatchStatus;
}

export interface WatchReport {
  summary: WatchSummary;
  targets: WatchTarget[];
  latestResults: WatchCheckResult[];
}
