/**
 * Shared fixtures for the memory E2E suite.
 *
 * The memory API has no "list memory libraries" endpoint, so the library ID
 * cannot be discovered from the CLI — it has to be copied from the console
 * (Bailian → 应用 → 记忆 → 记忆库 card) into `BAILIAN_E2E_MEMORY_LIBRARY_ID`.
 * No hardcoded fallback on purpose: a stale ID would make live cases fail with
 * a confusing InvalidParameter instead of skipping via `isMemoryE2EReady()`.
 *
 * The memory API is served on a workspace-specific host, so every case that
 * reaches `run()` — including `--dry-run` — needs a workspace ID.
 */

const DEFAULT_E2E_MEMORY_USER_ID = "e2e-vp-test";

/** Memory entity ID used by every live case; env var wins over the default. */
export function memoryUserId(): string {
  return process.env.BAILIAN_E2E_MEMORY_USER_ID?.trim() || DEFAULT_E2E_MEMORY_USER_ID;
}

/**
 * Fixed workspace for offline cases: it only shapes the endpoint host, so a
 * literal keeps `--dry-run` assertions deterministic on any machine.
 */
export const TEST_WORKSPACE_ARGS = ["--workspace-id", "ws_test"];

/**
 * Scope argv for live cases: memory library + workspace. `isMemoryE2EReady()`
 * guarantees both env vars are set.
 */
export function memoryScopeCliArgs(): string[] {
  const libraryId = process.env.BAILIAN_E2E_MEMORY_LIBRARY_ID?.trim();
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID?.trim();
  return [
    ...(libraryId ? ["--library-id", libraryId] : []),
    ...(workspaceId ? ["--workspace-id", workspaceId] : []),
  ];
}

/**
 * Skill-type project ID for live skill extraction cases. Skill projects can
 * only be created in the console, so `isMemorySkillE2EReady()` gates on this
 * env var and cases skip without it.
 */
export function memorySkillProjectId(): string {
  return process.env.BAILIAN_E2E_MEMORY_SKILL_PROJECT_ID?.trim() ?? "";
}

/** `--dry-run --output json` payload shape shared by the memory commands. */
export interface MemoryDryRunBody {
  endpoint?: string;
  method?: string;
  request?: {
    user_id?: string;
    custom_content?: string;
    messages?: Array<{
      role?: string;
      content?: string;
      tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string } }>;
      tool_call_id?: string;
    }>;
    meta_data?: Record<string, unknown>;
    project_id?: string;
    project_ids?: string[];
    profile_schema?: string;
    memory_library_id?: string;
    timestamp?: number;
    skill_name?: string;
    skill_description?: string;
    skill_tags?: string[];
    memory_types?: string[];
    query_timestamp?: number;
    top_k?: number;
    min_score?: number;
    enable_rerank?: boolean;
    enable_judge?: boolean;
    enable_rewrite?: boolean;
    plan_version?: string;
    query?: string;
    name?: string;
    description?: string;
    attributes?: Array<{ name?: string; description?: string; default_value?: string }>;
    attributes_operations?: Array<{
      op?: string;
      attribute_id?: string;
      name?: string;
      description?: string;
      default_value?: string | null;
    }>;
  };
}

export interface MemoryNodeListBody {
  request_id?: string;
  total?: number;
  memory_nodes?: Array<{
    memory_node_id: string;
    content: string;
    meta_data?: Record<string, unknown>;
    created_at?: number;
    updated_at?: number;
    timestamp?: number;
    project_id?: string;
    memory_type?: string;
    status?: string;
    score?: number;
  }>;
}

/** POST /add-async 提交回执 + 轮询终态后的 json 输出形状。 */
export interface MemoryAddBody {
  request_id?: string;
  event_id?: string;
  events?: Array<{
    event_id?: string;
    event_type?: string;
    resource_id?: string;
    resource_type?: string;
    status?: string;
    result?: Array<{
      memory_type?: string;
      name?: string;
      content?: string;
      event?: string;
      memory_node_id?: string;
      old_content?: string;
    }>;
  }>;
}

/** GET /memory_nodes/{id} 与 GET /skill/export/{id} 共用的响应形状。 */
export interface MemoryNodeDetailBody {
  request_id?: string;
  memory_node?: {
    memory_node_id: string;
    content: string;
    timestamp?: number;
    created_at?: number;
    updated_at?: number;
    media_desc?: string;
    meta_data?: Record<string, unknown>;
    memory_type?: string;
    status?: string;
    project_id?: string;
    media_urls?: string[];
  };
}

export interface ProfileSchemaCreateBody {
  request_id?: string;
  profile_schema_id?: string;
}

export interface ProfileSchemaListBody {
  request_id?: string;
  total?: number;
  profile_schemas?: Array<{ profile_schema_id: string; name: string; description?: string }>;
}

export interface ProfileSchemaDetailBody {
  request_id?: string;
  name?: string;
  description?: string;
  attributes?: Array<{
    attribute_id: string;
    name: string;
    description?: string;
    default_value?: string;
  }>;
}

export interface UserProfileBody {
  request_id?: string;
  profile?: {
    schema_name?: string;
    schema_description?: string;
    attributes?: Array<{
      id: string;
      name: string;
      value?: string;
      value_items?: Array<{
        item_id?: number;
        status?: string;
        value?: string;
      }>;
    }>;
  };
}
