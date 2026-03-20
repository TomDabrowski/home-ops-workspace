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

function extractBoundary(contentType: string | undefined): string | null {
  if (!contentType) {
    return null;
  }

  const match = contentType.match(/boundary="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function extractMultipartBody(rawBody: string, contentType: string | undefined): string {
  const boundary = extractBoundary(contentType);

  if (!boundary || !contentType?.toLowerCase().includes("multipart/")) {
    return rawBody;
  }

  const parts = rawBody.split(`--${boundary}`);
  const parsedParts = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "--")
    .map((part) => {
      const [rawPartHeaders = "", ...bodyParts] = part.split(/\r?\n\r?\n/);
      const headers = parseHeaders(rawPartHeaders);
      const contentTransferEncoding = headers.get("content-transfer-encoding");
      const decodedBody = decodeTransferEncoding(bodyParts.join("\n\n"), contentTransferEncoding);

      return {
        contentType: headers.get("content-type")?.toLowerCase() ?? "text/plain",
        body: decodedBody,
      };
    });

  const plainPart = parsedParts.find((part) => part.contentType.includes("text/plain"));
  if (plainPart) {
    return plainPart.body;
  }

  const htmlPart = parsedParts.find((part) => part.contentType.includes("text/html"));
  if (htmlPart) {
    return htmlPart.body;
  }

  return rawBody;
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
  const contentType = headers.get("content-type");
  const extractedBody = extractMultipartBody(decodedBody, contentType);
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));

  return {
    id: headers.get("message-id")?.replace(/[<>]/g, "") || sourceName,
    receivedAt: headers.get("date") ? new Date(headers.get("date") as string).toISOString() : new Date(0).toISOString(),
    from: extractEmailAddress(headers.get("from")) ?? "unknown@example.invalid",
    subject: headers.get("subject") ?? "(no subject)",
    snippet: extractSnippet(extractedBody),
    sourceType: "eml",
    sourcePath,
  };
}

export function parseMbox(raw: string, sourcePath: string): MailMessage[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  const chunks = normalized
    .split(/^From .*\n/m)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  return chunks.map((chunk, index) => {
    const message = parseEml(chunk, `${sourcePath}#${index + 1}`);
    return {
      ...message,
      sourceType: "eml",
      sourcePath,
      id: message.id || `${path.basename(sourcePath, path.extname(sourcePath))}-${index + 1}`,
    };
  });
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

  if (inputPath.toLowerCase().endsWith(".mbox")) {
    const raw = await readFile(inputPath, "utf8");
    return parseMbox(raw, inputPath);
  }

  throw new Error(`Unsupported input path "${inputPath}". Use a .json file, a .eml file, a .mbox file, or a directory of .eml files.`);
}
