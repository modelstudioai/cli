import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagListCategoryResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, truncateLine, WORKSPACE_FLAG } from "./shared.ts";

const CATEGORY_LIST_FLAGS = {
  collectionId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Filter by exact collection ID", "zh-CN": "按数据集合 ID 精确筛选" },
  },
  parentId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "List sub-categories of this exact parent category",
      "zh-CN": "列出该父类目下的子类目",
    },
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Filter by category name (exact match, unlike the knowledge base list)",
      "zh-CN": "按类目名称筛选（精确匹配，与知识库列表不同）",
    },
  },
  nextToken: {
    type: "string",
    valueHint: "<token>",
    description: {
      "en-US": "Cursor for the next page (from previous output)",
      "zh-CN": "下一页游标（来自上一次输出）",
    },
  },
  maxResult: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Items per page (default: 20)", "zh-CN": "每页条目数（默认：20）" },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "List data-center categories", "zh-CN": "列出数据中心类目" },
  auth: "apiKey",
  usageArgs: "[flags]",
  flags: CATEGORY_LIST_FLAGS,
  notes: [
    {
      "en-US": "Categories marked [default] are where files land when no category is specified.",
      "zh-CN": "未指定类目时，文件会进入标记为 [default] 的类目。",
    },
    {
      "en-US": "Pagination is cursor-based: reuse the printed next token to continue.",
      "zh-CN": "分页使用游标：复用输出中的 next token 继续查询。",
    },
  ],
  exampleArgs: ["--workspace-id ws-xxx", "--name my-category", "--next-token <token>"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // type fixed to UNSTRUCTURED, not exposed as a flag (the only valid value today); note: maxResult is singular
    const body = {
      type: "UNSTRUCTURED",
      ...(flags.collectionId ? { connectorId: flags.collectionId } : {}),
      ...(flags.parentId ? { parentId: flags.parentId } : {}),
      ...(flags.name ? { categoryName: flags.name } : {}),
      ...(flags.nextToken ? { nextToken: flags.nextToken } : {}),
      ...(flags.maxResult !== undefined ? { maxResult: flags.maxResult } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.listCategory);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagListCategoryResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const categories = response.data?.categoryList ?? [];
    if (settings.quiet) {
      for (const category of categories) emitBare(category.categoryId ?? "");
      return;
    }
    if (format === "text") {
      if (categories.length === 0) {
        emitBare("No categories found.");
      } else {
        for (const category of categories) {
          const defaultMark = category.isDefault ? "  [default]" : "";
          emitBare(truncateLine(`${category.categoryId}  ${category.categoryName}${defaultMark}`));
        }
      }
      const nextToken = response.data?.nextToken;
      if (nextToken) emitBare(`next: --next-token ${nextToken}`);
    } else {
      emitResult(response, format);
    }
  },
});
