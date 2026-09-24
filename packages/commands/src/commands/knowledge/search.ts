import { readFileSync } from "node:fs";
import { firstNonEmptyText, mediaSummary } from "./media-output.ts";
import {
  BailianError,
  ExitCode,
  defineCommand,
  knowledgeSearchEndpoint,
  detectOutputFormat,
  type FlagsDef,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const SEARCH_FLAGS = {
  kbSearchConfigsFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "JSON array of knowledge IDs and online search_filters",
      "zh-CN": "知识库 ID 与在线 search_filters 的 JSON 数组文件",
    },
  },
  query: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Search text (or provide --image)",
      "zh-CN": "搜索文本（或提供 --image）",
    },
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
  // Knowledge APIs use a workspace-specific host, so --workspace-id is a per-command
  // flag here (the console credential scope does not apply).
  ...WORKSPACE_FLAG,
  // Named to avoid the runtime-reserved global --version flag
  agentVersion: {
    type: "string",
    valueHint: "<version>",
    description: {
      "en-US":
        "Service version to call: beta (draft for debugging) or a published number; default is the latest published version",
      "zh-CN": "要调用的服务版本：beta（用于调试的草稿）或已发布版本号；默认使用最新发布版本",
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
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Search a Bailian knowledge base (RAG semantic retrieval)",
    "zh-CN": "搜索百炼知识库（RAG 语义检索）",
  },
  auth: "apiKey",
  usageArgs: "--agent-id <id> (--query <text> | --image <url>) [flags]",
  flags: SEARCH_FLAGS,
  notes: [
    {
      "en-US":
        "Retrieval scope and strategy (multi-index weighting, routing, reranking, etc.) are driven by the agent_id service config. Provide agent_id and at least one query or image.",
      "zh-CN":
        "检索范围与策略（多索引权重、路由、重排序等）由 agent_id 服务配置决定。必须提供 agent_id，以及 query 或 image。",
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
      "en-US": "`--agent-version beta` calls the draft config for debugging before it is deployed.",
      "zh-CN": "`--agent-version beta` 会调用尚未部署的草稿配置，便于发布前调试。",
    },
  ],
  exampleArgs: [
    {
      "en-US": '--query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx',
      "zh-CN": '--query "什么是 RAG？" --agent-id aid-xxx --workspace-id ws-xxx',
    },
    {
      "en-US":
        '--api-key $DASHSCOPE_API_KEY --query "test search" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg',
      "zh-CN":
        '--api-key $DASHSCOPE_API_KEY --query "测试搜索" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg',
    },
  ],
  validate(flags) {
    if (!flags.query?.trim() && !flags.image?.some((url) => url.trim()))
      return { "en-US": "Provide --query or --image.", "zh-CN": "请提供 --query 或 --image。" };
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const workspaceId = resolveWorkspaceId(ctx);

    const format = detectOutputFormat(settings.output);

    const body: KnowledgeSearchRequest = {
      query: flags.query ?? "",
      agent_id: flags.agentId,
    };

    // Omitted flag → field not sent (default behavior unchanged: latest published
    // version); the value is not validated — the set of versions is server-side state
    if (flags.agentVersion) {
      body.agent_version = flags.agentVersion;
    }

    if (flags.image && flags.image.length > 0) {
      body.images = flags.image;
    }

    if (flags.kbSearchConfigsFile !== undefined) {
      const raw = readFileSync(flags.kbSearchConfigsFile, "utf8");
      let configs: unknown;
      try {
        configs = JSON.parse(raw);
      } catch {
        throw new BailianError(
          ctx.localize({
            "en-US": "Search configuration must contain valid JSON.",
            "zh-CN": "检索配置文件必须包含合法 JSON。",
          }),
          ExitCode.USAGE,
        );
      }
      const ids = new Set<string>();
      if (
        !Array.isArray(configs) ||
        configs.some((entry: unknown) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
          const record = entry as Record<string, unknown>;
          if (typeof record.id !== "string" || !record.id.trim() || ids.has(record.id)) return true;
          ids.add(record.id);
          return (
            Object.keys(record).some((key) => key !== "id" && key !== "search_filters") ||
            (record.search_filters !== undefined && !Array.isArray(record.search_filters))
          );
        })
      ) {
        throw new BailianError(
          ctx.localize({
            "en-US":
              "Online search configuration must be an array with unique nonempty id values and optional search_filters arrays; offline strategy fields are not accepted.",
            "zh-CN":
              "在线检索配置必须是数组，各项包含唯一且非空的 id，可选 search_filters 数组；不接受离线策略字段。",
          }),
          ExitCode.USAGE,
        );
      }
      body.kb_search_configs = configs as NonNullable<KnowledgeSearchRequest["kb_search_configs"]>;
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
        for (const [nodeIndex, node] of nodes.entries()) {
          emitBare(`[${nodeIndex + 1}] (score: ${node.score.toFixed(4)})`);
          emitBare(
            firstNonEmptyText(node.text, node.metadata?.content, node.metadata?.clip_description),
          );
          for (const line of mediaSummary(node.metadata ?? {})) emitBare(line);
          emitBare("");
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
