import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagListFileResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, truncateLine, WORKSPACE_FLAG } from "./shared.ts";

const FILE_LIST_FLAGS = {
  categoryId: {
    type: "string",
    valueHint: "<id>",
    description: "Category to list (find ids via the category list command)",
    required: true,
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: "Filter by file name",
  },
  fileId: {
    type: "array",
    valueHint: "<id>",
    description: "Filter by file ID (repeatable)",
  },
  nextToken: {
    type: "string",
    valueHint: "<token>",
    description: "Cursor for the next page (from previous output)",
  },
  maxResult: {
    type: "number",
    valueHint: "<n>",
    description: "Items per page",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "List files in a data-center category",
  auth: "apiKey",
  usageArgs: "--category-id <id> [flags]",
  flags: FILE_LIST_FLAGS,
  notes: [
    "A real category id is required — the default value is not resolved here. Find the id via the category list command.",
    "Pagination is cursor-based: reuse the printed next token to continue.",
  ],
  exampleArgs: [
    "--category-id cate-xxx --workspace-id ws-xxx",
    "--category-id cate-xxx --name report",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = {
      categoryId: flags.categoryId,
      ...(flags.name ? { fileName: flags.name } : {}),
      ...(flags.fileId?.length ? { fileIds: flags.fileId } : {}),
      ...(flags.nextToken ? { nextToken: flags.nextToken } : {}),
      ...(flags.maxResult !== undefined ? { maxResult: flags.maxResult } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.listFile);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagListFileResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const files = response.data?.fileList ?? [];
    if (settings.quiet) {
      for (const file of files) emitBare(file.fileId ?? "");
      return;
    }
    if (format === "text") {
      if (files.length === 0) {
        emitBare("No files found.");
      } else {
        for (const file of files) {
          emitBare(
            truncateLine(
              [file.fileId, file.status ?? "-", file.fileName, file.sizeBytes ?? "-"].join("  "),
            ),
          );
        }
      }
      const nextToken = response.data?.nextToken;
      if (nextToken) emitBare(`next: --next-token ${nextToken}`);
    } else {
      emitResult(response, format);
    }
  },
});
