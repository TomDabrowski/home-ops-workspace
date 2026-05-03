import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { ensureFinanceDataDir, financeDataDir, financeDataPath } from "./local-config.ts";
import { readServeAppRuntimeConfig, parseBooleanFlag } from "./server-runtime-config.ts";
import {
  ValidationError,
  assertImportDraft,
  parseBaselineOverrideCollection,
  parseForecastSettings,
  parseHouseholdState,
  parseMappingState,
  parseMonthlyExpenseOverrideCollection,
  parseMusicForecastSettingCollection,
  parseMonthlyMusicIncomeOverrideCollection,
  parseMusicTaxSetting,
  parseReconciliationState,
  parseSalarySettingCollection,
  parseWealthSnapshotCollection,
} from "./persistence-validation.ts";
import { validateAllocationActionStatePayload } from "./adapters/persistence/json-boundary-validation.ts";
import { removeImportedDraftEntryById } from "./import-draft-entry-removal.ts";

const root = resolve(".");
const appDir = join(root, "app");
const srcDir = join(root, "src");
ensureFinanceDataDir();
const dataDir = financeDataDir();
const distDir = join(root, "dist");
const runtimeConfig = readServeAppRuntimeConfig();
const port = runtimeConfig.port;
const bindHost = runtimeConfig.bindHost;
const serverDisplayUrl = runtimeConfig.displayUrl;
const persistentServer = runtimeConfig.persistentServer;
const devImportDraftToolsEnabled = parseBooleanFlag(process.env.HOME_OPS_FINANCE_DEV_IMPORT_TOOLS);
const reconciliationStatePath = financeDataPath("reconciliation-state.json");
const importMappingsPath = financeDataPath("import-mappings.json");
const baselineOverridesPath = financeDataPath("baseline-overrides.json");
const monthlyExpenseOverridesPath = financeDataPath("monthly-expense-overrides.json");
const monthlyMusicIncomeOverridesPath = financeDataPath("monthly-music-income-overrides.json");
const musicForecastSettingsPath = financeDataPath("music-forecast-settings.json");
const musicTaxSettingsPath = financeDataPath("music-tax-settings.json");
const forecastSettingsPath = financeDataPath("forecast-settings.json");
const salarySettingsPath = financeDataPath("salary-settings.json");
const wealthSnapshotsPath = financeDataPath("wealth-snapshots.json");
const allocationActionStatePath = financeDataPath("allocation-action-state.json");
const householdItemsPath = financeDataPath("household-items.json");
const importDraftSourcePath = financeDataPath("import-draft.json");
const activityLogPath = financeDataPath("activity-log.log");
const autoShutdownGraceMs = 15000;
const startupNoClientGraceMs = 120000;
const staleClientSessionMs = 45000;
const staleClientSweepMs = 15000;
const activeClientSessions = new Map<string, number>();
let firstClientSessionSeen = false;

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

function invalidPayloadResponse(res: ServerResponse, errorCode: string, error: unknown): void {
  sendJson(res, 400, {
    ok: false,
    error: errorCode,
    detail: error instanceof Error ? error.message : String(error),
  });
}

function readValidatedJsonFile<T>(path: string, fallback: unknown, parser: (value: unknown) => T): T {
  const payload = existsSync(path) ? readJsonFile(path) : fallback;
  return parser(payload);
}

