import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { ensureFinanceDataDir, financeDataDir, financeDataPath } from "./local-config.ts";

const root = resolve(".");
const appDir = join(root, "app");
ensureFinanceDataDir();
const dataDir = financeDataDir();
const distDir = join(root, "dist");
const port = Number(process.env.PORT ?? 4310);
const reconciliationStatePath = financeDataPath("reconciliation-state.json");
const importMappingsPath = financeDataPath("import-mappings.json");
const baselineOverridesPath = financeDataPath("baseline-overrides.json");
const monthlyExpenseOverridesPath = financeDataPath("monthly-expense-overrides.json");
const monthlyMusicIncomeOverridesPath = financeDataPath("monthly-music-income-overrides.json");
const musicTaxSettingsPath = financeDataPath("music-tax-settings.json");
const forecastSettingsPath = financeDataPath("forecast-settings.json");
const salarySettingsPath = financeDataPath("salary-settings.json");
const wealthSnapshotsPath = financeDataPath("wealth-snapshots.json");
const householdItemsPath = financeDataPath("household-items.json");
const activityLogPath = financeDataPath("activity-log.log");
const autoShutdownGraceMs = 5000;
const staleClientSessionMs = 45000;
const staleClientSweepMs = 15000;
const activeClientSessions = new Map<string, number>();

let idleShutdownTimer: NodeJS.Timeout | null = null;
let shutdownRequested = false;

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function noCacheHeaders(type: string): Record<string, string> {
  return {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function safeJoin(base: string, candidate: string): string | null {
  const target = normalize(join(base, candidate));
  return target.startsWith(base) ? target : null;
}

function sendFile(path: string, res: ServerResponse): void {
  const ext = extname(path);
  const type = mimeTypes[ext] ?? "text/plain; charset=utf-8";
  res.writeHead(200, noCacheHeaders(type));
  res.end(readFileSync(path));
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, noCacheHeaders("application/json; charset=utf-8"));
  res.end(JSON.stringify(payload, null, 2));
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    return {};
  }

  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function writeJsonFile(path: string, payload: unknown): void {
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function describePayload(payload: unknown): string {
  if (Array.isArray(payload)) {
    return `${payload.length} Einträge`;
  }

  if (payload && typeof payload === "object") {
    return `${Object.keys(payload).length} Schlüssel`;
  }

  return typeof payload;
}

function appendActivityLog(event: string, details: Record<string, string | number> = {}): void {
  const lines = [`[${new Date().toISOString()}] ${event}`];

  for (const [key, value] of Object.entries(details)) {
    lines.push(`  ${key}: ${String(value)}`);
  }

  appendFileSync(activityLogPath, lines.join("\n") + "\n", "utf8");
}

function notifyMac(title: string, message: string): void {
  try {
    const escapedTitle = title.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
    const escapedMessage = message.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
    execFileSync("/usr/bin/osascript", ["-e", `display notification "${escapedMessage}" with title "${escapedTitle}"`], {
      stdio: "ignore",
    });
  } catch {
    // Best effort only: notifications should never block the server lifecycle.
  }
}

function clientSessionCount(): number {
  return activeClientSessions.size;
}

function removeStaleClientSessions(reason: string): void {
  const now = Date.now();
  let removedCount = 0;

  for (const [clientId, lastSeenAt] of activeClientSessions.entries()) {
    if (now - lastSeenAt <= staleClientSessionMs) {
      continue;
    }

    activeClientSessions.delete(clientId);
    removedCount += 1;
  }

  if (removedCount > 0) {
    appendActivityLog("verwaiste tabs entfernt", {
      grund: reason,
      entfernt: removedCount,
      aktive_tabs: clientSessionCount(),
    });
  }

}

function cancelIdleShutdown(reason: string): void {
  if (!idleShutdownTimer) {
    return;
  }

  clearTimeout(idleShutdownTimer);
  idleShutdownTimer = null;
  appendActivityLog("server-shutdown abgebrochen", { grund: reason, aktive_tabs: clientSessionCount() });
}

function performShutdown(reason: string): void {
  if (shutdownRequested) {
    return;
  }

  shutdownRequested = true;
  appendActivityLog("server-shutdown gestartet", { grund: reason, aktive_tabs: clientSessionCount() });
  notifyMac("Home Ops Finance", `Server wird beendet (${reason}).`);
  server.close(() => {
    appendActivityLog("server beendet", { url: `http://localhost:${port}`, grund: reason });
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(0);
  }, 1500).unref();
}

function scheduleIdleShutdown(reason: string): void {
  removeStaleClientSessions(`${reason} (stale sweep)`);

  if (shutdownRequested || idleShutdownTimer || clientSessionCount() > 0) {
    return;
  }

  appendActivityLog("server-shutdown geplant", {
    grund: reason,
    warte_ms: autoShutdownGraceMs,
  });
  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;
    if (clientSessionCount() === 0) {
      performShutdown(reason);
    }
  }, autoShutdownGraceMs);
  idleShutdownTimer.unref();
}

