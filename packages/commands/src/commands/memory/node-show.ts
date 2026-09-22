import {
  defineCommand,
  memoryEndpoint,
  memoryNodePath,
  detectOutputFormat,
  type FlagsDef,
  type MemoryNodeDetailResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { MEMORY_WORKSPACE_NOTE, WORKSPACE_FLAG, resolveWorkspaceId } from "./shared.ts";

const NODE_SHOW_FLAGS = {
  nodeId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Memory node ID (required)", "zh-CN": "记忆节点 ID（必填）" },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Show a single memory node with full detail",
    "zh-CN": "查看单个记忆节点的完整详情",
  },
  auth: "apiKey",
  usageArgs: "--node-id <id> [flags]",
  flags: NODE_SHOW_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "Useful after `memory list` / `memory search`, and to check whether a node is a skill memory before `memory update`.",
      "zh-CN":
        "适合在 `memory list` / `memory search` 之后查看单节点详情，也可在 `memory update` 前确认节点是否为 skill 类型。",
    },
  ],
  exampleArgs: ["--node-id node_xxx --workspace-id ws_xxx", "--node-id node_xxx --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = detectOutputFormat(settings.output);
    const url = memoryEndpoint(resolveWorkspaceId(ctx), memoryNodePath(flags.nodeId));

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryNodeDetailResponse>({
      path: url,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      const node = response.memory_node;
      if (!node) {
        emitBare("Memory node not found.");
        return;
      }
      emitBare(`[${node.memory_node_id}] ${node.content}`);
      emitBare(`  type: ${node.memory_type ?? "-"}  status: ${node.status ?? "-"}`);
      if (node.project_id) emitBare(`  project: ${node.project_id}`);
      if (node.timestamp !== undefined) emitBare(`  timestamp: ${node.timestamp}`);
      if (node.created_at !== undefined) emitBare(`  created_at: ${node.created_at}`);
      if (node.updated_at !== undefined) emitBare(`  updated_at: ${node.updated_at}`);
      if (node.meta_data && Object.keys(node.meta_data).length > 0) {
        emitBare(`  meta: ${JSON.stringify(node.meta_data)}`);
      }
      if (node.media_desc) emitBare(`  media_desc: ${node.media_desc}`);
      if (node.media_urls && node.media_urls.length > 0) {
        emitBare(`  media_urls: ${node.media_urls.join(", ")}`);
      }
    } else {
      emitResult(response, format);
    }
  },
});
