import {
  defineCommand,
  UsageError,
  memorySearchPath,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
  type MemorySearchRequest,
  type MemorySearchResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const SEARCH_FLAGS = {
  userId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "User ID (required)", "zh-CN": "用户 ID（必填）" },
    required: true,
  },
  query: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Search query text", "zh-CN": "搜索查询文本" },
  },
  messages: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": "Messages JSON array for context-based search",
      "zh-CN": "用于上下文搜索的消息 JSON 数组",
    },
  },
  topK: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Number of results to return (default: 10)",
      "zh-CN": "返回结果数量（默认：10）",
    },
  },
  memoryLibraryId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Memory library ID", "zh-CN": "记忆库 ID" },
  },
} satisfies FlagsDef;
type SearchFlags = ParsedFlags<typeof SEARCH_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Search memory nodes by query or messages",
    "zh-CN": "通过查询文本或消息搜索记忆节点",
  },
  auth: "apiKey",
  usageArgs: "--user-id <id> [--query <text>] [flags]",
  flags: SEARCH_FLAGS,
  exampleArgs: [
    {
      "en-US": '--user-id user1 --query "programming preferences"',
      "zh-CN": '--user-id user1 --query "编程偏好"',
    },
    {
      "en-US":
        '--user-id user1 --messages \'[{"role":"user","content":"recommend a book"}]\' --top-k 5',
      "zh-CN": '--user-id user1 --messages \'[{"role":"user","content":"推荐一本书"}]\' --top-k 5',
    },
  ],
  validate: (f: SearchFlags) =>
    !f.query && !f.messages ? "Provide --query or --messages." : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const userId = flags.userId;

    const body: MemorySearchRequest = { user_id: userId };

    if (flags.query) body.query = flags.query;

    if (flags.messages) {
      try {
        body.messages = JSON.parse(flags.messages);
      } catch {
        throw new UsageError("--messages must be valid JSON array");
      }
    }

    // API requires messages; if only query is given, wrap it as a user message
    if (!body.messages && body.query) {
      body.messages = [{ role: "user", content: body.query }];
    }

    if (flags.topK !== undefined) body.top_k = flags.topK;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(memorySearchPath()), request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemorySearchResponse>({
      path: memorySearchPath(),
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