const staleClientSweepTimer = setInterval(() => {
  removeStaleClientSessions("heartbeat ausgeblieben");
  scheduleIdleShutdown("heartbeat ausgeblieben");
}, staleClientSweepMs);
staleClientSweepTimer.unref();

function refreshReviewedArtifacts(): void {
  execFileSync(process.execPath, ["--experimental-strip-types", "src/apply-review-state.ts"], {
    cwd: root,
    stdio: "pipe",
  });

  if (!existsSync(financeDataPath("import-draft-reviewed.json"))) {
    appendActivityLog("reviewed-artifacts übersprungen", {
      grund: "kein reviewed import draft vorhanden",
    });
    return;
  }

  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "src/draft-report.ts",
      financeDataPath("import-draft-reviewed.json"),
      financeDataPath("draft-report-reviewed.json"),
      financeDataPath("draft-report-reviewed.md"),
    ],
    {
      cwd: root,
      stdio: "pipe",
    },
  );

  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "src/monthly-engine.ts",
      financeDataPath("import-draft-reviewed.json"),
      financeDataPath("monthly-plan-reviewed.json"),
      financeDataPath("monthly-plan-reviewed.md"),
    ],
    {
      cwd: root,
      stdio: "pipe",
    },
  );

  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "src/build-dashboard.ts",
      financeDataPath("draft-report-reviewed.json"),
      financeDataPath("monthly-plan-reviewed.json"),
      "dist/dashboard-reviewed.html",
    ],
    {
      cwd: root,
      stdio: "pipe",
    },
  );

  appendActivityLog("reviewed-artifacts aktualisiert", {
    quelle: financeDataPath("import-draft-reviewed.json"),
  });
}

