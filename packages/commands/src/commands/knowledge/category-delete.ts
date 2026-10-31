import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  type FlagsDef,
  type RagConnectorResponse,
} from "bailian-cli-core";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const CATEGORY_DELETE_FLAGS = {
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Category ID to delete", "zh-CN": "要删除的类目 ID" },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a data-center category", "zh-CN": "删除数据中心类目" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This deletes the selected data-center category and cannot be undone.",
      "zh-CN": "该操作会删除所选数据中心类目，且无法撤销。",
    },
  },
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
    const format = settings.output;

    const body = { categoryId: flags.categoryId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.deleteCategory);

    if (settings.dryRun) {
      ctx.output.result({ endpoint, request: body });
      return;
    }

    const response = await ctx.client.requestJson<
      RagConnectorResponse<Record<string, unknown> | undefined>
    >({
      path: endpoint,
      method: "POST",
      body,
    });

    ctx.output.result(
      response,
      format === "text" ? { text: `deleted: ${flags.categoryId}` } : undefined,
    );
  },
});
