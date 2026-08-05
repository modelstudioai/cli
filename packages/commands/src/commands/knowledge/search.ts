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
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const SEARCH_FLAGS = {
  query: {
    type: "string",
    valueHint: "<text>",
    description: "Search query text (required, cannot be empty)",
    required: true,
  },
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: "Retrieval service ID (find in console knowledge retrieval page)",
    required: true,
  },
  // Knowledge APIs use a workspace-specific host, so --workspace-id is a per-command
  // flag here (the console credential scope does not apply).
  ...WORKSPACE_FLAG,
  // Named to avoid the runtime-reserved global --version flag
  agentVersion: {
    type: "string",
    valueHint: "<version>",
    description:
      "Service version to call: beta (draft for debugging) or a published number; default is the latest published version",
  },
  image: {
    type: "array",
    valueHint: "<url>",
    description: "Image URL for multimodal retrieval (repeatable)",
  },
  queryHistory: {
    type: "string",
    valueHint: "<json>",
    description:
      'User conversation history JSON for context understanding and query rewriting. Format: \'[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is..."}]\'',
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Search a Bailian knowledge base (RAG semantic retrieval)",
  auth: "apiKey",
  usageArgs: "--query <text> --agent-id <id> [flags]",
  flags: SEARCH_FLAGS,
  notes: [
    "Retrieval scope and strategy (multi-index weighting, routing, reranking, etc.) are driven by the agent_id service config. Only query and agent_id are required.",
    "Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.",
    "`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.",
    "`--query-history` passes prior conversation turns; the server rewrites the query based on context to improve retrieval relevance.",
    "`--agent-version beta` calls the draft config for debugging before it is deployed.",
  ],
  exampleArgs: [
    '--query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx',
    '--api-key $DASHSCOPE_API_KEY --query "test search" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg',
    '--query "How does it work" --agent-id aid-xxx --workspace-id ws-xxx --query-history \'[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is retrieval-augmented generation"}]\'',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const workspaceId = resolveWorkspaceId(ctx);

    const format = detectOutputFormat(settings.output);

    const body: KnowledgeSearchRequest = {
      query: flags.query,
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
