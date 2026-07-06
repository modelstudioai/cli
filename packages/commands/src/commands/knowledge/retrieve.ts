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
    description: "Knowledge base index ID (required)",
    required: true,
  },
  query: {
    type: "string",
    valueHint: "<text>",
    description: "Search query (required)",
    required: true,
  },
  denseSimilarityTopK: {
    type: "number",
    valueHint: "<n>",
    description: "Dense retrieval top K",
  },
  sparseSimilarityTopK: {
    type: "number",
    valueHint: "<n>",
    description: "Sparse retrieval top K",
  },
  rerank: { type: "switch", description: "Enable reranking" },
  rerankTopN: { type: "number", valueHint: "<n>", description: "Rerank top N results" },
  rerankModel: {
    type: "string",
    valueHint: "<name>",
    description: "Rerank model, e.g. qwen3-rerank-hybrid",
  },
  rerankMode: {
    type: "string",
    valueHint: "<mode>",
    description: "Rerank mode: qa, similar, or custom",
  },
  rerankInstruct: {
    type: "string",
    valueHint: "<text>",
    description: "Custom rerank instruction, when mode=custom",
  },
  topK: {
    type: "number",
    valueHint: "<n>",
    description: "Number of results (deprecated, use --rerank-top-n)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Retrieve from a Bailian knowledge base",
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
