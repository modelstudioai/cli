/**
 * Cross-profile personal-memory identity / consent state machine.
 * File: ~/.bailian/personal-memory/config.json (shared with bailian-memory skill).
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PERSONAL_MEMORY_SCHEMA_VERSION = 3;
export const CONSENT_VERSION = 1;

export type PersonalMemoryStatus = "unconfigured" | "initializing" | "active" | "paused";

export interface PersonalMemoryConfig {
  schema_version: number;
  status: PersonalMemoryStatus;
  workspace_id: string | null;
  user_id: string | null;
  library_mode: "default";
  project_mode: "default";
  consent_version: number;
  consented_at: string | null;
  sensitive_memory_policy: "explicit_only";
  last_error?: string | null;
}

/** Legacy v1 shape (enabled flag instead of status). */
interface LegacyPersonalMemoryConfig {
  schema_version?: number;
  enabled?: boolean;
  workspace_id?: string;
  user_id?: string;
  library_mode?: string;
  project_mode?: string;
  profile_schema_id?: string | null;
  profile_schema_version?: number;
  consent_version?: number;
  consented_at?: string;
  sensitive_memory_policy?: string;
}

export function personalMemoryConfigPath(home: string = homedir()): string {
  return join(home, ".bailian", "personal-memory", "config.json");
}

export function emptyPersonalMemoryConfig(): PersonalMemoryConfig {
  return {
    schema_version: PERSONAL_MEMORY_SCHEMA_VERSION,
    status: "unconfigured",
    workspace_id: null,
    user_id: null,
    library_mode: "default",
    project_mode: "default",
    consent_version: CONSENT_VERSION,
    consented_at: null,
    sensitive_memory_policy: "explicit_only",
    last_error: null,
  };
}

export function migrateLegacyConfig(raw: LegacyPersonalMemoryConfig): PersonalMemoryConfig {
  const base = emptyPersonalMemoryConfig();
  const version = raw.schema_version ?? 1;
  if (
    (version === 2 || version === 3) &&
    typeof (raw as PersonalMemoryConfig).status === "string"
  ) {
    const identity = { ...raw };
    delete identity.profile_schema_id;
    delete identity.profile_schema_version;
    return {
      ...base,
      ...(identity as PersonalMemoryConfig),
      schema_version: PERSONAL_MEMORY_SCHEMA_VERSION,
      library_mode: "default",
      project_mode: "default",
      sensitive_memory_policy: "explicit_only",
    };
  }

  const hasIdentity =
    typeof raw.user_id === "string" &&
    raw.user_id.length > 0 &&
    typeof raw.workspace_id === "string" &&
    raw.workspace_id.length > 0;

  let status: PersonalMemoryStatus = "unconfigured";
  if (raw.enabled === true && hasIdentity) {
    status = "active";
  } else if (raw.enabled === false && hasIdentity) {
    // Ambiguous: paused vs unfinished init — keep automatic ops off.
    status = "paused";
  }

  return {
    ...base,
    status,
    workspace_id: raw.workspace_id ?? null,
    user_id: raw.user_id ?? null,
    consent_version: raw.consent_version ?? CONSENT_VERSION,
    consented_at: raw.consented_at ?? null,
  };
}

export function parsePersonalMemoryConfig(text: string): PersonalMemoryConfig {
  const parsed = JSON.parse(text) as LegacyPersonalMemoryConfig;
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("personal-memory config is not an object");
  }
  const migrated = migrateLegacyConfig(parsed);
  if (migrated.status === "active" && (!migrated.user_id || !migrated.workspace_id)) {
    throw new Error("personal-memory config marked active but missing required identity fields");
  }
  return migrated;
}

/** Atomic write: temp file in same directory then rename. */
export async function writePersonalMemoryConfig(
  config: PersonalMemoryConfig,
  path: string = personalMemoryConfigPath(),
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const payload = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(tempPath, payload, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, path);
}

