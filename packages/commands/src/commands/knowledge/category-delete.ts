import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagConnectorResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, confirmDangerousAction } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const CATEGORY_DELETE_FLAGS = {
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Category ID to delete", "zh-CN": "要删除的类目 ID" },
    required: true,
  },
  yes: {
    type: "switch",
    description: { "en-US": "Skip the confirmation prompt", "zh-CN": "跳过确认提示" },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a data-center category", "zh-CN": "删除数据中心类目" },
  auth: "apiKey",
  usageArgs: "--category-id <id> [flags]",
  flags: CATEGORY_DELETE_FLAGS,
  notes: [
    {
      "en-US":
        "Behavior for categories containing files or sub-categories is server-defined — the server error is passed through as-is.",
      "zh-CN": "包含文件或子类目时的处理行为由服务端定义——服务端返回的错误将原样透传。",
    },
  ],
  exampleArgs: ["--category-id cate-xxx --workspace-id ws-xxx", "--category-id cate-xxx --yes"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = { categoryId: flags.categoryId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.deleteCategory);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    await confirmDangerousAction(
      `Delete category ${flags.categoryId}\nThis cannot be undone.`,
      flags.yes ?? false,
    );

    const response = await ctx.client.requestJson<
      RagConnectorResponse<Record<string, unknown> | undefined>
    >({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`deleted: ${flags.categoryId}`);
      return;
    }
    emitResult(response, format);
  },
});
