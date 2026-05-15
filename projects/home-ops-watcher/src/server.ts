import { createServer } from "node:http";

import {
  readRuntimeServerConfig,
  sendError,
  sendJson,
} from "@home-ops/framework";

import { buildWatchReport, latestResultsForTargets, runTargetChecks } from "./checks.ts";
import { configuredTargets, notificationConfig } from "./config.ts";
import { sendWebhookNotification, shouldNotify } from "./notifications.ts";
import { appendWatchHistory, watchHistoryStore } from "./state.ts";
import type { WatchCheckResult } from "./types.ts";

const runtime = readRuntimeServerConfig({
  envPrefix: "HOME_OPS_WATCHER",
  defaultPort: 4320,
});

let latestResults: WatchCheckResult[] = [];

async function runAndStoreChecks() {
  const targets = configuredTargets();
  latestResults = await runTargetChecks(targets);
  appendWatchHistory(latestResults);
  const report = buildWatchReport(targets, latestResults);
  const notifications = notificationConfig();
  if (notifications.webhookUrl && shouldNotify(report, notifications.minimumStatus)) {
    try {
      await sendWebhookNotification(notifications.webhookUrl, report);
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error));
    }
  }
  return report;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", runtime.displayUrl);

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      const targets = configuredTargets();
      const results = latestResults.length ? latestResults : latestResultsForTargets(targets, watchHistoryStore.read());
      sendJson(res, {
        ok: true,
        ...buildWatchReport(targets, results),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/checks/run") {
      sendJson(res, {
        ok: true,
        ...await runAndStoreChecks(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/history") {
      sendJson(res, { ok: true, history: watchHistoryStore.read() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(`<!doctype html>
<html lang="de">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home Ops Watcher</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #10141d;
    --panel: #1b2230;
    --panel-strong: #232b3a;
    --line: #344052;
    --text: #f7f8fb;
    --muted: #aeb8c8;
    --ok: #4ade80;
    --warn: #fbbf24;
    --down: #fb7185;
    --action: #dce9ff;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
  main { width: min(1120px, calc(100vw - 32px)); margin: 28px auto; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 28px; line-height: 1.1; }
  p { margin: 6px 0 0; color: var(--muted); }
  button { border: 0; border-radius: 8px; padding: 10px 14px; background: var(--action); color: #111827; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: .62; cursor: wait; }
  .summary { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(4, minmax(88px, .5fr)); gap: 12px; margin-bottom: 18px; }
  .tile, .target { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
  .tile strong { display: block; font-size: 22px; line-height: 1.1; }
  .tile span, .target span { color: var(--muted); font-size: 13px; }
  .status { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 5px 9px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
  .status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .ok { color: var(--ok); background: rgba(74, 222, 128, .1); }
  .warn { color: var(--warn); background: rgba(251, 191, 36, .1); }
  .down { color: var(--down); background: rgba(251, 113, 133, .1); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .target { min-height: 142px; display: flex; flex-direction: column; gap: 10px; }
  .target h2 { margin: 0; font-size: 16px; line-height: 1.2; }
  .target .meta { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 13px; }
  .target p { margin-top: auto; overflow-wrap: anywhere; }
  details { margin-top: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
  summary { padding: 12px 14px; cursor: pointer; color: var(--muted); }
  pre { margin: 0; border-top: 1px solid var(--line); background: var(--panel-strong); padding: 16px; overflow: auto; }
  .empty { border: 1px dashed var(--line); border-radius: 8px; padding: 24px; color: var(--muted); }
  @media (max-width: 760px) {
    header { display: block; }
    button { margin-top: 14px; width: 100%; }
    .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .summary .tile:first-child { grid-column: 1 / -1; }
  }
</style>
<main>
  <header>
    <div>
      <h1>Home Ops Watcher</h1>
      <p>Lokaler Status fuer Home-Lab-Services, Geraete und Home-Ops-Apps.</p>
    </div>
    <button id="run">Checks starten</button>
  </header>
  <section class="summary" id="summary"></section>
  <section class="grid" id="targets"></section>
  <details>
    <summary>JSON Details</summary>
    <pre id="output">Noch keine Checks gelaufen.</pre>
  </details>
</main>
<script>
  const output = document.querySelector("#output");
  const summary = document.querySelector("#summary");
  const targets = document.querySelector("#targets");
  const runButton = document.querySelector("#run");

  function statusClass(status) {
    return status === "ok" ? "ok" : status === "warn" ? "warn" : "down";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatCheckedAt(value) {
    return value ? new Date(value).toLocaleString("de-DE") : "Noch nicht geprueft";
  }

  function renderSummary(data) {
    const info = data.summary ?? { status: "ok", total: 0, ok: 0, warn: 0, down: 0, checkedAt: null };
    summary.innerHTML = [
      '<article class="tile"><span>Gesamtstatus</span><strong><span class="status ' + statusClass(info.status) + '">' + escapeHtml(info.status) + '</span></strong><p>' + escapeHtml(formatCheckedAt(info.checkedAt)) + '</p></article>',
      '<article class="tile"><span>Targets</span><strong>' + info.total + '</strong></article>',
      '<article class="tile"><span>OK</span><strong>' + info.ok + '</strong></article>',
      '<article class="tile"><span>Warn</span><strong>' + info.warn + '</strong></article>',
      '<article class="tile"><span>Down</span><strong>' + info.down + '</strong></article>',
    ].join("");
  }

  function renderTargets(data) {
    const results = data.latestResults ?? [];
    const configured = data.targets ?? [];
    if (!configured.length) {
      targets.innerHTML = '<div class="empty">Keine Targets konfiguriert.</div>';
      return;
    }
    targets.innerHTML = configured.map((target) => {
      const result = results.find((entry) => entry.targetId === target.id);
      const status = result?.status ?? "warn";
      const detail = result?.detail ?? "Noch kein Check gelaufen.";
      const latency = result ? result.latencyMs + " ms" : "-";
      return '<article class="target">'
        + '<div class="meta"><span>' + escapeHtml(target.kind) + '</span><span>' + escapeHtml(latency) + '</span></div>'
        + '<h2>' + escapeHtml(target.label) + '</h2>'
        + '<span class="status ' + statusClass(status) + '">' + escapeHtml(status) + '</span>'
        + '<p>' + escapeHtml(detail) + '</p>'
        + '</article>';
    }).join("");
  }

  function render(data) {
    output.textContent = JSON.stringify(data, null, 2);
    renderSummary(data);
    renderTargets(data);
  }

  async function refresh(method = "GET", path = "/api/status") {
    runButton.disabled = true;
    try {
      const response = await fetch(path, { method });
      render(await response.json());
    } finally {
      runButton.disabled = false;
    }
  }
  runButton.addEventListener("click", () => refresh("POST", "/api/checks/run"));
  refresh();
</script>`);
      return;
    }

    sendError(res, 404, "Not found");
  } catch (error) {
    sendError(res, 400, error instanceof Error ? error.message : String(error));
  }
});

server.listen(runtime.port, runtime.bindHost, () => {
  console.log(`Home Ops Watcher listening on ${runtime.displayUrl}`);
});
