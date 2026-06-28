import {
  defineCommand,
  memoryNodePath,
  detectOutputFormat,
  type MemoryNodeUpdateRequest,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Update a memory node content",
  auth: "apiKey",
  usageArgs: "--node-id <id> --user-id <id> --content <text>",
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
    content: {
      type: "string",
      valueHint: "<text>",
      description: "New content for the memory node (required)",
      required: true,
    },
    memoryLibraryId: {
      type: "string",
      valueHint: "<id>",
      description: "Memory library ID (non-default library)",
    },
  },
  exampleArgs: ['--node-id node_xxx --user-id user1 --content "updated memory content"'],
  async run(ctx) {
    const { config, flags } = ctx;
    const nodeId = flags.nodeId;
    const userId = flags.userId;
    const content = flags.content;

    const body: MemoryNodeUpdateRequest = {
      user_id: userId,
      custom_content: content,
    };
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult(
        { endpoint: ctx.client.url(memoryNodePath(nodeId)), method: "PATCH", request: body },
        format,
      );
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path: memoryNodePath(nodeId),
      method: "PATCH",
      body,
    });

    if (config.quiet || format === "text") {
      emitBare(`Memory node ${nodeId} updated.`);
    } else {
      emitResult(response, format);
    }
  },
});
