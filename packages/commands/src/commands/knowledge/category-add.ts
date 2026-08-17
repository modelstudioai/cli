import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagAddCategoryResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const CATEGORY_ADD_FLAGS = {
  name: {
    type: "string",
    valueHint: "<text>",
    description: "Category name (1-20 chars)",
    required: true,
  },
  parentId: {
    type: "string",
    valueHint: "<id>",
    description: "Create as a sub-category of this category",
  },
  collectionId: {
    type: "string",
    valueHint: "<id>",
    description: "Create under this collection (defaults to the platform collection)",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Create a data-center category",
  auth: "apiKey",
  usageArgs: "--name <text> [flags]",
  flags: CATEGORY_ADD_FLAGS,
  notes: ["Use categories to organize data-center files by business domain."],
  exampleArgs: ["--name product-docs --workspace-id ws-xxx", "--name sub --parent-id cate-xxx"],
  validate(flags) {
    if (flags.name.length < 1 || flags.name.length > 20) return "--name must be 1-20 characters";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // categoryType fixed to UNSTRUCTURED (the only valid value for knowledge-base creation today)
    const body = {
      categoryName: flags.name,
      categoryType: "UNSTRUCTURED",
      ...(flags.parentId ? { parentCategoryId: flags.parentId } : {}),
      ...(flags.collectionId ? { connectorId: flags.collectionId } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.addCategory);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagAddCategoryResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const categoryId = response.data?.categoryId;
    if (settings.quiet) {
      emitBare(categoryId ?? "");
      return;
    }
    if (format === "text") {
      emitBare(`created: ${categoryId ?? "-"}  (${flags.name})`);
      return;
    }
    emitResult(response, format);
  },
});
