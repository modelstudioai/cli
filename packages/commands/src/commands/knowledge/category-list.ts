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
    description: "Filter by exact collection ID",
  },
  parentId: {
    type: "string",
    valueHint: "<id>",
    description: "List sub-categories of this exact parent category",
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: "Filter by category name (exact match, unlike the knowledge base list)",
  },
  nextToken: {
    type: "string",
    valueHint: "<token>",
    description: "Cursor for the next page (from previous output)",
  },
  maxResult: {
    type: "number",
    valueHint: "<n>",
    description: "Items per page (default: 20)",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "List data-center categories",
  auth: "apiKey",
  usageArgs: "[flags]",
  flags: CATEGORY_LIST_FLAGS,
  notes: [
    "Categories marked [default] are where files land when no category is specified.",
    "Pagination is cursor-based: reuse the printed next token to continue.",
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
