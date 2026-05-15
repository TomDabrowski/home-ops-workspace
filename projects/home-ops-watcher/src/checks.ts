import { connect } from "node:net";
import { performance } from "node:perf_hooks";

import type { WatchCheckResult, WatchHistoryEntry, WatchReport, WatchStatus, WatchTarget } from "./types.ts";

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref();
  return controller.signal;
}

function resultStatusFromHttp(actualStatus: number, expectedStatus: number): WatchStatus {
  if (actualStatus === expectedStatus) {
    return "ok";
  }
  return actualStatus >= 200 && actualStatus < 500 ? "warn" : "down";
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function resultStatusFromJson(value: unknown): WatchStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "ok" || normalized === "healthy" || normalized === "up") {
    return "ok";
  }
  if (normalized === "warn" || normalized === "warning" || normalized === "degraded") {
    return "warn";
  }
  if (normalized === "down" || normalized === "failed" || normalized === "error" || normalized === "critical") {
    return "down";
  }
  return "warn";
}

function hoursBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (to - from) / 36e5);
}

async function runHttpCheck(target: WatchTarget, checkedAt: string): Promise<WatchCheckResult> {
  const timeoutMs = target.timeoutMs ?? 3000;
  const expectedStatus = target.expectedStatus ?? 200;
  const start = performance.now();
  try {
    const response = await fetch(target.url!, {
      method: "GET",
      signal: timeoutSignal(timeoutMs),
    });
    const latencyMs = Math.round(performance.now() - start);
    const status = resultStatusFromHttp(response.status, expectedStatus);
    return {
      targetId: target.id,
      label: target.label,
      kind: target.kind,
      checkedAt,
      status,
      latencyMs,
      detail: `HTTP ${response.status}; expected ${expectedStatus}`,
    };
  } catch (error) {
    return {
      targetId: target.id,
      label: target.label,
      kind: target.kind,
      checkedAt,
      status: "down",
      latencyMs: Math.round(performance.now() - start),
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runJsonStatusCheck(target: WatchTarget, checkedAt: string): Promise<WatchCheckResult> {
  const timeoutMs = target.timeoutMs ?? 3000;
  const statusPath = target.statusPath ?? "summary.status";
  const start = performance.now();
  try {
    const response = await fetch(target.url!, {
      method: "GET",
      signal: timeoutSignal(timeoutMs),
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!response.ok) {
      return {
        targetId: target.id,
        label: target.label,
        kind: target.kind,
        checkedAt,
        status: "down",
        latencyMs,
        detail: `HTTP ${response.status}; JSON status not read`,
      };
    }

    const payload = await response.json() as unknown;
    const statusValue = readPath(payload, statusPath);
    const status = resultStatusFromJson(statusValue);
    return {
      targetId: target.id,
      label: target.label,
      kind: target.kind,
      checkedAt,
      status,
      latencyMs,
      detail: `JSON ${statusPath}=${String(statusValue)}`,
    };
  } catch (error) {
    return {
      targetId: target.id,
      label: target.label,
      kind: target.kind,
      checkedAt,
      status: "down",
      latencyMs: Math.round(performance.now() - start),
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTcpCheck(target: WatchTarget, checkedAt: string): Promise<WatchCheckResult> {
  const timeoutMs = target.timeoutMs ?? 3000;
  const start = performance.now();
  return await new Promise((resolve) => {
    const socket = connect({
      host: target.host!,
      port: target.port!,
      timeout: timeoutMs,
    });

    const finish = (status: WatchStatus, detail: string) => {
      socket.destroy();
      resolve({
        targetId: target.id,
        label: target.label,
        kind: target.kind,
        checkedAt,
        status,
        latencyMs: Math.round(performance.now() - start),
        detail,
      });
    };

    socket.once("connect", () => finish("ok", `TCP ${target.host}:${target.port} reachable`));
    socket.once("timeout", () => finish("down", `TCP timeout after ${timeoutMs}ms`));
    socket.once("error", (error) => finish("down", error.message));
  });
}

export async function runTargetCheck(target: WatchTarget, checkedAt = new Date().toISOString()): Promise<WatchCheckResult> {
  if (target.enabled === false) {
    return {
      targetId: target.id,
      label: target.label,
      kind: target.kind,
      checkedAt,
      status: "warn",
      latencyMs: 0,
      detail: "Target is disabled",
    };
  }
  if (target.kind === "http") {
    return await runHttpCheck(target, checkedAt);
  }
  if (target.kind === "json-status") {
    return await runJsonStatusCheck(target, checkedAt);
  }
  return await runTcpCheck(target, checkedAt);
}

export async function runTargetChecks(targets: WatchTarget[], checkedAt = new Date().toISOString()): Promise<WatchCheckResult[]> {
  return await Promise.all(targets.map((target) => runTargetCheck(target, checkedAt)));
}

export function summarizeResults(results: WatchCheckResult[]) {
  const summary = {
    checkedAt: null as string | null,
    total: results.length,
    ok: results.filter((entry) => entry.status === "ok").length,
    warn: results.filter((entry) => entry.status === "warn").length,
    down: results.filter((entry) => entry.status === "down").length,
    status: "ok" as WatchStatus,
  };
  summary.status = summary.down > 0 ? "down" : summary.warn > 0 ? "warn" : "ok";
  return summary;
}

function latestResultForTarget(results: WatchCheckResult[], targetId: string): WatchCheckResult | null {
  return results
    .filter((entry) => entry.targetId === targetId)
    .sort((left, right) => String(right.checkedAt).localeCompare(String(left.checkedAt)))[0] ?? null;
}

export function latestResultsForTargets(targets: WatchTarget[], history: WatchHistoryEntry[]): WatchCheckResult[] {
  return targets
    .map((target) => latestResultForTarget(history, target.id))
    .filter((entry): entry is WatchCheckResult => entry !== null);
}

function reportResultForTarget(target: WatchTarget, result: WatchCheckResult | null, checkedAt: string): WatchCheckResult {
  if (!result) {
    return {
      targetId: target.id,
      label: target.label,
      kind: target.kind,
      checkedAt,
      status: "warn",
      latencyMs: 0,
      detail: "No check recorded yet.",
    };
  }

  if (target.staleAfterHours === undefined) {
    return result;
  }

  const ageHours = hoursBetween(result.checkedAt, checkedAt);
  if (ageHours <= target.staleAfterHours) {
    return result;
  }

  return {
    ...result,
    status: result.status === "down" ? "down" : "warn",
    detail: `${result.detail}; stale after ${ageHours.toFixed(1)} hours without a fresh check`,
  };
}

export function buildWatchReport(targets: WatchTarget[], latestResults: WatchCheckResult[], checkedAt = new Date().toISOString()): WatchReport {
  const reportResults = targets.map((target) => reportResultForTarget(target, latestResultForTarget(latestResults, target.id), checkedAt));
  const summary = summarizeResults(reportResults);
  summary.checkedAt = checkedAt;
  return {
    summary,
    targets,
    latestResults: reportResults,
  };
}
