import {
  defineCommand,
  UsageError,
  memoryAddPath,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
  type MemoryAddRequest,
  type MemoryAddResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const ADD_FLAGS = {
  userId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "User ID (required)", "zh-CN": "用户 ID（必填）" },
    required: true,
  },
  messages: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": 'Messages JSON array: [{"role":"user","content":"..."},...]',
      "zh-CN": '消息 JSON 数组：[{"role":"user","content":"..."},...]',
    },
  },
  content: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Custom content text to memorize", "zh-CN": "要记忆的自定义内容文本" },
  },
  profileSchema: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Profile schema ID for user profiling",
      "zh-CN": "用于用户画像的 Profile Schema ID",
    },
  },
  memoryLibraryId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory library ID (isolate memory space)",
      "zh-CN": "记忆库 ID（用于隔离记忆空间）",
    },
  },
} satisfies FlagsDef;
type AddFlags = ParsedFlags<typeof ADD_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Add memory from messages or custom content",
    "zh-CN": "从消息或自定义内容添加记忆",
  },
  auth: "apiKey",
  usageArgs: "--user-id <id> [--messages <json>] [--content <text>] [flags]",
  flags: ADD_FLAGS,
  exampleArgs: [
    {
      "en-US": '--user-id user1 --content "The user likes Python programming"',
      "zh-CN": '--user-id user1 --content "用户喜欢使用 Python 编程"',
    },
    {
      "en-US": '--user-id user1 --messages \'[{"role":"user","content":"I like traveling"}]\'',
      "zh-CN": '--user-id user1 --messages \'[{"role":"user","content":"我喜欢旅行"}]\'',
    },
    {
      "en-US": '--user-id user1 --content "Lives in Beijing" --profile-schema schema_xxx',
      "zh-CN": '--user-id user1 --content "居住在北京" --profile-schema schema_xxx',
    },
  ],
  validate: (f: AddFlags) =>
    !f.messages && !f.content ? "Provide --messages or --content." : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const userId = flags.userId;

    const body: MemoryAddRequest = { user_id: userId };

    if (flags.messages) {
      try {
        body.messages = JSON.parse(flags.messages);
      } catch {
        throw new UsageError("--messages must be valid JSON array");
      }
    }

    if (flags.content) {
      body.custom_content = flags.content;
    }

    if (flags.profileSchema) body.profile_schema = flags.profileSchema;
    if (flags.memoryLibraryId) body.memory_library_id = flags.memoryLibraryId;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(memoryAddPath()), request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<MemoryAddResponse>({
      path: memoryAddPath(),
      method: "POST",
      body,
    });

    if (settings.quiet || format === "text") {
      const ids = response.memory_ids?.join(", ") || "none";
      emitBare(`Memory added. IDs: ${ids}`);
    } else {
      emitResult(response, format);
    }
  },
});
