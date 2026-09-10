import { UsageError, type FlagsDef } from "bailian-cli-core";

// The memory API is served on the per-workspace host, so every memory command
// carries the workspace scope (shared with the knowledge commands).
export { resolveWorkspaceId, WORKSPACE_FLAG } from "../shared/workspace.ts";

/** Shared help note: the workspace scope is required because it selects the API host. */
export const MEMORY_WORKSPACE_NOTE = {
  "en-US":
    "The memory API lives on a workspace-specific host, so --workspace-id is required; it can also come from BAILIAN_WORKSPACE_ID or the workspace_id config field.",
  "zh-CN":
    "记忆 API 部署在 workspace 专属域名上，因此 --workspace-id 必填；也可通过 BAILIAN_WORKSPACE_ID 环境变量或 workspace_id 配置项提供。",
};

/**
 * Memory library scope. Every memory API accepts it and falls back to the
 * account's default library, so it stays optional on every command.
 */
export const MEMORY_LIBRARY_FLAG = {
  memoryLibraryId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory library ID (default: the account's default library)",
      "zh-CN": "记忆库 ID（默认：账号的默认记忆库）",
    },
  },
} satisfies FlagsDef;

/** Billing tier shared by search and profile schema creation. */
export const PLAN_VERSION_FLAG = {
  planVersion: {
    type: "string",
    valueHint: "<version>",
    choices: ["pro", "lite"] as const,
    description: {
      "en-US": "Strategy version: pro (rerank on) or lite (rerank off); billed differently",
      "zh-CN": "策略版本：pro（开启 Rerank）或 lite（关闭 Rerank），计费单价不同",
    },
  },
} satisfies FlagsDef;

/** Memory fragment rule scope, repeatable for the search hybrid form. */
export const PROJECT_ID_FLAG = {
  projectId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory fragment rule ID (default: the library's default rule)",
      "zh-CN": "记忆片段规则 ID（默认：记忆库的默认规则）",
    },
  },
} satisfies FlagsDef;

/** Parse a JSON object flag (`--meta-data`), rejecting arrays and primitives. */
export function parseJsonObjectFlag(flagName: string, raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(`${flagName} must be valid JSON`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError(`${flagName} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Parse a JSON array flag (`--messages`, `--attributes`), rejecting objects and primitives. */
export function parseJsonArrayFlag<T>(flagName: string, raw: string): T[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(`${flagName} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new UsageError(`${flagName} must be a JSON array`);
  }
  return parsed as T[];
}
