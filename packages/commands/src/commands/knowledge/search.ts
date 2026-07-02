import {
  defineCommand,
  requestJson,
  knowledgeSearchEndpoint,
  detectOutputFormat,
  BailianError,
  ExitCode,
  isInteractive,
  type Config,
  type GlobalFlags,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
} from "bailian-cli-core";
import { failIfMissing, cmdUsage, emitResult, emitBare, promptText } from "bailian-cli-runtime";

export default defineCommand({
  description: "Search a Bailian knowledge base (RAG semantic retrieval)",
  skipDefaultApiKeySetup: true,
  usageArgs: "--query <text> --agent-id <id> [flags]",
  options: [
    {
      flag: "--query <text>",
      description: "Search query text (required, cannot be empty)",
      required: true,
    },
    {
      flag: "--agent-id <id>",
      description: "Retrieval service ID (find in console knowledge retrieval page)",
      required: true,
    },
    {
      flag: "--workspace-id <id>",
      description: "Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)",
    },
    {
      flag: "--image <url>",
      description: "Image URL for multimodal retrieval (repeatable)",
      type: "array",
    },
    {
      flag: "--query-history <json>",
      description:
        'User conversation history JSON for context understanding and query rewriting. Format: \'[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is..."}]\'',
    },
  ],
  notes: [
    "Retrieval scope and strategy (multi-index weighting, routing, reranking, etc.) are driven by the agent_id service config. Only query and agent_id are required.",
    "Auth: uses DashScope API Key (Bearer token). Get yours from the console API Key page.",
    "`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or `kscli config set workspace_id <id>`.",
    "`--query-history` passes prior conversation turns; the server rewrites the query based on context to improve retrieval relevance.",
  ],
  exampleArgs: [
    '--query "What is RAG?" --agent-id aid-xxx --workspace-id ws-xxx',
    '--api-key $DASHSCOPE_API_KEY --query "test search" --agent-id aid-xxx --workspace-id ws-xxx --image https://example.com/img.jpg',
    '--query "How does it work" --agent-id aid-xxx --workspace-id ws-xxx --query-history \'[{"role":"user","content":"What is RAG"},{"role":"assistant","content":"RAG is retrieval-augmented generation"}]\'',
  ],
  async run(config: Config, flags: GlobalFlags) {
    let query = flags.query as string | undefined;
    if (!query) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: "Enter your search query:" });
        if (!hint) {
          process.stderr.write("Search cancelled.\n");
          process.exit(1);
        }
        query = hint;
      } else {
        failIfMissing("query", cmdUsage(config, "--query <text> --agent-id <id>"));
      }
    }

    const agentId = flags.agentId as string;
    if (!agentId) failIfMissing("agent-id", cmdUsage(config, "--query <text> --agent-id <id>"));

    const workspaceId = (flags.workspaceId as string) || config.workspaceId;
    if (!workspaceId) {
      throw new BailianError(
        "Workspace ID is required.",
        ExitCode.USAGE,
        "Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: kscli config set workspace_id <id>",
      );
    }

    const format = detectOutputFormat(config.output);

    const body: KnowledgeSearchRequest = {
      query: query!,
      agent_id: agentId,
    };

    const imageUrls = flags.image as string[] | undefined;
    if (imageUrls && imageUrls.length > 0) {
      body.images = imageUrls;
    }

    // Parse query_history JSON for multi-turn context
    if (flags.queryHistory) {
      try {
        body.query_history = JSON.parse(flags.queryHistory as string) as Array<{
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

    if (config.dryRun) {
      emitResult({ endpoint: url, request: body }, format);
      return;
    }

    const response = await requestJson<KnowledgeSearchResponse>(config, {
      url,
      method: "POST",
      body,
    });

    const nodes = response.data?.nodes || [];
    if (config.quiet || format === "text") {
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
