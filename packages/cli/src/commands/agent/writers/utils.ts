import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync } from "fs";

export interface WriteParams {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface WriteSummary {
  paths: string[];
  nextStep: string;
}

export interface AgentDef {
  label: string;
  write(params: WriteParams): WriteSummary;
}

export function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

export function backup(path: string): void {
  if (!existsSync(path)) return;
  const ts = Math.floor(Date.now() / 1000);
  copyFileSync(path, `${path}.bak.${ts}`);
}
