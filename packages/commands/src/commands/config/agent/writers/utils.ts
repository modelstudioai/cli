import { dirname } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync } from "fs";

/** Parameters shared by every agent writer. */
export interface WriteParams {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** What a writer reports back after configuring an agent. */
export interface WriteSummary {
  paths: string[];
  nextStep: string;
  /** Non-fatal issues the command should surface to the user. */
  warnings?: string[];
}

/** An agent configuration writer: a human label plus a `write` that applies it. */
export interface AgentDef {
  label: string;
  write(params: WriteParams): WriteSummary;
}

/** Read a JSON object file, returning `{}` when missing or unparseable. */
export function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Atomically write `data` as pretty JSON with owner-only permissions. */
export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

/** Atomically write raw text with owner-only permissions. */
export function writeTextAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, path);
}

/** Copy an existing file to a timestamped `.bak.<epoch>` sibling. No-op if absent. */
export function backup(path: string): void {
  if (!existsSync(path)) return;
  const timestamp = Math.floor(Date.now() / 1000);
  copyFileSync(path, `${path}.bak.${timestamp}`);
}

/** Whether a base URL targets the Anthropic-messages compatible endpoint. */
export function isAnthropicEndpoint(baseUrl: string): boolean {
  return baseUrl.includes("/apps/anthropic");
}
