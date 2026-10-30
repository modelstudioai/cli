/**
 * Complete personal-memory enable / resume initialization against Memory API.
 */

import type { MemoryClient } from "./memory-client.js";
import {
  beginEnable,
  markActive,
  markInitializingError,
  personalMemoryConfigPath,
  readPersonalMemoryConfig,
  resumePersonalMemory,
  type PersonalMemoryConfig,
} from "./personal-config.js";

export async function ensureInitialized(
  client: MemoryClient,
  options: { workspaceId?: string; consent?: boolean } = {},
): Promise<PersonalMemoryConfig> {
  let config = await readPersonalMemoryConfig();

  if (config.status === "paused") {
    return config;
  }

  if (config.status === "unconfigured") {
    if (!options.consent || !options.workspaceId) {
      return config;
    }
    config = await beginEnable({ workspaceId: options.workspaceId });
  }

  if (config.status === "initializing") {
    try {
      if (!config.user_id || !config.workspace_id) {
        throw new Error("missing user_id or workspace_id");
      }
      // Read-only connectivity check.
      await client.list({ userId: config.user_id, pageSize: 1 });

      config = await markActive();
    } catch (error) {
      const message = error instanceof Error ? error.message : "initialize failed";
      config = await markInitializingError(message);
    }
  }

  return config;
}

export async function resumeAndEnsure(client: MemoryClient): Promise<PersonalMemoryConfig> {
  await resumePersonalMemory();
  return ensureInitialized(client);
}

export { personalMemoryConfigPath };
