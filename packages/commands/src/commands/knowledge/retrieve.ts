import {
  defineCommand,
  knowledgeRetrieveEndpoint,
  signRequest,
  requestJson,
  detectOutputFormat,
  maskToken,
  resolveCredential,
  trackingHeaders,
  type Config,
  type Flags,
  type FlagsDef,
  type KnowledgeRetrieveRequest,
  type KnowledgeRetrieveResponse,
  type DashScopeKnowledgeRetrieveRequest,
  type DashScopeKnowledgeRetrieveResponse,
  type OutputFormat,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const BAILIAN_HOST = "bailian.cn-beijing.aliyuncs.com";

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
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: "Bailian workspace ID (only needed for deprecated AK/SK auth)",
  },
  accessKeyId: {
    type: "string",
    valueHint: "<key>",
    description: "Deprecated: use global --api-key instead",
  },
  accessKeySecret: {
    type: "string",
    valueHint: "<key>",
    description: "Deprecated: use global --api-key instead",
  },
} satisfies FlagsDef;
type RetrieveFlags = Flags<typeof RETRIEVE_FLAGS>;

export default defineCommand({
  description: "Retrieve from a Bailian knowledge base",
  auth: "apiKey",
  usageArgs: "--index-id <id> --query <text> [flags]",
  flags: RETRIEVE_FLAGS,
  notes: [
    "Authentication: pass `--api-key <key>`. AK/SK auth is deprecated and will be removed in a future version.",
    "`--workspace-id` is NOT required when using --api-key.",
  ],
  exampleArgs: [
    '--index-id idx_xxx --query "How to use Alibaba Cloud Bailian"',
    '--api-key $DASHSCOPE_API_KEY --index-id idx_xxx --query "RAG retrieval" --rerank --rerank-model qwen3-rerank-hybrid',
  ],
  async run(config, flags) {
    const indexId = flags.indexId;
    const query = flags.query;

    const format = detectOutputFormat(config.output);

    const hasExplicitApiKey = !!config.apiKey;
    const hasExplicitAkSk = !!(flags.accessKeyId && flags.accessKeySecret);

    if (hasExplicitApiKey) {
      await runWithApiKey(config, flags, indexId, query, format);
    } else if (hasExplicitAkSk) {
      await runWithAkSk(config, flags, indexId, query, format);
    } else {
      let useApiKey = false;
      try {
        await resolveCredential(config);
        useApiKey = true;
      } catch {
        // No API-KEY credential available
      }

      if (useApiKey) {
        await runWithApiKey(config, flags, indexId, query, format);
      } else {
        await runWithAkSk(config, flags, indexId, query, format);
      }
    }
  },
});

// ---- API-KEY path (DashScope gateway, snake_case) ----

