import { defineCommand, memoryNodePath } from "bailian-cli-core";

export default defineCommand({
  description: { "en-US": "Delete a memory node", "zh-CN": "删除记忆节点" },
  auth: "apiKey",
  usageArgs: "--node-id <id> --user-id <id>",
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
    memoryLibraryId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Memory library ID (non-default library)",
        "zh-CN": "记忆库 ID（非默认记忆库）",
      },
    },
  },
  exampleArgs: ["--node-id node_xxx --user-id user1"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const nodeId = flags.nodeId;
    const userId = flags.userId;

    const params = new URLSearchParams({ user_id: userId });
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId);
    const path = `${memoryNodePath(nodeId)}?${params.toString()}`;

    if (settings.dryRun) {
      ctx.output.result({ endpoint: ctx.client.url(path), method: "DELETE" });
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path,
      method: "DELETE",
    });

    ctx.output.result(response, {
      text: ctx.localize({
        "en-US": `Memory node ${nodeId} deleted.`,
        "zh-CN": `记忆节点 ${nodeId} 已删除。`,
      }),
    });
  },
});
