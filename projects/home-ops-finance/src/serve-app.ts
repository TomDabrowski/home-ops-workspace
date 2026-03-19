import { createServer, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const appDir = join(root, "app");
const dataDir = join(root, "data");
const distDir = join(root, "dist");
const port = Number(process.env.PORT ?? 4310);

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function safeJoin(base: string, candidate: string): string | null {
  const target = normalize(join(base, candidate));
  return target.startsWith(base) ? target : null;
}

function sendFile(path: string, res: ServerResponse): void {
  const ext = extname(path);
  const type = mimeTypes[ext] ?? "text/plain; charset=utf-8";
  res.writeHead(200, { "Content-Type": type });
  res.end(readFileSync(path));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);

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

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(port, () => {
  console.log(`Home Ops Finance app available at http://localhost:${port}`);
});
