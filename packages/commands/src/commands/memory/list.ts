import {
  defineCommand,
  memoryListPath,
  detectOutputFormat,
  type MemoryNodeListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: { "en-US": "List memory nodes for a user", "zh-CN": "列出用户的记忆节点" },
  auth: "apiKey",
  usageArgs: "--user-id <id> [flags]",
  flags: {
    userId: {
      type: "string",
      valueHint: "<id>",
      description: { "en-US": "User ID (required)", "zh-CN": "用户 ID（必填）" },
      required: true,
    },
    pageSize: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Results per page (default: 10)", "zh-CN": "每页结果数（默认：10）" },
    },
    page: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
    },
    memoryLibraryId: {
      type: "string",
      valueHint: "<id>",
      description: { "en-US": "Memory library ID", "zh-CN": "记忆库 ID" },
    },
  },
  exampleArgs: ["--user-id user1", "--user-id user1 --page-size 20 --page 2"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const userId = flags.userId;

    const format = detectOutputFormat(settings.output);
    const params = new URLSearchParams();
    params.set("user_id", userId);
    if (flags.pageSize !== undefined) params.set("page_size", String(flags.pageSize));
    if (flags.page !== undefined) params.set("page_num", String(flags.page));
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId);

    const path = `${memoryListPath()}?${params.toString()}`;

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(path), method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryNodeListResponse>({
      path,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
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
