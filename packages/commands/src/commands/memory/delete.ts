import {
  defineCommand,
  memoryEndpoint,
  memoryNodePath,
  detectOutputFormat,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
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
  userId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Deprecated compatibility option; ignored, the node ID selects the memory",
      "zh-CN": "已弃用的兼容参数；不发送到接口，通过节点 ID 定位记忆",
    },
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

    const format = detectOutputFormat(settings.output);
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), memoryNodePath(nodeId)) +
      buildQuery({ memory_library_id: flags.libraryId });

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "DELETE" }, format);
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path: url,
      method: "DELETE",
    });

    if (settings.quiet || format === "text") {
      emitBare(`Memory node ${nodeId} deleted.`);
    } else {
      emitResult(response, format);
    }
  },
});
