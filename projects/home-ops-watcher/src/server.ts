import { createServer } from "node:http";

import {
  readRuntimeServerConfig,
  sendError,
  sendJson,
} from "@home-ops/framework";

import { buildWatchReport, runTargetChecks } from "./checks.ts";
import { configuredTargets } from "./config.ts";
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
  return buildWatchReport(targets, latestResults);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", runtime.displayUrl);

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      const targets = configuredTargets();
      sendJson(res, {
        ok: true,
        ...buildWatchReport(targets, latestResults),
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
<title>Home Ops Watcher</title>
<style>
  body { margin: 32px; background: #10141d; color: #f7f8fb; font: 15px/1.5 system-ui, sans-serif; }
  button { border: 0; border-radius: 8px; padding: 10px 14px; background: #dce9ff; color: #111827; font-weight: 700; }
  pre { background: #1c2330; border: 1px solid #30394a; border-radius: 8px; padding: 16px; overflow: auto; }
</style>
<h1>Home Ops Watcher</h1>
<p>Lokaler Status fuer Home-Lab-Services und Geraete.</p>
<button id="run">Checks starten</button>
<pre id="output">Noch keine Checks gelaufen.</pre>
<script>
  const output = document.querySelector("#output");
  async function refresh(method = "GET", path = "/api/status") {
    const response = await fetch(path, { method });
    output.textContent = JSON.stringify(await response.json(), null, 2);
  }
  document.querySelector("#run").addEventListener("click", () => refresh("POST", "/api/checks/run"));
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
