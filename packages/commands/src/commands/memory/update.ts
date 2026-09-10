import {
  defineCommand,
  memoryEndpoint,
  memoryNodePath,
  detectOutputFormat,
  type FlagsDef,
  type MemoryNodeUpdateRequest,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  WORKSPACE_FLAG,
  parseJsonObjectFlag,
  resolveWorkspaceId,
} from "./shared.ts";

const UPDATE_FLAGS = {
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
  content: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "New content for the memory node, max 512 characters (required)",
      "zh-CN": "记忆节点的新内容，最多 512 个字符（必填）",
    },
    required: true,
  },
  timestamp: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Unix timestamp (seconds) of when the remembered event happened",
      "zh-CN": "记忆片段对应事件发生时的秒级 Unix 时间戳",
    },
  },
  metaData: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Custom metadata JSON object, merged incrementally: {"key":"value"}',
      "zh-CN": '用户自定义信息 JSON 对象，增量合并：{"key":"value"}',
    },
  },
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Max characters accepted for custom_content. */
const MAX_CONTENT_LENGTH = 512;

export default defineCommand({
  description: { "en-US": "Update a memory node content", "zh-CN": "更新记忆节点内容" },
  auth: "apiKey",
  usageArgs: "--node-id <id> --user-id <id> --content <text> [flags]",
  flags: UPDATE_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US": "--content replaces the node content in full; --meta-data merges incrementally.",
      "zh-CN": "--content 整体替换节点内容；--meta-data 为增量合并。",
    },
  ],
  exampleArgs: [
    {
      "en-US":
        '--node-id node_xxx --user-id user1 --content "updated memory content" --workspace-id ws_xxx',
      "zh-CN":
        '--node-id node_xxx --user-id user1 --content "更新后的记忆内容" --workspace-id ws_xxx',
    },
    {
      "en-US":
        '--node-id node_xxx --user-id user1 --content "met at WAIC" --timestamp 1747278460 --meta-data \'{"city":"Shanghai"}\'',
      "zh-CN":
        '--node-id node_xxx --user-id user1 --content "在 WAIC 见面" --timestamp 1747278460 --meta-data \'{"city":"上海"}\'',
    },
  ],
  validate: (flags) => {
    if (flags.content.length > MAX_CONTENT_LENGTH)
      return `--content must be at most ${MAX_CONTENT_LENGTH} characters.`;
    if (flags.timestamp !== undefined && flags.timestamp < 0)
      return "--timestamp must be a non-negative Unix timestamp in seconds.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const nodeId = flags.nodeId;

    const body: MemoryNodeUpdateRequest = {
      user_id: flags.userId,
      custom_content: flags.content,
    };
    if (flags.timestamp !== undefined) body.timestamp = flags.timestamp;
    if (flags.metaData) body.meta_data = parseJsonObjectFlag("--meta-data", flags.metaData);
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(settings.output);
    const url = memoryEndpoint(resolveWorkspaceId(ctx), memoryNodePath(nodeId));

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "PATCH", request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path: url,
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
