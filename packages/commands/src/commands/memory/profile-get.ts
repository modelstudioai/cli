import {
  defineCommand,
  memoryEndpoint,
  userProfilePath,
  detectOutputFormat,
  type FlagsDef,
  type UserProfileResponse,
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

const PROFILE_GET_FLAGS = {
  schemaId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Profile schema ID (required)",
      "zh-CN": "Profile Schema ID（必填）",
    },
    required: true,
  },
  userId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Memory entity ID that owns the profile (required)",
      "zh-CN": "记忆实体 ID，标识画像归属对象（必填）",
    },
    required: true,
  },
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Get the extracted user profile for a schema",
    "zh-CN": "获取某个 Schema 下已提取的用户画像",
  },
  auth: "apiKey",
  usageArgs: "--schema-id <id> --user-id <id> [flags]",
  flags: PROFILE_GET_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "Values are extracted only when `memory add --profile-schema` used the same schema ID; otherwise every attribute comes back empty. Use `memory profile show` for the schema definition itself.",
      "zh-CN":
        "只有 `memory add --profile-schema` 传入同一个 Schema ID 时才会提取属性值，否则所有属性都为空。查看模板定义本身请用 `memory profile show`。",
    },
  ],
  exampleArgs: ["--schema-id schema_xxx --user-id user1 --workspace-id ws_xxx"],
  validate: (flags) => checkMemoryScopeLengths(flags),
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = detectOutputFormat(settings.output);
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), userProfilePath(flags.schemaId)) +
      buildQuery({ user_id: flags.userId, memory_library_id: flags.memoryLibraryId });

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<UserProfileResponse>({
      path: url,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      const attributes = response.profile?.attributes ?? [];
      if (attributes.length === 0) {
        emitBare("No profile data found.");
      } else {
        for (const attribute of attributes) {
          emitBare(`${attribute.name}: ${attribute.value ?? "(empty)"}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
