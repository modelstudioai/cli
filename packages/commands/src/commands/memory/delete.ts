import {
  defineCommand,
  requestJson,
  memoryNodeEndpoint,
  detectOutputFormat,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Delete a memory node",
  auth: "apiKey",
  usageArgs: "--node-id <id> --user-id <id>",
  flags: {
    nodeId: {
      type: "string",
      valueHint: "<id>",
      description: "Memory node ID (required)",
      required: true,
    },
    userId: {
      type: "string",
      valueHint: "<id>",
      description: "User ID (required)",
      required: true,
    },
    memoryLibraryId: {
      type: "string",
      valueHint: "<id>",
      description: "Memory library ID (non-default library)",
    },
  },
  exampleArgs: ["--node-id node_xxx --user-id user1"],
  async run(config, flags) {
    const nodeId = flags.nodeId;
    const userId = flags.userId;

    const format = detectOutputFormat(config.output);
    const params = new URLSearchParams({ user_id: userId });
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId);
    const url = `${memoryNodeEndpoint(config.baseUrl, nodeId)}?${params.toString()}`;

    if (config.dryRun) {
      emitResult({ endpoint: url, method: "DELETE" }, format);
      return;
    }

    const response = await requestJson<{ request_id: string }>(config, {
      url,
      method: "DELETE",
    });

    if (config.quiet || format === "text") {
      emitBare(`Memory node ${nodeId} deleted.`);
    } else {
      emitResult(response, format);
    }
  },
});
