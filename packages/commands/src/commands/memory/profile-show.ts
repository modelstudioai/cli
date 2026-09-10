import {
  defineCommand,
  memoryEndpoint,
  profileSchemaItemPath,
  detectOutputFormat,
  type FlagsDef,
  type ProfileSchemaDetailResponse,
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

const PROFILE_SHOW_FLAGS = {
  schemaId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Profile schema ID (required)",
      "zh-CN": "Profile Schema ID（必填）",
    },
    required: true,
  },
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Show a profile schema definition with attribute IDs",
    "zh-CN": "查看画像模板定义及属性 ID",
  },
  auth: "apiKey",
  usageArgs: "--schema-id <id> [flags]",
  flags: PROFILE_SHOW_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "The attribute_id values returned here are the handles `memory profile update --attributes-operations` needs for update / delete operations.",
      "zh-CN":
        "这里返回的 attribute_id 就是 `memory profile update --attributes-operations` 做 update / delete 时需要的属性句柄。",
    },
  ],
  exampleArgs: [
    "--schema-id schema_xxx --workspace-id ws_xxx",
    "--schema-id schema_xxx --output json",
  ],
  validate: (flags) => checkMemoryScopeLengths(flags),
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = detectOutputFormat(settings.output);
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), profileSchemaItemPath(flags.schemaId)) +
      buildQuery({ memory_library_id: flags.memoryLibraryId });

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<ProfileSchemaDetailResponse>({
      path: url,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      emitBare(`Name: ${response.name ?? "(none)"}`);
      if (response.description) emitBare(`Description: ${response.description}`);
      const attributes = response.attributes ?? [];
      if (attributes.length === 0) {
        emitBare("No attributes.");
      } else {
        emitBare("Attributes:");
        for (const attribute of attributes) {
          emitBare(`  [${attribute.attribute_id}] ${attribute.name}`);
          if (attribute.description) emitBare(`    desc: ${attribute.description}`);
          if (attribute.default_value !== undefined)
            emitBare(`    default: ${attribute.default_value}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
