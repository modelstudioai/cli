import {
  defineCommand,
  memoryEndpoint,
  profileSchemaItemPath,
  type FlagsDef,
  type ProfileSchemaDetailResponse,
} from "bailian-cli-core";
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

    const format = settings.output;
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), profileSchemaItemPath(flags.schemaId)) +
      buildQuery({ memory_library_id: flags.libraryId });

    if (settings.dryRun) {
      ctx.output.result({ endpoint: url, method: "GET" });
      return;
    }

    const response = await ctx.client.requestJson<ProfileSchemaDetailResponse>({
      path: url,
      method: "GET",
    });

    let text: string | undefined;
    if (format === "text") {
      const name = response.name ?? ctx.localize({ "en-US": "(none)", "zh-CN": "（无）" });
      const lines = [ctx.localize({ "en-US": `Name: ${name}`, "zh-CN": `名称: ${name}` })];
      if (response.description)
        lines.push(
          ctx.localize({
            "en-US": `Description: ${response.description}`,
            "zh-CN": `描述: ${response.description}`,
          }),
        );
      const attributes = response.attributes ?? [];
      if (attributes.length === 0) {
        lines.push(ctx.localize({ "en-US": "No attributes.", "zh-CN": "暂无属性。" }));
      } else {
        lines.push(ctx.localize({ "en-US": "Attributes:", "zh-CN": "属性:" }));
        for (const attribute of attributes) {
          lines.push(`  [${attribute.attribute_id}] ${attribute.name}`);
          if (attribute.description)
            lines.push(
              ctx.localize({
                "en-US": `    desc: ${attribute.description}`,
                "zh-CN": `    描述: ${attribute.description}`,
              }),
            );
          if (attribute.default_value !== undefined)
            lines.push(
              ctx.localize({
                "en-US": `    default: ${attribute.default_value}`,
                "zh-CN": `    默认值: ${attribute.default_value}`,
              }),
            );
        }
      }
      text = lines.join("\n");
    }
    ctx.output.result(response, text === undefined ? undefined : { text });
  },
});
