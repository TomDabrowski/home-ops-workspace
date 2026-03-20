import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

interface LocalConfig {
  dataDir?: string;
  workbookPath?: string;
}

const projectRoot = resolve(".");
const defaultDataDir = join(projectRoot, "data");
const localConfigPath = join(projectRoot, "config.local.json");
const envDataDir = process.env.HOME_OPS_FINANCE_DATA_DIR?.trim();
const envWorkbookPath = process.env.HOME_OPS_FINANCE_WORKBOOK_PATH?.trim();

let cachedConfig: LocalConfig | null = null;

function resolveProjectPath(value: string): string {
  return isAbsolute(value) ? value : resolve(projectRoot, value);
}

function readLocalConfig(): LocalConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (!existsSync(localConfigPath)) {
    cachedConfig = {};
    return cachedConfig;
  }

  cachedConfig = JSON.parse(readFileSync(localConfigPath, "utf8")) as LocalConfig;
  return cachedConfig;
}

function configuredDataDir(): string | null {
  if (envDataDir) {
    return resolveProjectPath(envDataDir);
  }

  const config = readLocalConfig();
  return config.dataDir?.trim() ? resolveProjectPath(config.dataDir.trim()) : null;
}

function configuredWorkbookPath(): string | null {
  if (envWorkbookPath) {
    return resolveProjectPath(envWorkbookPath);
  }

  const config = readLocalConfig();
  return config.workbookPath?.trim() ? resolveProjectPath(config.workbookPath.trim()) : null;
}

export function financeDataDir(): string {
  return configuredDataDir() ?? defaultDataDir;
}

export function financeDataPath(fileName: string): string {
  return join(financeDataDir(), fileName);
}

export function ensureFinanceDataDir(): string {
  const dataDir = financeDataDir();
  const isConfigured = dataDir !== defaultDataDir;

  if (isConfigured) {
    if (!existsSync(dataDir)) {
      throw new Error(
        `Configured finance data directory is not available: ${dataDir}. Check config.local.json, HOME_OPS_FINANCE_DATA_DIR, or your NAS/iCloud path.`,
      );
    }

    return dataDir;
  }

  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function financeWorkbookPath(): string {
  return configuredWorkbookPath() ?? resolve("/Users/tom/Downloads/Bilanz Tom.xlsx");
}
