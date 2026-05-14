import { createServer } from "node:http";

import {
  readJsonBody,
  readRuntimeServerConfig,
  sendError,
  sendJson,
} from "@home-ops/framework";

import { configuredJobs } from "./config.ts";
import { buildBackupReport } from "./report.ts";
import { appendBackupRun, backupRunStore } from "./state.ts";
import { validateBackupRunInput } from "./validation.ts";

const runtime = readRuntimeServerConfig({
  envPrefix: "HOME_OPS_BACKUP",
  defaultPort: 4321,
});

function currentReport() {
  return buildBackupReport(configuredJobs(), backupRunStore.read());
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", runtime.displayUrl);

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, { ok: true, ...currentReport() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/runs") {
      sendJson(res, { ok: true, runs: backupRunStore.read() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/runs") {
      const input = await readJsonBody(req, validateBackupRunInput);
      if (!configuredJobs().some((job) => job.id === input.jobId)) {
        throw new Error(`Unknown backup job: ${input.jobId}`);
      }
      appendBackupRun(input);
      sendJson(res, { ok: true, ...currentReport() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(`<!doctype html>
<html lang="de">
<meta charset="utf-8">
<title>Home Ops Backup Control</title>
<style>
  body { margin: 32px; background: #10141d; color: #f7f8fb; font: 15px/1.5 system-ui, sans-serif; }
  pre { background: #1c2330; border: 1px solid #30394a; border-radius: 8px; padding: 16px; overflow: auto; }
</style>
<h1>Home Ops Backup Control</h1>
<p>Lokaler Status fuer Backup-Jobs und Staleness.</p>
<pre id="output">Loading...</pre>
<script>
  fetch("/api/status")
    .then((response) => response.json())
    .then((data) => { document.querySelector("#output").textContent = JSON.stringify(data, null, 2); });
</script>`);
      return;
    }

    sendError(res, 404, "Not found");
  } catch (error) {
    sendError(res, 400, error instanceof Error ? error.message : String(error));
  }
});

server.listen(runtime.port, runtime.bindHost, () => {
  console.log(`Home Ops Backup Control listening on ${runtime.displayUrl}`);
});
