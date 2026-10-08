/**
 * Complete personal-memory enable / resume initialization against Memory API.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MemoryClient, ProfileAttributeDef } from "./memory-client.js";
import {
  beginEnable,
  markActive,
  markInitializingError,
  personalMemoryConfigPath,
  profileSchemaNameForUser,
  readPersonalMemoryConfig,
  resumePersonalMemory,
  type PersonalMemoryConfig,
} from "./personal-config.js";

async function loadProfileAttributes(): Promise<ProfileAttributeDef[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "assets", "profile-attributes.json"),
    join(here, "..", "..", "assets", "profile-attributes.json"),
  ];
  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, "utf8");
      return JSON.parse(text) as ProfileAttributeDef[];
    } catch {
      /* try next */
    }
  }
  throw new Error("profile-attributes.json not found next to the package");
}

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

  if (config.status === "initializing" || !config.profile_schema_id) {
    try {
      if (!config.user_id || !config.workspace_id) {
        throw new Error("missing user_id or workspace_id");
      }
      // Read-only connectivity check.
      await client.list({ userId: config.user_id, pageSize: 1 });

      let schemaId = config.profile_schema_id;
      if (!schemaId) {
        const attributes = await loadProfileAttributes();
        const created = await client.createProfileSchema({
          name: profileSchemaNameForUser(config.user_id),
          description: "个人长期记忆基础资料 v1",
          attributes,
          extractScene: "efficient",
          planVersion: "pro",
        });
        schemaId = created.profile_schema_id ?? created.id ?? null;
        if (!schemaId) throw new Error("profile schema create returned no id");
      } else {
        await client.getProfile({
          schemaId,
          userId: config.user_id,
        });
      }
      config = await markActive(schemaId);
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
