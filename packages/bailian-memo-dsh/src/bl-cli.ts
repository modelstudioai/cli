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
    const parsed = JSON.parse(text) as {
      api_key?: string;
      apiKey?: string;
      workspace_id?: string;
      workspaceId?: string;
      active_config?: string;
      configs?: Record<string, { api_key?: string; workspace_id?: string }>;
    };
    const activeName = parsed.active_config;
    const active = activeName && parsed.configs ? parsed.configs[activeName] : undefined;
    const apiKey = active?.api_key ?? parsed.api_key ?? parsed.apiKey;
    const workspaceId = active?.workspace_id ?? parsed.workspace_id ?? parsed.workspaceId;
    return {
      ...(typeof apiKey === "string" && apiKey.length > 0 ? { apiKey } : {}),
      ...(typeof workspaceId === "string" && workspaceId.length > 0 ? { workspaceId } : {}),
    };
  } catch {
    return {};
  }
}
