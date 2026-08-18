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
    description: { "en-US": "Category name (1-20 chars)", "zh-CN": "类目名称（1–20 个字符）" },
    required: true,
  },
  parentId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Create as a sub-category of this category",
      "zh-CN": "创建为该类目的子类目",
    },
  },
  collectionId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Create under this collection (defaults to the platform collection)",
      "zh-CN": "在该数据集合下创建（默认为平台数据集合）",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Create a data-center category", "zh-CN": "创建数据中心类目" },
  auth: "apiKey",
  usageArgs: "--name <text> [flags]",
  flags: CATEGORY_ADD_FLAGS,
  notes: [
    {
      "en-US": "Use categories to organize data-center files by business domain.",
      "zh-CN": "使用类目按业务领域组织数据中心文件。",
    },
  ],
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
