/**
 * Best-effort read of ~/.bailian/config.json for one-time credential/workspace seed.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BlCliConfigSeed {
  apiKey?: string;
  workspaceId?: string;
}

export function readBlCliConfig(home: string = homedir()): BlCliConfigSeed {
  try {
    const text = readFileSync(join(home, ".bailian", "config.json"), "utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const activeName = parsed.active_config;
    const selected =
      typeof activeName === "string" && activeName !== "" && activeName !== "default"
        ? parsed[activeName]
        : parsed;
    if (!selected || typeof selected !== "object") return {};
    const active = selected as Record<string, unknown>;
    const apiKey = active.api_key ?? active.apiKey;
    const workspaceId = active.workspace_id ?? active.workspaceId;
    return {
      ...(typeof apiKey === "string" && apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
      ...(typeof workspaceId === "string" && workspaceId.trim().length > 0
        ? { workspaceId: workspaceId.trim() }
        : {}),
    };
  } catch {
    return {};
  }
}
