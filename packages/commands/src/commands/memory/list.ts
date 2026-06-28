import {
  defineCommand,
  memoryListPath,
  detectOutputFormat,
  type MemoryNodeListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "List memory nodes for a user",
  auth: "apiKey",
  usageArgs: "--user-id <id> [flags]",
  flags: {
    userId: {
      type: "string",
      valueHint: "<id>",
      description: "User ID (required)",
      required: true,
    },
    pageSize: {
      type: "number",
      valueHint: "<n>",
      description: "Results per page (default: 10)",
    },
    page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
    memoryLibraryId: { type: "string", valueHint: "<id>", description: "Memory library ID" },
  },
  exampleArgs: ["--user-id user1", "--user-id user1 --page-size 20 --page 2"],
  async run(ctx) {
    const { config, flags } = ctx;
    const userId = flags.userId;

    const format = detectOutputFormat(config.output);
    const params = new URLSearchParams();
    params.set("user_id", userId);
    if (flags.pageSize !== undefined) params.set("page_size", String(flags.pageSize));
    if (flags.page !== undefined) params.set("page_num", String(flags.page));
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId);

    const path = `${memoryListPath()}?${params.toString()}`;

    if (config.dryRun) {
      emitResult({ endpoint: ctx.client.url(path), method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryNodeListResponse>({
      path,
      method: "GET",
    });

    if (config.quiet || format === "text") {
      if (!response.memory_nodes || response.memory_nodes.length === 0) {
        emitBare("No memory nodes found.");
      } else {
        for (const node of response.memory_nodes) {
          emitBare(`[${node.memory_node_id}] ${node.content}`);
        }
        if (response.total !== undefined) {
          emitBare(`\nTotal: ${response.total}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
