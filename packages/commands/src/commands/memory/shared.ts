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
  libraryId: {
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

/** Extraction scene for profile schema creation and updates. */
export const EXTRACT_SCENE_FLAG = {
  extractScene: {
    type: "string",
    valueHint: "<scene>",
    choices: ["efficient", "intelligent"] as const,
    description: {
      "en-US": "Extraction scene: efficient or intelligent (creation default: efficient)",
      "zh-CN": "抽取场景：efficient 或 intelligent（创建时默认 efficient）",
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

/**
 * Repeatable rule scope. Search and message extraction use project_ids;
 * custom content binds one project using singular project_id.
 */
export const PROJECT_IDS_FLAG = {
  projectId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US":
        "Memory fragment rule ID (repeatable for messages/search; custom content accepts one)",
      "zh-CN": "记忆片段规则 ID（消息抽取/搜索可重复；自定义内容仅支持一个）",
    },
  },
} satisfies FlagsDef;

/**
 * Skill metadata triple. The server requires all three on skill nodes; the CLI
 * enforces all-or-nothing locally so `--dry-run` already rejects partial input.
 */
export const SKILL_METADATA_FLAGS = {
  skillName: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Skill name (skill memory; requires --skill-description and --skill-tags)",
      "zh-CN": "技能名称（skill 记忆；需与 --skill-description、--skill-tags 同时传）",
    },
  },
  skillDescription: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Skill description (skill memory; requires --skill-name and --skill-tags)",
      "zh-CN": "技能描述（skill 记忆；需与 --skill-name、--skill-tags 同时传）",
    },
  },
  skillTags: {
    type: "array",
    valueHint: "<tag>",
    description: {
      "en-US": "Skill tag (repeatable; requires --skill-name and --skill-description)",
      "zh-CN": "技能标签（可重复；需与 --skill-name、--skill-description 同时传）",
    },
  },
} satisfies FlagsDef;

/** All-or-nothing guard for the skill metadata triple. */
export function checkSkillMetadataFlags(flags: {
  skillName?: string;
  skillDescription?: string;
  skillTags?: string[];
}): string | undefined {
  const providedCount = [flags.skillName, flags.skillDescription, flags.skillTags].filter(
    (value) => value !== undefined,
  ).length;
  if (providedCount > 0 && providedCount < 3) {
    return "--skill-name, --skill-description and --skill-tags must be provided together.";
  }
  return undefined;
}

// ---- Documented field limits (long-term memory API reference) ----

/** Max characters accepted for user_id. */
export const MAX_USER_ID_LENGTH = 64;
/** Max characters accepted for memory_library_id. */
export const MAX_MEMORY_LIBRARY_ID_LENGTH = 32;
/** Max characters accepted for custom_content. */
export const MAX_CUSTOM_CONTENT_LENGTH = 512;
/** Max characters accepted for a profile schema name. */
export const MAX_SCHEMA_NAME_LENGTH = 32;
/** Max characters accepted for a profile attribute name. */
export const MAX_ATTRIBUTE_NAME_LENGTH = 32;
/** Max characters accepted for a profile attribute description. */
export const MAX_ATTRIBUTE_DESCRIPTION_LENGTH = 128;
/** Max characters accepted for a profile attribute default value. */
export const MAX_ATTRIBUTE_DEFAULT_VALUE_LENGTH = 128;

/**
 * Length guard for the scope flags every memory command carries, so `--dry-run`
 * already rejects input the API would reject.
 */
export function checkMemoryScopeLengths(flags: {
  userId?: string;
  libraryId?: string;
}): string | undefined {
  if (flags.userId !== undefined && flags.userId.length > MAX_USER_ID_LENGTH) {
    return `--user-id must be at most ${MAX_USER_ID_LENGTH} characters.`;
  }
  if (flags.libraryId !== undefined && flags.libraryId.length > MAX_MEMORY_LIBRARY_ID_LENGTH) {
    return `--library-id must be at most ${MAX_MEMORY_LIBRARY_ID_LENGTH} characters. / --library-id 最多 ${MAX_MEMORY_LIBRARY_ID_LENGTH} 个字符。`;
  }
  return undefined;
}

/** Schema names have a fixed limit; description limits are server-configured. */
export function checkProfileSchemaTextLengths(flags: {
  name?: string;
  description?: string;
}): string | undefined {
  if (flags.name !== undefined && flags.name.length > MAX_SCHEMA_NAME_LENGTH) {
    return `--name must be at most ${MAX_SCHEMA_NAME_LENGTH} characters.`;
  }
  return undefined;
}

/**
 * Length guard for one attribute payload, shared by `profile create` attributes
 * and `profile update` attribute operations. Throws because it runs after the
 * JSON flag is parsed.
 */
export function assertAttributeFieldLengths(
  position: string,
  attribute: { name?: string; description?: string; default_value?: string | null },
): void {
  if (attribute.name !== undefined && attribute.name.length > MAX_ATTRIBUTE_NAME_LENGTH) {
    throw new UsageError(
      `${position}.name must be at most ${MAX_ATTRIBUTE_NAME_LENGTH} characters`,
    );
  }
  if (
    attribute.description !== undefined &&
    attribute.description.length > MAX_ATTRIBUTE_DESCRIPTION_LENGTH
  ) {
    throw new UsageError(
      `${position}.description must be at most ${MAX_ATTRIBUTE_DESCRIPTION_LENGTH} characters`,
    );
  }
  if (
    attribute.default_value !== undefined &&
    attribute.default_value !== null &&
    attribute.default_value.length > MAX_ATTRIBUTE_DEFAULT_VALUE_LENGTH
  ) {
    throw new UsageError(
      `${position}.default_value must be at most ${MAX_ATTRIBUTE_DEFAULT_VALUE_LENGTH} characters`,
    );
  }
}

/** Shared help note: the documented account-level QPM ceilings for the memory API. */
export const MEMORY_RATE_LIMIT_NOTE = {
  "en-US":
    "Account-level rate limits: add 120 QPM, search 300 QPM, 3000 QPM across all memory APIs. On HTTP 429 back off and leave at least 1s between calls.",
  "zh-CN":
    "账号级限流：add 120 QPM、search 300 QPM，记忆库全部接口合计 3000 QPM。遇到 HTTP 429 请降速，两次请求间隔建议至少 1 秒。",
};

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