async function runWithApiKey(
  config: Config,
  flags: RetrieveFlags,
  indexId: string,
  query: string,
  format: OutputFormat,
): Promise<void> {
  if (flags.topK !== undefined && flags.rerankTopN === undefined) {
    process.stderr.write("Warning: --top-k is deprecated. Use --rerank-top-n instead.\n");
    flags.rerankTopN = flags.topK;
  }

  const body: DashScopeKnowledgeRetrieveRequest = {
    index_id: indexId,
    query,
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

  const url = knowledgeRetrieveEndpoint(config.baseUrl);

  if (config.dryRun) {
    emitResult({ endpoint: url, request: body }, format);
    return;
  }

  const response = await requestJson<DashScopeKnowledgeRetrieveResponse>(config, {
    url,
    method: "POST",
    body,
  });

  const nodes = response.data?.nodes || [];
  if (config.quiet || format === "text") {
    emitTextNodes(nodes.map((n) => ({ text: n.text, score: n.score })));
  } else {
    emitResult(response, format);
  }
}

// ---- AK/SK path (Bailian OpenAPI gateway, PascalCase) ----

async function runWithAkSk(
  config: Config,
  flags: RetrieveFlags,
  indexId: string,
  query: string,
  format: OutputFormat,
): Promise<void> {
  const accessKeyId = flags.accessKeyId || config.accessKeyId;
  const accessKeySecret = flags.accessKeySecret || config.accessKeySecret;
  const workspaceId = flags.workspaceId || config.workspaceId;

  if (!accessKeyId || !accessKeySecret) {
    throw new BailianError(
      "No credentials found.\n" +
        "Preferred: set DASHSCOPE_API_KEY or pass --api-key.\n" +
        "Legacy (deprecated): set ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET.",
      ExitCode.AUTH,
    );
  }

  if (!workspaceId) {
    throw new BailianError(
      "Knowledge retrieve requires a workspace ID.\n" +
        `Set via: --workspace-id flag, or env: BAILIAN_WORKSPACE_ID, or config: ${config.binName} config set workspace_id <id>`,
      ExitCode.USAGE,
    );
  }

  process.stderr.write(
    "Warning: AK/SK auth for knowledge retrieve is deprecated. Prefer --api-key or DASHSCOPE_API_KEY.\n",
  );

  const body: KnowledgeRetrieveRequest = {
    IndexId: indexId,
    Query: query,
  };

  if (flags.topK !== undefined && flags.rerankTopN === undefined) {
    process.stderr.write("Warning: --top-k is deprecated. Use --rerank-top-n instead.\n");
    flags.rerankTopN = flags.topK;
  }

  if (flags.rerank) body.EnableReranking = true;
  if (flags.rerankTopN !== undefined) body.RerankTopN = flags.rerankTopN;
  if (flags.denseSimilarityTopK !== undefined) body.DenseSimilarityTopK = flags.denseSimilarityTopK;
  if (flags.sparseSimilarityTopK !== undefined)
    body.SparseSimilarityTopK = flags.sparseSimilarityTopK;

  if (flags.rerankModel) {
    const rerank: { ModelName: string; RerankMode?: string; RerankInstruct?: string } = {
      ModelName: flags.rerankModel,
    };
    if (flags.rerankMode) rerank.RerankMode = flags.rerankMode;
    if (flags.rerankInstruct) rerank.RerankInstruct = flags.rerankInstruct;
    body.Rerank = [rerank];
  }

  const pathname = `/${workspaceId}/index/retrieve`;

  if (config.dryRun) {
    emitResult(
      {
        endpoint: `https://${BAILIAN_HOST}${pathname}`,
        workspaceId,
        request: body,
      },
      format,
    );
    return;
  }

  const bodyStr = JSON.stringify(body);

  const headers = signRequest({
    accessKeyId,
    accessKeySecret,
    action: "Retrieve",
    version: "2023-12-29",
    body: bodyStr,
    host: BAILIAN_HOST,
    pathname,
  });

  const url = `https://${BAILIAN_HOST}${pathname}`;

  if (config.verbose) {
    process.stderr.write(`> POST ${url}\n`);
    process.stderr.write(`> AK: ${maskToken(accessKeyId)}\n`);
  }

  const timeoutMs = config.timeout * 1000;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, ...trackingHeaders() },
    body: bodyStr,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (config.verbose) {
    process.stderr.write(`< ${res.status} ${res.statusText}\n`);
  }

  const data = (await res.json()) as KnowledgeRetrieveResponse & {
    Code?: string;
    Message?: string;
  };

  if (!res.ok || (data.Code && data.Code !== "Success")) {
    throw new BailianError(
      `Knowledge retrieve failed: ${data.Code || res.status} - ${data.Message || res.statusText}`,
      ExitCode.GENERAL,
    );
  }

  const nodes = data.Data?.Nodes || [];
  if (config.quiet || format === "text") {
    emitTextNodes(nodes.map((n) => ({ text: n.Text, score: n.Score })));
  } else {
    emitResult(data, format);
  }
}

// ---- Shared text output ----

function emitTextNodes(nodes: Array<{ text: string; score: number }>): void {
  if (nodes.length === 0) {
    emitBare("No results found.");
  } else {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      emitBare(`[${i + 1}] (score: ${node.score.toFixed(4)})`);
      emitBare(node.text);
      emitBare("");
    }
  }
}
