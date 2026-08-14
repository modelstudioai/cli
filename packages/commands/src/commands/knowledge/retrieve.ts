import {
  defineCommand,
  knowledgeRetrievePath,
  detectOutputFormat,
  type FlagsDef,
  type DashScopeKnowledgeRetrieveRequest,
  type DashScopeKnowledgeRetrieveResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const RETRIEVE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Knowledge base index ID (required)",
      "zh-CN": "知识库索引 ID（必填）",
    },
    required: true,
  },
  query: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Search query (required)", "zh-CN": "搜索查询（必填）" },
    required: true,
  },
  denseSimilarityTopK: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Dense retrieval top K", "zh-CN": "稠密检索 Top K" },
  },
  sparseSimilarityTopK: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Sparse retrieval top K", "zh-CN": "稀疏检索 Top K" },
  },
  rerank: { type: "switch", description: { "en-US": "Enable reranking", "zh-CN": "启用重排序" } },
  rerankTopN: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Rerank top N results", "zh-CN": "重排序前 N 个结果" },
  },
  rerankModel: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Rerank model, e.g. qwen3-rerank-hybrid",
      "zh-CN": "重排序模型，例如 qwen3-rerank-hybrid",
    },
  },
  rerankMode: {
    type: "string",
    valueHint: "<mode>",
    description: {
      "en-US": "Rerank mode: qa, similar, or custom",
      "zh-CN": "重排序模式：qa、similar 或 custom",
    },
  },
  rerankInstruct: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Custom rerank instruction, when mode=custom",
      "zh-CN": "自定义重排序指令，仅在 mode=custom 时使用",
    },
  },
  topK: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Number of results (deprecated, use --rerank-top-n)",
      "zh-CN": "结果数量（已废弃，请使用 --rerank-top-n）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Retrieve from a Bailian knowledge base (deprecated, use `search` instead)",
    "zh-CN": "从百炼知识库检索（已废弃，请改用 `search`）",
  },
  auth: "apiKey",
  usageArgs: "--index-id <id> --query <text> [flags]",
  flags: RETRIEVE_FLAGS,
  exampleArgs: [
    '--index-id idx_xxx --query "How to use Alibaba Cloud Bailian"',
    '--index-id idx_xxx --query "RAG retrieval" --rerank --rerank-model qwen3-rerank-hybrid',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    if (flags.topK !== undefined && flags.rerankTopN === undefined) {
      process.stderr.write("Warning: --top-k is deprecated. Use --rerank-top-n instead.\n");
      flags.rerankTopN = flags.topK;
    }

    const body: DashScopeKnowledgeRetrieveRequest = {
      index_id: flags.indexId,
      query: flags.query,
      search_filters: [],
    };

    if (flags.denseSimilarityTopK !== undefined)
      body.dense_similarity_top_k = flags.denseSimilarityTopK;
    if (flags.sparseSimilarityTopK !== undefined)
      body.sparse_similarity_top_k = flags.sparseSimilarityTopK;
    if (flags.rerank) body.enable_reranking = true;
    if (flags.rerankTopN !== undefined) body.rerank_top_n = flags.rerankTopN;

    if (flags.rerankModel) {
      const rerankEntry: { model_name: string; rerank_mode?: string; rerank_instruct?: string } = {
        model_name: flags.rerankModel,
      };
      if (flags.rerankMode) rerankEntry.rerank_mode = flags.rerankMode;
      if (flags.rerankInstruct) rerankEntry.rerank_instruct = flags.rerankInstruct;
      body.rerank = [rerankEntry];
    }

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(knowledgeRetrievePath()), request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<DashScopeKnowledgeRetrieveResponse>({
      path: knowledgeRetrievePath(),
      method: "POST",
      body,
    });

    const nodes = response.data?.nodes || [];
    if (settings.quiet || format === "text") {
      emitTextNodes(nodes.map((n) => ({ text: n.text, score: n.score })));
    } else {
      emitResult(response, format);
    }
  },
});

function emitTextNodes(nodes: Array<{ text: string; score: number }>): void {
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
}
