import {
  defineCommand,
  memoryEndpoint,
  profileSchemaItemPath,
  type FlagsDef,
} from "bailian-cli-core";
import { buildQuery } from "../shared/params.ts";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  resolveWorkspaceId,
} from "./shared.ts";

const PROFILE_DELETE_FLAGS = {
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
    "en-US": "Delete a profile schema",
    "zh-CN": "删除画像模板",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently deletes the profile schema and its attribute definitions. Profiles already extracted for this schema become unreachable.",
      "zh-CN": "该操作会永久删除画像模板及其属性定义，已基于该模板提取的用户画像也将无法访问。",
    },
  },
  usageArgs: "--schema-id <id> [flags]",
  flags: PROFILE_DELETE_FLAGS,
  notes: [
    MEMORY_WORKSPACE_NOTE,
    {
      "en-US":
        "Irreversible — the schema and its attribute definitions are permanently removed. Profiles already extracted for this schema become unreachable.",
      "zh-CN":
        "该操作不可撤销——模板及其属性定义将被永久删除，已基于该模板提取的用户画像也将无法访问。",
    },
  ],
  exampleArgs: ["--schema-id schema_xxx --workspace-id ws_xxx", "--schema-id schema_xxx --yes"],
  validate: (flags) => checkMemoryScopeLengths(flags),
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = settings.output;
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), profileSchemaItemPath(flags.schemaId)) +
      buildQuery({ memory_library_id: flags.libraryId });

    if (settings.dryRun) {
      ctx.output.result({ endpoint: url, method: "DELETE" });
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path: url,
      method: "DELETE",
    });

    ctx.output.result(
      response,
      format === "text"
        ? {
            text: ctx.localize({
              "en-US": `Profile schema ${flags.schemaId} deleted.`,
              "zh-CN": `画像模板 ${flags.schemaId} 已删除。`,
            }),
          }
        : undefined,
    );
  },
});
