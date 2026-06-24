import {
  defineCommand,
  requestJson,
  memoryListEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type MemoryNodeListResponse,
} from "bailian-cli-core";
import { failIfMissing, cmdUsage } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "List memory nodes for a user",
  auth: "apiKey",
  usageArgs: "--user-id <id> [flags]",
  options: [
    { flag: "--user-id <id>", description: "User ID (required)", required: true },
    { flag: "--page-size <n>", description: "Results per page (default: 10)", type: "number" },
    { flag: "--page <n>", description: "Page number (default: 1)", type: "number" },
    { flag: "--memory-library-id <id>", description: "Memory library ID" },
  ],
  exampleArgs: ["--user-id user1", "--user-id user1 --page-size 20 --page 2"],
  async run(config: Config, flags: GlobalFlags) {
    const userId = flags.userId as string;
    if (!userId) failIfMissing("user-id", cmdUsage(config, "--user-id <id>"));

    const format = detectOutputFormat(config.output);
    const params = new URLSearchParams();
    params.set("user_id", userId);
    if (flags.pageSize !== undefined) params.set("page_size", String(flags.pageSize as number));
    if (flags.page !== undefined) params.set("page_num", String(flags.page as number));
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId as string);

    const url = `${memoryListEndpoint(config.baseUrl)}?${params.toString()}`;

    if (config.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await requestJson<MemoryNodeListResponse>(config, {
      url,
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
