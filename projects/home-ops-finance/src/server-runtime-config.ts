function parseBooleanFlag(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface ServeAppRuntimeConfig {
  bindHost: string;
  port: number;
  persistentServer: boolean;
  displayUrl: string;
}

export function readServeAppRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ServeAppRuntimeConfig {
  const bindHost = env.HOME_OPS_FINANCE_HOST?.trim() || "127.0.0.1";
  const port = parsePort(env.PORT, 4310);
  const persistentServer = parseBooleanFlag(env.HOME_OPS_FINANCE_SERVER_MODE);
  const publicBaseUrl = env.HOME_OPS_FINANCE_PUBLIC_BASE_URL?.trim();
  const displayHost = bindHost === "0.0.0.0" ? "localhost" : bindHost;

  return {
    bindHost,
    port,
    persistentServer,
    displayUrl: publicBaseUrl || `http://${displayHost}:${port}`,
  };
}
