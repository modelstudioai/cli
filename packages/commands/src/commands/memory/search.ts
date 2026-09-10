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
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  PLAN_VERSION_FLAG,
  WORKSPACE_FLAG,
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
  enableRerank: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Rerank results (default: false); ignored when --plan-version is set",
      "zh-CN": "是否重排序搜索结果（默认：false）；传了 --plan-version 时本参数被忽略",
    },
  },
  enableJudge: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Run the intent judge callback (default: false)",
      "zh-CN": "是否开启意图判别回调（默认：false）",
    },
  },
  enableRewrite: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Rewrite the query before searching (default: false)",
      "zh-CN": "是否开启 query 重写（默认：false）",
    },
  },
  projectId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Memory fragment rule ID (repeatable for hybrid retrieval)",
      "zh-CN": "记忆片段规则 ID（可重复，用于多规则混合检索）",
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
        "--plan-version overrides --enable-rerank and changes the price: pro reranks, lite does not.",
      "zh-CN": "--plan-version 覆盖 --enable-rerank 且影响计费：pro 开启重排，lite 不开启。",
    },
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
  ],
  validate: (flags: SearchFlags) => {
    if (!flags.query && !flags.messages) return "Provide --query or --messages.";
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
    if (flags.enableRerank !== undefined) body.enable_rerank = flags.enableRerank;
    if (flags.enableJudge !== undefined) body.enable_judge = flags.enableJudge;
    if (flags.enableRewrite !== undefined) body.enable_rewrite = flags.enableRewrite;
    if (flags.planVersion) body.plan_version = flags.planVersion as MemoryPlanVersion;
    if (flags.projectId?.length) body.project_ids = flags.projectId;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

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
          emitBare(`[${node.memory_node_id}] ${node.content}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
