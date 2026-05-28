import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { getConfigPath, ensureConfigDir } from "../config/index.ts";

export function loadApiKeyFromConfig(): string | null {
  const path = getConfigPath();
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.api_key === "string" && data.api_key.length > 0) {
      return data.api_key;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveApiKeyToConfig(apiKey: string): Promise<void> {
  await ensureConfigDir();
  const path = getConfigPath();
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    /* ignore */
  }
  existing.api_key = apiKey;
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(existing, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

export async function clearApiKey(): Promise<void> {
  const path = getConfigPath();
  if (!existsSync(path)) return;
  try {
    const existing = JSON.parse(readFileSync(path, "utf-8"));
    delete existing.api_key;
    delete existing.access_token;
    const tmp = path + ".tmp";
    writeFileSync(tmp, JSON.stringify(existing, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, path);
  } catch {
    /* ignore */
  }
}
