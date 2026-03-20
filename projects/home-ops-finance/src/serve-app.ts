import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const appDir = join(root, "app");
const dataDir = join(root, "data");
const distDir = join(root, "dist");
const port = Number(process.env.PORT ?? 4310);
const reconciliationStatePath = join(dataDir, "reconciliation-state.json");
const importMappingsPath = join(dataDir, "import-mappings.json");
const baselineOverridesPath = join(dataDir, "baseline-overrides.json");
const monthlyExpenseOverridesPath = join(dataDir, "monthly-expense-overrides.json");

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

function refreshReviewedArtifacts(): void {
  execFileSync(process.execPath, ["--experimental-strip-types", "src/apply-review-state.ts"], {
    cwd: root,
    stdio: "pipe",
  });

  if (!existsSync(join(dataDir, "import-draft-reviewed.json"))) {
    return;
  }

  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "src/draft-report.ts",
      "data/import-draft-reviewed.json",
      "data/draft-report-reviewed.json",
      "data/draft-report-reviewed.md",
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
      "data/import-draft-reviewed.json",
      "data/monthly-plan-reviewed.json",
      "data/monthly-plan-reviewed.md",
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
      "data/draft-report-reviewed.json",
      "data/monthly-plan-reviewed.json",
      "dist/dashboard-reviewed.html",
    ],
    {
      cwd: root,
      stdio: "pipe",
    },
  );
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

  if (url.pathname === "/api/reconciliation-state") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(reconciliationStatePath));
    }

    if (req.method === "POST") {
      const payload = await readRequestJson(req);
      writeJsonFile(reconciliationStatePath, payload);
      refreshReviewedArtifacts();
      return sendJson(res, 200, { ok: true });
    }
  }

  if (url.pathname === "/api/import-mappings") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(importMappingsPath));
    }

    if (req.method === "POST") {
      const payload = await readRequestJson(req);
      writeJsonFile(importMappingsPath, payload);
      refreshReviewedArtifacts();
      return sendJson(res, 200, { ok: true });
    }
  }

  if (url.pathname === "/api/baseline-overrides") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(baselineOverridesPath));
    }

    if (req.method === "POST") {
      const payload = await readRequestJson(req);
      writeJsonFile(baselineOverridesPath, payload);
      refreshReviewedArtifacts();
      return sendJson(res, 200, { ok: true });
    }
  }

  if (url.pathname === "/api/monthly-expense-overrides") {
    if (req.method === "GET") {
      return sendJson(res, 200, readJsonFile(monthlyExpenseOverridesPath));
    }

    if (req.method === "POST") {
      const payload = await readRequestJson(req);
      writeJsonFile(monthlyExpenseOverridesPath, payload);
      refreshReviewedArtifacts();
      return sendJson(res, 200, { ok: true });
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
  console.log(`Home Ops Finance app available at http://localhost:${port}`);
});
