import { defineCommand, memoryEndpoint, memoryNodePath, type FlagsDef } from "bailian-cli-core";
import { buildQuery } from "../shared/params.ts";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  resolveWorkspaceId,
} from "./shared.ts";

const DELETE_FLAGS = {
  nodeId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Memory node ID (required)", "zh-CN": "记忆节点 ID（必填）" },
    required: true,
  },

  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a memory node", "zh-CN": "删除记忆节点" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This deletes the specified memory node. Confirm the node ID before proceeding.",
      "zh-CN": "该操作会删除指定记忆节点，请确认节点 ID。",
    },
  },
  usageArgs: "--node-id <id> [flags]",
  flags: DELETE_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "This deletes only the selected memory node. It does not delete extracted user profile values or the profile schema.",
      "zh-CN": "仅删除选中的记忆节点，不会删除已提取的用户画像值或画像模板。",
    },
    {
      "en-US":
        "Deleted nodes may remain readable with status=delete. Run `memory list` first to confirm the node ID.",
      "zh-CN":
        "删除后的节点仍可能通过详情接口读取，状态为 delete。建议先用 `memory list` 确认节点 ID。",
    },
  ],
  exampleArgs: ["--node-id node_xxx --workspace-id ws_xxx", "--node-id node_xxx --yes"],
  validate: (flags) => checkMemoryScopeLengths(flags),
  async run(ctx) {
    const { settings, flags } = ctx;
    const nodeId = flags.nodeId;

    const format = settings.output;
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), memoryNodePath(nodeId)) +
      buildQuery({ memory_library_id: flags.libraryId });

    if (settings.dryRun) {
      ctx.output.result({ endpoint: url, method: "DELETE" });
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path: url,
      method: "DELETE",
    });

    ctx.output.result(
      response,
      format === "text"
        ? {
            text: ctx.localize({
              "en-US": `Memory node ${nodeId} deleted.`,
              "zh-CN": `记忆节点 ${nodeId} 已删除。`,
            }),
          }
        : undefined,
    );
  },
});
