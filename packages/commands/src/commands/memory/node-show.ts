import {
  defineCommand,
  memoryEndpoint,
  memoryNodePath,
  type FlagsDef,
  type MemoryNodeDetailResponse,
} from "bailian-cli-core";
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

    const format = settings.output;
    const url = memoryEndpoint(resolveWorkspaceId(ctx), memoryNodePath(flags.nodeId));

    if (settings.dryRun) {
      ctx.output.result({ endpoint: url, method: "GET" });
      return;
    }

    const response = await ctx.client.requestJson<MemoryNodeDetailResponse>({
      path: url,
      method: "GET",
    });

    let text: string | undefined;
    if (format === "text") {
      const node = response.memory_node;
      const lines: string[] = [];
      if (!node) {
        lines.push(
          ctx.localize({ "en-US": "Memory node not found.", "zh-CN": "未找到记忆节点。" }),
        );
      } else {
        lines.push(`[${node.memory_node_id}] ${node.content}`);
        lines.push(
          ctx.localize({
            "en-US": `  type: ${node.memory_type ?? "-"}  status: ${node.status ?? "-"}`,
            "zh-CN": `  类型: ${node.memory_type ?? "-"}  状态: ${node.status ?? "-"}`,
          }),
        );
        if (node.project_id)
          lines.push(
            ctx.localize({
              "en-US": `  project: ${node.project_id}`,
              "zh-CN": `  项目: ${node.project_id}`,
            }),
          );
        if (node.timestamp !== undefined)
          lines.push(
            ctx.localize({
              "en-US": `  timestamp: ${node.timestamp}`,
              "zh-CN": `  时间戳: ${node.timestamp}`,
            }),
          );
        if (node.created_at !== undefined)
          lines.push(
            ctx.localize({
              "en-US": `  created_at: ${node.created_at}`,
              "zh-CN": `  创建时间: ${node.created_at}`,
            }),
          );
        if (node.updated_at !== undefined)
          lines.push(
            ctx.localize({
              "en-US": `  updated_at: ${node.updated_at}`,
              "zh-CN": `  更新时间: ${node.updated_at}`,
            }),
          );
        if (node.meta_data && Object.keys(node.meta_data).length > 0)
          lines.push(
            ctx.localize({
              "en-US": `  meta: ${JSON.stringify(node.meta_data)}`,
              "zh-CN": `  元数据: ${JSON.stringify(node.meta_data)}`,
            }),
          );
        if (node.media_desc)
          lines.push(
            ctx.localize({
              "en-US": `  media_desc: ${node.media_desc}`,
              "zh-CN": `  媒体描述: ${node.media_desc}`,
            }),
          );
        if (node.media_urls && node.media_urls.length > 0)
          lines.push(
            ctx.localize({
              "en-US": `  media_urls: ${node.media_urls.join(", ")}`,
              "zh-CN": `  媒体 URL: ${node.media_urls.join(", ")}`,
            }),
          );
      }
      text = lines.join("\n");
    }
    ctx.output.result(response, text === undefined ? undefined : { text });
  },
});
