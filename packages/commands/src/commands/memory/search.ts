import {
  defineCommand,
  requestJson,
  memorySearchEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type MemorySearchRequest,
  type MemorySearchResponse,
} from "bailian-cli-core";
import { failIfMissing, cmdUsage } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Search memory nodes by query or messages",
  usageArgs: "--user-id <id> [--query <text>] [flags]",
  options: [
    { flag: "--user-id <id>", description: "User ID (required)", required: true },
    { flag: "--query <text>", description: "Search query text" },
    { flag: "--messages <json>", description: "Messages JSON array for context-based search" },
    {
      flag: "--top-k <n>",
      description: "Number of results to return (default: 10)",
      type: "number",
    },
    { flag: "--memory-library-id <id>", description: "Memory library ID" },
  ],
  exampleArgs: [
    '--user-id user1 --query "programming preferences"',
    '--user-id user1 --messages \'[{"role":"user","content":"recommend a book"}]\' --top-k 5',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const userId = flags.userId as string;
    if (!userId) failIfMissing("user-id", cmdUsage(config, "--user-id <id>"));

    const body: MemorySearchRequest = { user_id: userId };

    if (flags.query) body.query = flags.query as string;

    if (flags.messages) {
      try {
        body.messages = JSON.parse(flags.messages as string);
      } catch {
        process.stderr.write("Error: --messages must be valid JSON array\n");
        process.exit(1);
      }
    }

    // API requires messages; if only query is given, wrap it as a user message
    if (!body.messages && body.query) {
      body.messages = [{ role: "user", content: body.query }];
    }

    if (!body.query && !body.messages) {
      process.stderr.write("Error: at least one of --query or --messages is required\n");
      process.exit(1);
    }

    if (flags.topK !== undefined) body.top_k = flags.topK as number;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId as string;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ endpoint: memorySearchEndpoint(config.baseUrl), request: body }, format);
      return;
    }

    const url = memorySearchEndpoint(config.baseUrl);
    const response = await requestJson<MemorySearchResponse>(config, {
      url,
      method: "POST",
      body,
    });

    if (config.quiet || format === "rich") {
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
