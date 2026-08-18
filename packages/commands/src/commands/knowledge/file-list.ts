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
    description: {
      "en-US": "Category to list (find ids via the category list command); exact match",
      "zh-CN": "要列出文件的类目（通过类目列表命令查找 ID）；精确匹配",
    },
    required: true,
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Filter by exact file name without its extension (a.md → pass a)",
      "zh-CN": "按不含扩展名的文件名精确筛选（a.md 应传入 a）",
    },
  },
  fileId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Filter by exact file ID (repeatable)",
      "zh-CN": "按文件 ID 精确筛选（可重复）",
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
    description: { "en-US": "Items per page", "zh-CN": "每页条目数" },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List files in a data-center category",
    "zh-CN": "列出数据中心类目中的文件",
  },
  auth: "apiKey",
  usageArgs: "--category-id <id> [flags]",
  flags: FILE_LIST_FLAGS,
  notes: [
    {
      "en-US":
        "A real category id is required — the default value is not resolved here. Find the id via the category list command.",
      "zh-CN": "必须提供真实的类目 ID——此处不会解析 default 值。请通过类目列表命令查找 ID。",
    },
    {
      "en-US":
        "--name matches the exact file name without its extension (for a.md pass a); partial keywords return no results.",
      "zh-CN": "--name 精确匹配不含扩展名的文件名（a.md 应传入 a）；部分关键字不会返回结果。",
    },
    {
      "en-US": "Pagination is cursor-based: reuse the printed next token to continue.",
      "zh-CN": "分页使用游标：复用输出中的 next token 继续查询。",
    },
  ],
  exampleArgs: [
    "--category-id cate-xxx --workspace-id ws-xxx",
    {
      "en-US": "--category-id cate-xxx --name report",
      "zh-CN": "--category-id cate-xxx --name 报告",
    },
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