export async function readPersonalMemoryConfig(
  path: string = personalMemoryConfigPath(),
): Promise<PersonalMemoryConfig> {
  try {
    const text = await readFile(path, "utf8");
    return parsePersonalMemoryConfig(text);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyPersonalMemoryConfig();
    throw error;
  }
}

export interface BeginEnableInput {
  workspaceId: string;
  consentedAt?: string;
}

/**
 * Start enable flow: persist identity first so a later failure does not mint a new user_id.
 */
export async function beginEnable(
  input: BeginEnableInput,
  path: string = personalMemoryConfigPath(),
): Promise<PersonalMemoryConfig> {
  const current = await readPersonalMemoryConfig(path);
  assertWorkspaceBinding(input.workspaceId, current.workspace_id);
  const userId = current.user_id ?? randomUUID();
  const next: PersonalMemoryConfig = {
    ...current,
    schema_version: PERSONAL_MEMORY_SCHEMA_VERSION,
    status: "initializing",
    workspace_id: input.workspaceId,
    user_id: userId,
    consent_version: CONSENT_VERSION,
    consented_at: input.consentedAt ?? new Date().toISOString(),
    sensitive_memory_policy: "explicit_only",
    library_mode: "default",
    project_mode: "default",
    last_error: null,
  };
  await writePersonalMemoryConfig(next, path);
  return next;
}

export async function markActive(
  path: string = personalMemoryConfigPath(),
): Promise<PersonalMemoryConfig> {
  const current = await readPersonalMemoryConfig(path);
  const next: PersonalMemoryConfig = {
    ...current,
    status: "active",
    last_error: null,
  };
  await writePersonalMemoryConfig(next, path);
  return next;
}

export async function markPaused(
  reason?: string,
  path: string = personalMemoryConfigPath(),
): Promise<PersonalMemoryConfig> {
  const current = await readPersonalMemoryConfig(path);
  const next: PersonalMemoryConfig = {
    ...current,
    status: "paused",
    last_error: reason ?? current.last_error ?? null,
  };
  await writePersonalMemoryConfig(next, path);
  return next;
}

export async function markInitializingError(
  message: string,
  path: string = personalMemoryConfigPath(),
): Promise<PersonalMemoryConfig> {
  const current = await readPersonalMemoryConfig(path);
  const next: PersonalMemoryConfig = {
    ...current,
    status: "initializing",
    last_error: message,
  };
  await writePersonalMemoryConfig(next, path);
  return next;
}

/** Resume: active when complete, otherwise continue initializing. */
export async function resumePersonalMemory(
  path: string = personalMemoryConfigPath(),
): Promise<PersonalMemoryConfig> {
  const current = await readPersonalMemoryConfig(path);
  if (current.status !== "paused" && current.status !== "initializing") {
    return current;
  }
  const complete =
    Boolean(current.user_id) && Boolean(current.workspace_id) && Boolean(current.consented_at);
  const next: PersonalMemoryConfig = {
    ...current,
    status: complete ? "active" : "initializing",
    last_error: null,
  };
  await writePersonalMemoryConfig(next, path);
  return next;
}

export function isAutomaticOpsAllowed(config: PersonalMemoryConfig): boolean {
  return config.status === "active" && Boolean(config.user_id) && Boolean(config.workspace_id);
}

/** The identity binding must never move implicitly with connection settings. */
export function assertWorkspaceBinding(workspaceId: string, boundWorkspace: string | null): void {
  if (boundWorkspace && boundWorkspace !== workspaceId) {
    throw new Error(
      "Workspace mismatch: restore the dsh Workspace to the personal identity binding. / Workspace 不匹配：请将 dsh Workspace 恢复为个人身份绑定的工作空间。",
    );
  }
}

export function resolveMemoryWorkspace(
  workspaceId: string | undefined,
  boundWorkspace: string | null,
): string {
  const normalized = workspaceId?.trim();
  if (!normalized)
    throw new Error(
      "Workspace is not configured in dsh settings. / 请在 dsh 设置中配置 Workspace。",
    );
  assertWorkspaceBinding(normalized, boundWorkspace);
  return normalized;
}