async function handleValidatedStateEndpoint<T>(
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    path: string;
    fallback: unknown;
    parser: (value: unknown) => T;
    successEvent: string;
    failureEvent: string;
    invalidPayloadError: string;
    saveFailedError: string;
    refreshReviewedArtifacts?: boolean;
  },
): Promise<void> {
  if (req.method === "GET") {
    try {
      return sendJson(res, 200, readValidatedJsonFile(options.path, options.fallback, options.parser));
    } catch (error) {
      appendActivityLog(`${options.failureEvent} lesen fehlgeschlagen`, {
        datei: options.path,
        fehler: error instanceof Error ? error.message : String(error),
      });
      return sendJson(res, 500, { ok: false, error: `${options.saveFailedError}_invalid_saved_data` });
    }
  }

  if (req.method === "POST") {
    try {
      const payload = options.parser(await readRequestJson(req));
      writeJsonFile(options.path, payload);
      if (options.refreshReviewedArtifacts !== false) {
        refreshReviewedArtifacts();
      }
      appendActivityLog(options.successEvent, {
        datei: options.path,
        umfang: describePayload(payload),
      });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      appendActivityLog(options.failureEvent, {
        fehler: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof ValidationError) {
        return sendJson(res, 400, { ok: false, error: options.invalidPayloadError, detail: error.message });
      }
      return sendJson(res, 500, { ok: false, error: options.saveFailedError });
    }
  }
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

function pruneMappingStateForDeletedEntry(deletedEntryId: string): void {
  if (!deletedEntryId) {
    return;
  }

  const raw = existsSync(importMappingsPath) ? readJsonFile(importMappingsPath) : {};
  const mappings = parseMappingState(raw ?? {});

  if (!(deletedEntryId in mappings)) {
    return;
  }

  const { [deletedEntryId]: _discard, ...next } = mappings;
  writeJsonFile(importMappingsPath, next);

  appendActivityLog("mapping-eintrag entfernt nach dev-import-loeschung", {
    eintrag_id: deletedEntryId,
    datei: importMappingsPath,
  });
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

function scheduleInitialStartupShutdown(): void {
  if (persistentServer) {
    return;
  }
  if (shutdownRequested || idleShutdownTimer || clientSessionCount() > 0 || firstClientSessionSeen) {
    return;
  }

  appendActivityLog("server-shutdown geplant", {
    grund: "kein tab nach start verbunden",
    warte_ms: startupNoClientGraceMs,
  });

  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;
    if (clientSessionCount() === 0 && !firstClientSessionSeen) {
      performShutdown("kein tab nach start verbunden");
    }
  }, startupNoClientGraceMs);
  idleShutdownTimer.unref();
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
  if (persistentServer) {
    return;
  }
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
        firstClientSessionSeen = true;
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

  if (url.pathname === "/api/runtime-info" && req.method === "GET") {
    return sendJson(res, 200, {
      bindHost,
      port,
      displayUrl: serverDisplayUrl,
      persistentServer,
      dataDir,
      dataMode: dataDir === join(root, "data") ? "repo-default" : "external",
    });
  }

  if (url.pathname === "/api/dev/remove-import-draft-entry" && req.method === "POST") {
    try {
      if (!devImportDraftToolsEnabled) {
        return sendJson(res, 403, { ok: false, error: "dev_import_tools_disabled" });
      }

      const payloadUnknown = await readRequestJson(req);
      const payload =
        payloadUnknown && typeof payloadUnknown === "object" ? (payloadUnknown as Record<string, unknown>) : {};

      const kind = payload.kind;
      const entryIdRaw = payload.id;
      const kindNormalized = kind === "income" || kind === "expense" ? kind : null;

      const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";

      if (!kindNormalized || !entryId) {
        return sendJson(res, 400, { ok: false, error: "invalid_import_entry_delete_payload" });
      }

      if (!existsSync(importDraftSourcePath)) {
        return sendJson(res, 404, { ok: false, error: "import_draft_missing" });
      }

      const draftCandidate = readJsonFile(importDraftSourcePath);
      try {
        assertImportDraft(draftCandidate);
      } catch (error) {
        appendActivityLog("dev-import-loeschung gespeicherter draft ungueltig", {
          datei: importDraftSourcePath,
          fehler: error instanceof Error ? error.message : String(error),
        });
        return sendJson(res, 500, {
          ok: false,
          error: "saved_import_draft_invalid",
          detail: error instanceof Error ? error.message : String(error),
        });
      }

      const monthlyExpenseOverrides = parseMonthlyExpenseOverrideCollection(readJsonFile(monthlyExpenseOverridesPath) ?? []);
      const monthlyMusicIncomeOverrides = parseMonthlyMusicIncomeOverrideCollection(readJsonFile(monthlyMusicIncomeOverridesPath) ?? []);

      const activeManualExpenseIds = new Set(
        monthlyExpenseOverrides.filter((entry) => entry.isActive !== false).map((entry) => entry.id),
      );
      const activeManualMusicIncomeIds = new Set(
        monthlyMusicIncomeOverrides.filter((entry) => entry.isActive !== false).map((entry) => entry.id),
      );

      const removal = removeImportedDraftEntryById(
        draftCandidate,
        kindNormalized,
        entryId,
        { activeManualExpenseIds, activeManualMusicIncomeIds },
      );

      if (!removal.ok) {
        return sendJson(res, 400, { ok: false, error: removal.error });
      }

      writeJsonFile(importDraftSourcePath, removal.draft);

      pruneMappingStateForDeletedEntry(entryId);

      refreshReviewedArtifacts();

      appendActivityLog("dev-import-entwurf-zeile-entfernt", {
        art: kindNormalized,
        eintrag_id: entryId,
        datei: importDraftSourcePath,
      });

      return sendJson(res, 200, { ok: true });
    } catch (error) {
      appendActivityLog("dev-import-loeschung-fehler", {
        fehler: error instanceof Error ? error.message : String(error),
      });

      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof SyntaxError) {
        return sendJson(res, 400, { ok: false, error: "malformed_import_entry_delete_payload", detail: message });
      }

      return sendJson(res, 500, { ok: false, error: "import_entry_delete_failed", detail: message });
    }
  }

  if (url.pathname === "/api/reconciliation-state") {
    return handleValidatedStateEndpoint(req, res, {
      path: reconciliationStatePath,
      fallback: {},
      parser: parseReconciliationState,
      successEvent: "reconciliation gespeichert",
      failureEvent: "reconciliation fehlgeschlagen",
      invalidPayloadError: "invalid_reconciliation_payload",
      saveFailedError: "reconciliation_save_failed",
    });
  }

  if (url.pathname === "/api/import-mappings") {
    return handleValidatedStateEndpoint(req, res, {
      path: importMappingsPath,
      fallback: {},
      parser: parseMappingState,
      successEvent: "mappings gespeichert",
      failureEvent: "mappings fehlgeschlagen",
      invalidPayloadError: "invalid_mapping_payload",
      saveFailedError: "mapping_save_failed",
    });
  }

  if (url.pathname === "/api/baseline-overrides") {
    return handleValidatedStateEndpoint(req, res, {
      path: baselineOverridesPath,
      fallback: [],
      parser: parseBaselineOverrideCollection,
      successEvent: "fixkosten gespeichert",
      failureEvent: "fixkosten fehlgeschlagen",
      invalidPayloadError: "invalid_baseline_payload",
      saveFailedError: "baseline_save_failed",
    });
  }

  if (url.pathname === "/api/monthly-expense-overrides") {
    return handleValidatedStateEndpoint(req, res, {
      path: monthlyExpenseOverridesPath,
      fallback: [],
      parser: parseMonthlyExpenseOverrideCollection,
      successEvent: "monatsausgaben gespeichert",
      failureEvent: "monatsausgaben fehlgeschlagen",
      invalidPayloadError: "invalid_monthly_expense_payload",
      saveFailedError: "monthly_expense_save_failed",
    });
  }

  if (url.pathname === "/api/monthly-music-income-overrides") {
    return handleValidatedStateEndpoint(req, res, {
      path: monthlyMusicIncomeOverridesPath,
      fallback: [],
      parser: parseMonthlyMusicIncomeOverrideCollection,
      successEvent: "musik-istwerte gespeichert",
      failureEvent: "musik-istwerte fehlgeschlagen",
      invalidPayloadError: "invalid_monthly_music_income_payload",
      saveFailedError: "monthly_music_income_save_failed",
    });
  }

  if (url.pathname === "/api/music-forecast-settings") {
    return handleValidatedStateEndpoint(req, res, {
      path: musicForecastSettingsPath,
      fallback: [],
      parser: parseMusicForecastSettingCollection,
      successEvent: "musik-forecast gespeichert",
      failureEvent: "musik-forecast fehlgeschlagen",
      invalidPayloadError: "invalid_music_forecast_payload",
      saveFailedError: "music_forecast_save_failed",
    });
  }

  if (url.pathname === "/api/music-tax-settings") {
    return handleValidatedStateEndpoint(req, res, {
      path: musicTaxSettingsPath,
      fallback: null,
      parser: parseMusicTaxSetting,
      successEvent: "musik-steuer-plan gespeichert",
      failureEvent: "musik-steuer-plan fehlgeschlagen",
      invalidPayloadError: "invalid_music_tax_settings_payload",
      saveFailedError: "music_tax_settings_save_failed",
    });
  }

  if (url.pathname === "/api/forecast-settings") {
    return handleValidatedStateEndpoint(req, res, {
      path: forecastSettingsPath,
      fallback: null,
      parser: parseForecastSettings,
      successEvent: "forecast-plan gespeichert",
      failureEvent: "forecast-plan fehlgeschlagen",
      invalidPayloadError: "invalid_forecast_settings_payload",
      saveFailedError: "forecast_settings_save_failed",
    });
  }

  if (url.pathname === "/api/salary-settings") {
    return handleValidatedStateEndpoint(req, res, {
      path: salarySettingsPath,
      fallback: [],
      parser: parseSalarySettingCollection,
      successEvent: "gehalt-plan gespeichert",
      failureEvent: "gehalt-plan fehlgeschlagen",
      invalidPayloadError: "invalid_salary_settings_payload",
      saveFailedError: "salary_settings_save_failed",
    });
  }

  if (url.pathname === "/api/wealth-snapshots") {
    return handleValidatedStateEndpoint(req, res, {
      path: wealthSnapshotsPath,
      fallback: [],
      parser: parseWealthSnapshotCollection,
      successEvent: "vermoegens-iststaende gespeichert",
      failureEvent: "vermoegens-iststaende fehlgeschlagen",
      invalidPayloadError: "invalid_wealth_snapshots_payload",
      saveFailedError: "wealth_snapshots_save_failed",
    });
  }

  if (url.pathname === "/api/allocation-action-state") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(allocationActionStatePath));
    }

    if (req.method === "POST") {
      try {
        const payload = validateAllocationActionStatePayload(await readRequestJson(req));
        writeJsonFile(allocationActionStatePath, payload);
        appendActivityLog("anweisungs-status gespeichert", {
          datei: allocationActionStatePath,
          umfang: describePayload(payload),
        });
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        appendActivityLog("anweisungs-status fehlgeschlagen", {
          fehler: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof ValidationError) {
          return invalidPayloadResponse(res, "allocation_action_state_invalid", error);
        }
        return sendJson(res, 500, { ok: false, error: "allocation_action_state_save_failed" });
      }
    }
  }

  if (url.pathname === "/api/household-items") {
    return handleValidatedStateEndpoint(req, res, {
      path: householdItemsPath,
      fallback: { items: [], insuranceCoverageAmount: 0, insuranceCoverageLabel: "" },
      parser: parseHouseholdState,
      successEvent: "hausrat gespeichert",
      failureEvent: "hausrat fehlgeschlagen",
      invalidPayloadError: "invalid_household_items_payload",
      saveFailedError: "household_items_save_failed",
      refreshReviewedArtifacts: false,
    });
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

  if (url.pathname.startsWith("/src/")) {
    const path = safeJoin(srcDir, url.pathname.replace("/src/", ""));
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

server.listen(port, bindHost, () => {
  appendActivityLog("server gestartet", {
    url: serverDisplayUrl,
    bind_host: bindHost,
    modus: persistentServer ? "persistent" : "local-auto-shutdown",
    datenpfad: dataDir,
  });
  console.log(`Home Ops Finance app available at ${serverDisplayUrl}`);
  scheduleInitialStartupShutdown();
});
