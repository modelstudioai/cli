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
      "en-US": "Memory entity ID that owns the memory (required)",
      "zh-CN": "记忆实体 ID，标识记忆归属对象（必填）",
    },
    required: true,
  },
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a memory node", "zh-CN": "删除记忆节点" },
  auth: "apiKey",
  usageArgs: "--node-id <id> --user-id <id> [flags]",
  flags: DELETE_FLAGS,
  notes: [MEMORY_WORKSPACE_NOTE],
  exampleArgs: ["--node-id node_xxx --user-id user1 --workspace-id ws_xxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const nodeId = flags.nodeId;

    const format = detectOutputFormat(settings.output);
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), memoryNodePath(nodeId)) +
      buildQuery({ user_id: flags.userId, memory_library_id: flags.memoryLibraryId });

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
