import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { MailMessage } from "./types.ts";

function normalizeHeaderValue(value: string): string {
  return value.replace(/\r?\n[ \t]+/g, " ").trim();
}

function parseHeaders(rawHeaders: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = rawHeaders.split(/\r?\n/);
  let currentKey = "";

  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && currentKey) {
      const previous = headers.get(currentKey) ?? "";
      headers.set(currentKey, `${previous}\n${line}`);
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    currentKey = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers.set(currentKey, value);
  }

  return new Map([...headers.entries()].map(([key, value]) => [key, normalizeHeaderValue(value)]));
}

export function extractEmailAddress(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const angleMatch = value.match(/<([^>]+)>/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim().toLowerCase();
  }

  const plainMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plainMatch?.[0]?.trim().toLowerCase() ?? null;
}

function decodeTransferEncoding(body: string, encoding: string | undefined): string {
  const normalizedEncoding = (encoding ?? "").toLowerCase();

  if (normalizedEncoding === "base64") {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }

  if (normalizedEncoding === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  }

  return body;
}

function extractSnippet(rawBody: string): string {
  const compact = rawBody
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return compact.slice(0, 240);
}

export function parseEml(raw: string, sourcePath: string): MailMessage {
  const [rawHeaders = "", ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const rawBody = bodyParts.join("\n\n");
  const headers = parseHeaders(rawHeaders);
  const contentTransferEncoding = headers.get("content-transfer-encoding");
  const decodedBody = decodeTransferEncoding(rawBody, contentTransferEncoding);
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));

  return {
    id: headers.get("message-id")?.replace(/[<>]/g, "") || sourceName,
    receivedAt: headers.get("date") ? new Date(headers.get("date") as string).toISOString() : new Date(0).toISOString(),
    from: extractEmailAddress(headers.get("from")) ?? "unknown@example.invalid",
    subject: headers.get("subject") ?? "(no subject)",
    snippet: extractSnippet(decodedBody),
    sourceType: "eml",
    sourcePath,
  };
}

export async function loadMessagesFromJson(filePath: string): Promise<MailMessage[]> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Expected the input JSON file to contain an array of messages.");
  }

  return parsed.map((entry, index) => ({
    ...(entry as MailMessage),
    sourceType: "json",
    sourcePath: filePath,
    id: (entry as MailMessage).id || `json-message-${index + 1}`,
  }));
}

async function loadMessagesFromDirectory(directoryPath: string): Promise<MailMessage[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const emlPaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".eml"))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const messages: MailMessage[] = [];
  for (const emlPath of emlPaths) {
    const raw = await readFile(emlPath, "utf8");
    messages.push(parseEml(raw, emlPath));
  }

  return messages;
}

export async function loadMessages(inputPath: string): Promise<MailMessage[]> {
  const inputStat = await stat(inputPath);

  if (inputStat.isDirectory()) {
    return loadMessagesFromDirectory(inputPath);
  }

  if (inputPath.toLowerCase().endsWith(".eml")) {
    const raw = await readFile(inputPath, "utf8");
    return [parseEml(raw, inputPath)];
  }

  if (inputPath.toLowerCase().endsWith(".json")) {
    return loadMessagesFromJson(inputPath);
  }

  throw new Error(`Unsupported input path "${inputPath}". Use a .json file, a .eml file, or a directory of .eml files.`);
}
