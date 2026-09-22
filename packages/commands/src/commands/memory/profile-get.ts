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
  needDetail: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US":
        "Return per-item value lists (item_id / status / value) instead of the joined value string",
      "zh-CN": "返回逐条画像值列表（item_id / status / value），而非拼接后的 value 字符串",
    },
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
    {
      "en-US":
        "--need-detail true expands each attribute into its value items with item_id and status, the handles for profile value management.",
      "zh-CN":
        "--need-detail true 将每个属性展开为带 item_id 与 status 的值项列表，便于画像值管理。",
    },
  ],
  exampleArgs: [
    "--schema-id schema_xxx --user-id user1 --workspace-id ws_xxx",
    "--schema-id schema_xxx --user-id user1 --need-detail true",
  ],
  validate: (flags) => checkMemoryScopeLengths(flags),
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = detectOutputFormat(settings.output);
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), userProfilePath(flags.schemaId)) +
      buildQuery({
        user_id: flags.userId,
        memory_library_id: flags.libraryId,
        need_detail: flags.needDetail === undefined ? undefined : String(flags.needDetail),
      });

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
          const valueItems = attribute.value_items ?? [];
          if (valueItems.length > 0) {
            for (const item of valueItems) {
              emitBare(
                `${attribute.name}: ${item.value ?? "(empty)"} (item ${item.item_id ?? "-"}, ${item.status ?? "-"})`,
              );
            }
          } else {
            emitBare(`${attribute.name}: ${attribute.value ?? "(empty)"}`);
          }
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
