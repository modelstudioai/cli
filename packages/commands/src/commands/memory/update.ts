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
  MAX_CUSTOM_CONTENT_LENGTH,
  SKILL_METADATA_FLAGS,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  checkSkillMetadataFlags,
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

  content: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "New content for the memory node, max 512 characters (required)",
      "zh-CN": "记忆节点的新内容，最多 512 个字符（必填）",
    },
    required: true,
  },

  metaData: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Custom metadata JSON object, merged incrementally: {"key":"value"}',
      "zh-CN": '用户自定义信息 JSON 对象，增量合并：{"key":"value"}',
    },
  },
  ...SKILL_METADATA_FLAGS,
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Update a memory node content", "zh-CN": "更新记忆节点内容" },
  auth: "apiKey",
  usageArgs: "--node-id <id> --content <text> [flags]",
  flags: UPDATE_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US": "--content replaces the node content in full; --meta-data merges incrementally.",
      "zh-CN": "--content 整体替换节点内容；--meta-data 为增量合并。",
    },
    {
      "en-US":
        "When the target node is a skill memory, the server requires the skill triple (--skill-name / --skill-description / --skill-tags); use `memory node show` to check the node type first.",
      "zh-CN":
        "目标节点为 skill 记忆时，服务端强制要求 skill 三件套（--skill-name / --skill-description / --skill-tags）；可先用 `memory node show` 确认节点类型。",
    },
  ],
  exampleArgs: [
    {
      "en-US": '--node-id node_xxx --content "updated memory content" --workspace-id ws_xxx',
      "zh-CN": '--node-id node_xxx --content "更新后的记忆内容" --workspace-id ws_xxx',
    },
    {
      "en-US": '--node-id node_xxx --content "met at WAIC" --meta-data \'{"city":"Shanghai"}\'',
      "zh-CN": '--node-id node_xxx --content "在 WAIC 见面" --meta-data \'{"city":"上海"}\'',
    },
    {
      "en-US":
        '--node-id node_xxx --content "Summarize meeting minutes" --skill-name "meeting-summary" --skill-description "Extract key points" --skill-tags office',
      "zh-CN":
        '--node-id node_xxx --content "整理会议纪要" --skill-name "会议纪要整理" --skill-description "提取会议重点" --skill-tags 办公',
    },
  ],
  validate: (flags) => {
    const scopeError = checkMemoryScopeLengths(flags);
    if (scopeError) return scopeError;
    if (flags.content.length > MAX_CUSTOM_CONTENT_LENGTH)
      return `--content must be at most ${MAX_CUSTOM_CONTENT_LENGTH} characters.`;
    const skillError = checkSkillMetadataFlags(flags);
    if (skillError) return skillError;
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const nodeId = flags.nodeId;

    const body: MemoryNodeUpdateRequest = {
      custom_content: flags.content,
    };
    if (flags.metaData) body.meta_data = parseJsonObjectFlag("--meta-data", flags.metaData);
    if (
      flags.skillName !== undefined &&
      flags.skillDescription !== undefined &&
      flags.skillTags !== undefined
    ) {
      body.skill_name = flags.skillName;
      body.skill_description = flags.skillDescription;
      body.skill_tags = flags.skillTags;
    }
    if (flags.libraryId) body.memory_library_id = flags.libraryId;

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
