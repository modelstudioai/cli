import {
  defineCommand,
  UsageError,
  memoryAddPath,
  memoryEndpoint,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
  type MemoryAddRequest,
  type MemoryAddResponse,
  type MemoryMessage,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_RATE_LIMIT_NOTE,
  MEMORY_WORKSPACE_NOTE,
  MAX_CUSTOM_CONTENT_LENGTH,
  PROJECT_ID_FLAG,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  parseJsonArrayFlag,
  parseJsonObjectFlag,
  resolveWorkspaceId,
} from "./shared.ts";

const ADD_FLAGS = {
  userId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory entity ID that owns the memory (required)",
      "zh-CN": "记忆实体 ID，标识记忆归属对象（必填）",
    },
    required: true,
  },
  messages: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Messages JSON array: [{"role":"user","content":"..."},...] (max 50)',
      "zh-CN": '消息 JSON 数组：[{"role":"user","content":"..."},...]（最多 50 条）',
    },
  },
  content: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Custom content to memorize verbatim; takes precedence over --messages",
      "zh-CN": "要原样记忆的自定义内容；优先级高于 --messages",
    },
  },
  profileSchema: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Profile schema ID; without it no user profile is extracted",
      "zh-CN": "画像模板 ID；不传则不提取用户画像",
    },
  },
  metaData: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Custom metadata JSON object: {"location_name":"Beijing"}',
      "zh-CN": '用户自定义信息 JSON 对象：{"location_name":"北京"}',
    },
  },
  ...PROJECT_ID_FLAG,
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;
type AddFlags = ParsedFlags<typeof ADD_FLAGS>;

/** Max messages accepted per AddMemory call (a Q&A pair counts as 2). */
const MAX_MESSAGES = 50;

export default defineCommand({
  description: {
    "en-US": "Add memory from messages or custom content",
    "zh-CN": "从消息或自定义内容添加记忆",
  },
  auth: "apiKey",
  usageArgs: "--user-id <id> [--messages <json>] [--content <text>] [flags]",
  flags: ADD_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "--content and --messages are mutually exclusive: when --content is set, --messages is ignored by the server.",
      "zh-CN": "--content 与 --messages 互斥：传了 --content 时服务端会忽略 --messages。",
    },
    {
      "en-US":
        "The response lists the changed memory nodes; one call can add, update or delete several at once.",
      "zh-CN": "返回结果是变更的记忆片段列表；一次调用可能同时新增、更新或删除多条。",
    },
    MEMORY_RATE_LIMIT_NOTE,
  ],
  exampleArgs: [
    {
      "en-US":
        '--user-id user1 --content "The user likes Python programming" --workspace-id ws_xxx',
      "zh-CN": '--user-id user1 --content "用户喜欢使用 Python 编程" --workspace-id ws_xxx',
    },
    {
      "en-US": '--user-id user1 --messages \'[{"role":"user","content":"I like traveling"}]\'',
      "zh-CN": '--user-id user1 --messages \'[{"role":"user","content":"我喜欢旅行"}]\'',
    },
    {
      "en-US": '--user-id user1 --content "Lives in Beijing" --profile-schema schema_xxx',
      "zh-CN": '--user-id user1 --content "居住在北京" --profile-schema schema_xxx',
    },
    {
      "en-US": '--user-id user1 --content "Attended WAIC" --meta-data \'{"location":"Shanghai"}\'',
      "zh-CN": '--user-id user1 --content "参加了 WAIC" --meta-data \'{"location":"上海"}\'',
    },
  ],
  validate: (flags: AddFlags) => {
    if (!flags.messages && !flags.content) return "Provide --messages or --content.";
    const scopeError = checkMemoryScopeLengths(flags);
    if (scopeError) return scopeError;
    if (flags.content && flags.content.length > MAX_CUSTOM_CONTENT_LENGTH)
      return `--content must be at most ${MAX_CUSTOM_CONTENT_LENGTH} characters.`;
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const body: MemoryAddRequest = { user_id: flags.userId };

    if (flags.messages) {
      const messages = parseJsonArrayFlag<MemoryMessage>("--messages", flags.messages);
      if (messages.length > MAX_MESSAGES) {
        throw new UsageError(`--messages accepts at most ${MAX_MESSAGES} messages`);
      }
      body.messages = messages;
    }

    if (flags.content) body.custom_content = flags.content;
    if (flags.metaData) body.meta_data = parseJsonObjectFlag("--meta-data", flags.metaData);
    if (flags.profileSchema) body.profile_schema = flags.profileSchema;
    if (flags.projectId) body.project_id = flags.projectId;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(settings.output);
    const url = memoryEndpoint(resolveWorkspaceId(ctx), memoryAddPath());

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "POST", request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryAddResponse>({
      path: url,
      method: "POST",
      body,
    });

    if (settings.quiet || format === "text") {
      const nodes = response.memory_nodes ?? [];
      if (nodes.length === 0) {
        emitBare("No memory node changed.");
        return;
      }
      for (const node of nodes) {
        emitBare(`[${node.event ?? "ADD"}] ${node.memory_node_id} ${node.content}`);
      }
    } else {
      emitResult(response, format);
    }
  },
});
