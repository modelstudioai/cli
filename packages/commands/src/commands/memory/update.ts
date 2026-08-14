import {
  defineCommand,
  memoryNodePath,
  detectOutputFormat,
  type MemoryNodeUpdateRequest,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: { "en-US": "Update a memory node content", "zh-CN": "更新记忆节点内容" },
  auth: "apiKey",
  usageArgs: "--node-id <id> --user-id <id> --content <text>",
  flags: {
    nodeId: {
      type: "string",
      valueHint: "<id>",
      description: { "en-US": "Memory node ID (required)", "zh-CN": "记忆节点 ID（必填）" },
      required: true,
    },
    userId: {
      type: "string",
      valueHint: "<id>",
      description: { "en-US": "User ID (required)", "zh-CN": "用户 ID（必填）" },
      required: true,
    },
    content: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "New content for the memory node (required)",
        "zh-CN": "记忆节点的新内容（必填）",
      },
      required: true,
    },
    memoryLibraryId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Memory library ID (non-default library)",
        "zh-CN": "记忆库 ID（非默认记忆库）",
      },
    },
  },
  exampleArgs: [
    {
      "en-US": '--node-id node_xxx --user-id user1 --content "updated memory content"',
      "zh-CN": '--node-id node_xxx --user-id user1 --content "更新后的记忆内容"',
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const nodeId = flags.nodeId;
    const userId = flags.userId;
    const content = flags.content;

    const body: MemoryNodeUpdateRequest = {
      user_id: userId,
      custom_content: content,
    };
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
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

    if (settings.quiet || format === "text") {
      emitBare(`Memory node ${nodeId} updated.`);
    } else {
      emitResult(response, format);
    }
  },
});
