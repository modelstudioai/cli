import {
  defineCommand,
  memoryEndpoint,
  memorySearchPath,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
  type MemoryMessage,
  type MemoryPlanVersion,
  type MemorySearchRequest,
  type MemorySearchResponse,
  type MemoryType,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_RATE_LIMIT_NOTE,
  MEMORY_WORKSPACE_NOTE,
  PLAN_VERSION_FLAG,
  PROJECT_IDS_FLAG,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  parseJsonArrayFlag,
  resolveWorkspaceId,
} from "./shared.ts";

const SEARCH_FLAGS = {
  userId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory entity ID that owns the memory (required)",
      "zh-CN": "记忆实体 ID，标识记忆归属对象（必填）",
    },
    required: true,
  },
  query: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Search text; sent as a single user message",
      "zh-CN": "搜索文本；作为单条用户消息发送",
    },
  },
  messages: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": "Messages JSON array for context-based search; overrides --query",
      "zh-CN": "用于上下文搜索的消息 JSON 数组；优先于 --query",
    },
  },
  topK: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Max results, 1-100 (default: 10)",
      "zh-CN": "最大召回个数，1~100（默认：10）",
    },
  },
  minScore: {
    type: "number",
    valueHint: "<score>",
    description: {
      "en-US": "Minimum similarity score, 0-1 (default: 0.3)",
      "zh-CN": "最小相似度分数阈值，0~1（默认：0.3）",
    },
  },
  memoryTypes: {
    type: "array",
    valueHint: "<type>",
    choices: ["observation", "skill"] as const,
    description: {
      "en-US": "Memory types to search (repeatable; server default: observation only)",
      "zh-CN": "搜索的记忆类型（可重复；服务端默认仅 observation）",
    },
  },
  memoryType: {
    type: "string",
    valueHint: "<type>",
    choices: ["observation", "skill"] as const,
    description: {
      "en-US": "Deprecated alias for --memory-types; cannot be combined with --memory-types",
      "zh-CN": "已弃用：--memory-types 的别名，不能与 --memory-types 同时传入",
    },
  },

  projectIds: {
    ...PROJECT_IDS_FLAG.projectId,
    description: {
      "en-US": "Memory fragment rule ID (repeatable)",
      "zh-CN": "记忆片段规则 ID（可重复）",
    },
  },
  projectId: {
    ...PROJECT_IDS_FLAG.projectId,
    description: {
      "en-US":
        "Deprecated alias for --project-ids (repeatable); cannot be combined with --project-ids",
      "zh-CN": "已弃用：--project-ids 的别名（可重复），不能与 --project-ids 同时传入",
    },
  },
  ...PLAN_VERSION_FLAG,
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;
type SearchFlags = ParsedFlags<typeof SEARCH_FLAGS>;

const MAX_TOP_K = 100;

export default defineCommand({
  description: {
    "en-US": "Search memory nodes by query or messages",
    "zh-CN": "通过查询文本或消息搜索记忆节点",
  },
  auth: "apiKey",
  usageArgs: "--user-id <id> [--query <text>] [flags]",
  flags: SEARCH_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "Use --plan-version pro or lite to select the search strategy. When omitted, the server defaults to pro. Plans are billed differently.",
      "zh-CN":
        "通过 --plan-version pro 或 lite 选择检索策略；省略时服务端默认使用 pro。不同计划计费不同。",
    },
    {
      "en-US":
        "Without --memory-types the server searches observation memories only; pass --memory-types skill (or both types) to include skill memories.",
      "zh-CN":
        "不传 --memory-types 时服务端仅搜索事实记忆（observation）；传 --memory-types skill（或同时传两种）可搜索技能记忆。",
    },
    MEMORY_RATE_LIMIT_NOTE,
  ],
  exampleArgs: [
    {
      "en-US": '--user-id user1 --query "programming preferences" --workspace-id ws_xxx',
      "zh-CN": '--user-id user1 --query "编程偏好" --workspace-id ws_xxx',
    },
    {
      "en-US":
        '--user-id user1 --messages \'[{"role":"user","content":"recommend a book"}]\' --top-k 5',
      "zh-CN": '--user-id user1 --messages \'[{"role":"user","content":"推荐一本书"}]\' --top-k 5',
    },
    {
      "en-US": '--user-id user1 --query "reminders" --plan-version lite --min-score 0',
      "zh-CN": '--user-id user1 --query "提醒事项" --plan-version lite --min-score 0',
    },
    {
      "en-US":
        '--user-id user1 --query "meeting summary" --memory-types skill --project-ids skill_project_xxx',
      "zh-CN":
        '--user-id user1 --query "会议纪要" --memory-types skill --project-ids skill_project_xxx',
    },
  ],
  validate: (flags: SearchFlags) => {
    if (!flags.query && !flags.messages) return "Provide --query or --messages.";
    if (flags.projectId !== undefined && flags.projectIds !== undefined)
      return "--project-id and --project-ids are mutually exclusive. / --project-id 与 --project-ids 不能同时传入。";
    if (flags.memoryType !== undefined && flags.memoryTypes !== undefined)
      return "--memory-type and --memory-types are mutually exclusive. / --memory-type 与 --memory-types 不能同时传入。";
    const scopeError = checkMemoryScopeLengths(flags);
    if (scopeError) return scopeError;
    if (flags.topK !== undefined && (flags.topK < 1 || flags.topK > MAX_TOP_K))
      return `--top-k must be between 1 and ${MAX_TOP_K}.`;
    if (flags.minScore !== undefined && (flags.minScore < 0 || flags.minScore > 1))
      return "--min-score must be between 0 and 1.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    // The API only accepts `messages`; a bare --query is wrapped as one user turn.
    const messages = flags.messages
      ? parseJsonArrayFlag<MemoryMessage>("--messages", flags.messages)
      : [{ role: "user" as const, content: flags.query! }];

    const body: MemorySearchRequest = { user_id: flags.userId, messages };

    if (flags.topK !== undefined) body.top_k = flags.topK;
    if (flags.minScore !== undefined) body.min_score = flags.minScore;
    if (flags.planVersion) body.plan_version = flags.planVersion as MemoryPlanVersion;
    const projectIds = flags.projectIds ?? flags.projectId;
    const memoryTypes = flags.memoryTypes ?? (flags.memoryType ? [flags.memoryType] : undefined);
    if (projectIds?.length) body.project_ids = projectIds;
    if (memoryTypes?.length) body.memory_types = memoryTypes as MemoryType[];
    if (flags.libraryId) body.memory_library_id = flags.libraryId;

    const format = detectOutputFormat(settings.output);
    const url = memoryEndpoint(resolveWorkspaceId(ctx), memorySearchPath());

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "POST", request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemorySearchResponse>({
      path: url,
      method: "POST",
      body,
    });

    if (settings.quiet || format === "text") {
      if (!response.memory_nodes || response.memory_nodes.length === 0) {
        emitBare("No memory nodes found.");
      } else {
        for (const node of response.memory_nodes) {
          const typePrefix = node.memory_type ? `[${node.memory_type}] ` : "";
          const scoreSuffix = node.score !== undefined ? ` (score ${node.score})` : "";
          emitBare(`${typePrefix}[${node.memory_node_id}] ${node.content}${scoreSuffix}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
