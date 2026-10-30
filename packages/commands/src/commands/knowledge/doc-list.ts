import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagIndexFilesResponse,
  type RagIndexFileDetailsResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, ansi } from "bailian-cli-runtime";
import { resolveWorkspaceId, truncateLine, PAGE_FLAGS, WORKSPACE_FLAG } from "./shared.ts";

const DOC_LIST_FLAGS = {
  details: {
    type: "switch",
    description: {
      "en-US": "Include file-level chunk configuration (page size up to 10)",
      "zh-CN": "查询文件级切片配置（每页最多 10 条）",
    },
  },
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  ...PAGE_FLAGS,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List documents in a knowledge base with parse/index status",
    "zh-CN": "列出知识库文档及其解析/索引状态",
  },
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: DOC_LIST_FLAGS,
  notes: [
    {
      "en-US":
        "Documents with status FAILED are highlighted in text mode — use the import job status command to inspect failures.",
      "zh-CN": "文本模式会突出显示状态为 FAILED 的文档——请使用导入任务状态命令检查失败详情。",
    },
    {
      "en-US": "Page size defaults to 10; max 100 normally, or 10 with --details.",
      "zh-CN": "分页大小默认 10；通常最大 100，--details 模式最大 10。",
    },
  ],
  exampleArgs: ["--index-id idx-xxx --workspace-id ws-xxx", "--index-id idx-xxx --page-size 100"],
  validate(flags) {
    const maximum = flags.details ? 10 : 100;
    if (
      flags.pageSize !== undefined &&
      (!Number.isInteger(flags.pageSize) || flags.pageSize < 1 || flags.pageSize > maximum)
    ) {
      return {
        "en-US": `--page-size must be an integer between 1 and ${maximum}.`,
        "zh-CN": `--page-size 必须为 1 到 ${maximum} 之间的整数。`,
      };
    }
    if (
      flags.pageNumber !== undefined &&
      (!Number.isInteger(flags.pageNumber) || flags.pageNumber < 1)
    ) {
      return {
        "en-US": "--page-number must be a positive integer.",
        "zh-CN": "--page-number 必须为正整数。",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // Gotcha: this endpoint's page parameter is page_num (not page_number)
    const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexFiles));
    url.searchParams.set("index_id", flags.indexId);
    url.searchParams.set("page_num", String(flags.pageNumber ?? 1));
    url.searchParams.set("page_size", String(flags.pageSize ?? 10));
    const endpoint = flags.details
      ? ragEndpoint(workspaceId, RAG_PATHS.indexFileDetails)
      : url.toString();
    const request = flags.details
      ? {
          indexId: flags.indexId,
          pageNumber: flags.pageNumber ?? 1,
          pageSize: flags.pageSize ?? 10,
        }
      : null;

    if (settings.dryRun) {
      emitResult({ endpoint, request }, format);
      return;
    }

    const response = await ctx.client.requestJson<
      RagIndexFilesResponse | RagIndexFileDetailsResponse
    >({
      path: endpoint,
      method: flags.details ? "POST" : "GET",
      ...(request ? { body: request } : {}),
    });

    const rows = response.data?.rows ?? [];
    if (settings.quiet) {
      for (const row of rows) emitBare(row.doc_id ?? "");
      return;
    }
    if (format === "text") {
      const styles = ansi(process.stdout);
      if (rows.length === 0) {
        emitBare("No documents found.");
      } else {
        for (const row of rows) {
          const line = truncateLine(
            [row.doc_id, row.status, row.doc_name, row.doc_type ?? "-", row.size ?? "-"].join("  "),
          );
          emitBare(row.status === "FAILED" ? styles.red(line) : line);
          if (flags.details) {
            for (const key of [
              "chunkSize",
              "overlapSize",
              "separator",
              "chunkMode",
              "enableHeaders",
            ]) {
              emitBare(
                `  ${key}: ${row[key] === undefined || row[key] === null ? "-" : JSON.stringify(row[key])}`,
              );
            }
          }
        }
      }
      emitBare(`total: ${response.data?.total_count ?? rows.length}`);
    } else {
      emitResult(response, format);
    }
  },
});