async function readRequestJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    return {};
  }

  return JSON.parse(body) as unknown;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);

  if (url.pathname === "/api/shutdown" && req.method === "POST") {
    appendActivityLog("app-beenden angefordert", {
      quelle: req.socket.remoteAddress ?? "unbekannt",
    });
    sendJson(res, 200, { ok: true });
    performShutdown("manuell über app-beenden");
    return;
  }

  if (url.pathname === "/api/client-session" && req.method === "POST") {
    try {
      const payload = await readRequestJson(req);
      const clientId =
        payload && typeof payload === "object" && "clientId" in payload ? payload.clientId : null;
      const action =
        payload && typeof payload === "object" && "action" in payload ? payload.action : null;

      if (typeof clientId !== "string" || typeof action !== "string" || clientId.length < 8) {
        return sendJson(res, 400, { ok: false, error: "invalid_client_session_payload" });
      }

      if (action === "open" || action === "heartbeat") {
        activeClientSessions.set(clientId, Date.now());
        cancelIdleShutdown(action === "open" ? "tab wieder geöffnet" : "heartbeat empfangen");
        if (action === "open") {
          appendActivityLog("tab verbunden", {
            client_id: clientId,
            aktive_tabs: clientSessionCount(),
          });
        }
        return sendJson(res, 200, { ok: true, activeClients: clientSessionCount() });
      }

      if (action === "close") {
        activeClientSessions.delete(clientId);
        appendActivityLog("tab geschlossen", {
          client_id: clientId,
          aktive_tabs: clientSessionCount(),
        });
        sendJson(res, 200, { ok: true, activeClients: clientSessionCount() });
        scheduleIdleShutdown("letzter tab geschlossen");
        return;
      }

      return sendJson(res, 400, { ok: false, error: "invalid_client_session_action" });
    } catch (error) {
      appendActivityLog("client-session fehlgeschlagen", {
        fehler: error instanceof Error ? error.message : String(error),
      });
      return sendJson(res, 500, { ok: false, error: "client_session_failed" });
    }
  }

  if (url.pathname === "/api/reconciliation-state") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(reconciliationStatePath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(reconciliationStatePath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("reconciliation gespeichert", {
          datei: reconciliationStatePath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("reconciliation fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "reconciliation_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/import-mappings") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(importMappingsPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(importMappingsPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("mappings gespeichert", {
          datei: importMappingsPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("mappings fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "mapping_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/baseline-overrides") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(baselineOverridesPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(baselineOverridesPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("fixkosten gespeichert", {
          datei: baselineOverridesPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("fixkosten fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "baseline_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/monthly-expense-overrides") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(monthlyExpenseOverridesPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(monthlyExpenseOverridesPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("monatsausgaben gespeichert", {
          datei: monthlyExpenseOverridesPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("monatsausgaben fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "monthly_expense_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/monthly-music-income-overrides") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(monthlyMusicIncomeOverridesPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(monthlyMusicIncomeOverridesPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("musik-istwerte gespeichert", {
          datei: monthlyMusicIncomeOverridesPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("musik-istwerte fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "monthly_music_income_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/music-tax-settings") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(musicTaxSettingsPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(musicTaxSettingsPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("musik-steuer-plan gespeichert", {
          datei: musicTaxSettingsPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("musik-steuer-plan fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "music_tax_settings_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/forecast-settings") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(forecastSettingsPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(forecastSettingsPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("forecast-plan gespeichert", {
          datei: forecastSettingsPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("forecast-plan fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "forecast_settings_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/salary-settings") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(salarySettingsPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(salarySettingsPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("gehalt-plan gespeichert", {
          datei: salarySettingsPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("gehalt-plan fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "salary_settings_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/wealth-snapshots") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(wealthSnapshotsPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(wealthSnapshotsPath, payload);
        refreshReviewedArtifacts();
        appendActivityLog("vermoegens-iststaende gespeichert", {
          datei: wealthSnapshotsPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("vermoegens-iststaende fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "wealth_snapshots_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/household-items") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(householdItemsPath));
    }

    if (req.method === "POST") {
      try {
        const payload = await readRequestJson(req);
        writeJsonFile(householdItemsPath, payload);
        appendActivityLog("hausrat gespeichert", {
          datei: householdItemsPath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("hausrat fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, { ok: false, error: "household_items_save_failed" });
      }
    }
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return sendFile(join(appDir, "index.html"), res);
  }

  if (url.pathname.startsWith("/app/")) {
    const path = safeJoin(appDir, url.pathname.replace("/app/", ""));
    if (path && existsSync(path)) {
      return sendFile(path, res);
    }
  }

  if (url.pathname.startsWith("/data/")) {
    const path = safeJoin(dataDir, url.pathname.replace("/data/", ""));
    if (path && existsSync(path)) {
      return sendFile(path, res);
    }
  }

  if (url.pathname.startsWith("/dist/")) {
    const path = safeJoin(distDir, url.pathname.replace("/dist/", ""));
    if (path && existsSync(path)) {
      return sendFile(path, res);
    }
  }

  res.writeHead(404, noCacheHeaders("text/plain; charset=utf-8"));
  res.end("Not found");
});

server.listen(port, () => {
  appendActivityLog("server gestartet", { url: `http://localhost:${port}` });
  console.log(`Home Ops Finance app available at http://localhost:${port}`);
});
