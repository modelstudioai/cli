import {
  defineCommand,
  knowledgeSearchEndpoint,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const SEARCH_FLAGS = {
  query: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Search query text (required, cannot be empty)",
      "zh-CN": "搜索查询文本（必填且不能为空）",
    },
    required: true,
  },
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Retrieval service ID (find in console knowledge retrieval page)",
      "zh-CN": "检索服务 ID（可在控制台知识库检索页面查看）",
    },
    required: true,
  },
  // 知识库走 workspace 专属域名,--workspace-id 属命令自有 flag(console 凭证域不适用)。
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)",
      "zh-CN": "API Endpoint URL 使用的 Workspace ID（也可设置 BAILIAN_WORKSPACE_ID）",
    },
  },
  image: {
    type: "array",
    valueHint: "<url>",
    description: {
      "en-US": "Image URL for multimodal retrieval (repeatable)",
      "zh-CN": "多模态检索使用的图片 URL（可重复）",
    },
  },
  queryHistory: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US":
        'User conversation history JSON for context understanding and query rewriting. Format: \'[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is..."}]\'',
      "zh-CN":
        '用于上下文理解和查询改写的用户对话历史 JSON。格式：\'[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is..."}]\'',
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Search a Bailian knowledge base (RAG semantic retrieval)",
    "zh-CN": "搜索百炼知识库（RAG 语义检索）",
  },
  auth: "apiKey",
  usageArgs: "--query <text> --agent-id <id> [flags]",
  flags: SEARCH_FLAGS,
  notes: [
    {
      "en-US":
        "Retrieval scope and strategy (multi-index weighting, routing, reranking, etc.) are driven by the agent_id service config. Only query and agent_id are required.",
      "zh-CN":
        "检索范围与策略（多索引权重、路由、重排序等）由 agent_id 服务配置决定。仅 query 和 agent_id 必填。",
    },
    {
      "en-US":
        "Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.",
      "zh-CN": "鉴权：使用 DashScope API Key（Bearer Token）。可在控制台 API Key 页面获取。",
    },
    {
      "en-US":
        "`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.",
      "zh-CN":
        "`--workspace-id` 可通过 BAILIAN_WORKSPACE_ID 环境变量或 `kscli config set workspace_id <id>` 设置。",
    },
    {
      "en-US":
        "`--query-history` passes prior conversation turns; the server rewrites the query based on context to improve retrieval relevance.",
      "zh-CN": "`--query-history` 用于传入历史对话；服务端会根据上下文改写查询，以提高检索相关性。",
    },
  ],
  exampleArgs: [
    '--query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx',
    '--api-key $DASHSCOPE_API_KEY --query "test search" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg',
    '--query "How does it work" --agent-id aid-xxx --workspace-id ws-xxx --query-history \'[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is retrieval-augmented generation"}]\'',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const workspaceId = flags.workspaceId || settings.workspaceId;
    if (!workspaceId) {
      throw new BailianError(
        "Workspace ID is required.",
        ExitCode.USAGE,
        `Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: ${ctx.identity.binName} config set workspace_id <id>`,
      );
    }

    const format = detectOutputFormat(settings.output);

    const body: KnowledgeSearchRequest = {
      query: flags.query,
      agent_id: flags.agentId,
    };

    if (flags.image && flags.image.length > 0) {
      body.images = flags.image;
    }

    // Parse query_history JSON for multi-turn context
    if (flags.queryHistory) {
      try {
        body.query_history = JSON.parse(flags.queryHistory) as Array<{
          role: "user" | "assistant";
          content: string;
        }>;
      } catch {
        throw new BailianError(
          '--query-history must be valid JSON. Example: --query-history \'[{"role":"user","content":"What is RAG"}]\'',
          ExitCode.USAGE,
        );
      }
    }

    const url = knowledgeSearchEndpoint(workspaceId);

    if (settings.dryRun) {
      emitResult({ endpoint: url, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<KnowledgeSearchResponse>({
      path: url,
      method: "POST",
      body,
    });

    const nodes = response.data?.nodes || [];
    if (settings.quiet || format === "text") {
      if (nodes.length === 0) {
        emitBare("No results found.");
      } else {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]!;
          emitBare(`[${i + 1}] (score: ${node.score.toFixed(4)})`);
          emitBare(node.text);
          emitBare("");
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
