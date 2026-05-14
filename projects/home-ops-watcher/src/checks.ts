import { connect } from "node:net";
import { performance } from "node:perf_hooks";

import type { WatchCheckResult, WatchReport, WatchStatus, WatchTarget } from "./types.ts";

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
  return target.kind === "http"
    ? await runHttpCheck(target, checkedAt)
    : await runTcpCheck(target, checkedAt);
}

export async function runTargetChecks(targets: WatchTarget[], checkedAt = new Date().toISOString()): Promise<WatchCheckResult[]> {
  return await Promise.all(targets.map((target) => runTargetCheck(target, checkedAt)));
}

export function summarizeResults(results: WatchCheckResult[]) {
  const summary = {
    checkedAt: results[0]?.checkedAt ?? null,
    total: results.length,
    ok: results.filter((entry) => entry.status === "ok").length,
    warn: results.filter((entry) => entry.status === "warn").length,
    down: results.filter((entry) => entry.status === "down").length,
    status: "ok" as WatchStatus,
  };
  summary.status = summary.down > 0 ? "down" : summary.warn > 0 ? "warn" : "ok";
  return summary;
}

export function buildWatchReport(targets: WatchTarget[], latestResults: WatchCheckResult[]): WatchReport {
  return {
    summary: summarizeResults(latestResults),
    targets,
    latestResults,
  };
}
