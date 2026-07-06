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
  userId: { type: "string", valueHint: "<id>", description: "User ID (required)", required: true },
  query: { type: "string", valueHint: "<text>", description: "Search query text" },
  messages: {
    type: "string",
    valueHint: "<json>",
    description: "Messages JSON array for context-based search",
  },
  topK: {
    type: "number",
    valueHint: "<n>",
    description: "Number of results to return (default: 10)",
  },
  memoryLibraryId: { type: "string", valueHint: "<id>", description: "Memory library ID" },
} satisfies FlagsDef;
type SearchFlags = ParsedFlags<typeof SEARCH_FLAGS>;

export default defineCommand({
  description: "Search memory nodes by query or messages",
  auth: "apiKey",
  usageArgs: "--user-id <id> [--query <text>] [flags]",
  flags: SEARCH_FLAGS,
  exampleArgs: [
    '--user-id user1 --query "programming preferences"',
    '--user-id user1 --messages \'[{"role":"user","content":"recommend a book"}]\' --top-k 5',
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
