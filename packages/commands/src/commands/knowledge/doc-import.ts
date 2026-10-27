import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type RagJobCreateResponse,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  WORKSPACE_FLAG,
  resolveWorkspaceId,
  importJobStatusUrl,
  pollImportJob,
  failedImportDocs,
  importJobFailureMessage,
  withPartialSuccessHint,
} from "./shared.ts";

const FLAGS = {
  chunkMode: {
    type: "string",
    valueHint: "<mode>",
    choices: ["h1", "h2", "h3", "h4", "h5", "length", "page", "regex"] as const,
    description: {
      "en-US": "Document chunk mode (not video time slicing)",
      "zh-CN": "文档切片模式（不是视频时间切片）",
    },
  },
  chunkSize: {
    type: "number",
    valueHint: "<characters>",
    description: {
      "en-US": "Document chunk size, 1-6000 characters",
      "zh-CN": "文档切片大小，1–6000 字符",
    },
  },
  overlapSize: {
    type: "number",
    valueHint: "<characters>",
    description: {
      "en-US": "Document overlap size, 0-1024 characters",
      "zh-CN": "文档切片重叠，0–1024 字符",
    },
  },
  separator: {
    type: "string",
    valueHint: "<regex>",
    description: { "en-US": "Separator for regex chunk mode", "zh-CN": "regex 切片模式的分隔符" },
  },
  enableHeaders: {
    type: "boolean",
    valueHint: "<true|false>",
    description: { "en-US": "Enable document header extraction", "zh-CN": "启用文档标题提取" },
  },
  indexId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Existing knowledge base ID", "zh-CN": "已有知识库 ID" },
  },
  docId: {
    type: "array",
    valueHint: "<fileId>",
    description: {
      "en-US": "Existing data-center file ID (repeatable; excludes --category-id)",
      "zh-CN": "已有数据中心 fileId（可重复，与 --category-id 互斥）",
    },
  },
  categoryId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Data-center category ID (repeatable; excludes --doc-id)",
      "zh-CN": "数据中心类目 ID（可重复，与 --doc-id 互斥）",
    },
  },
  wait: {
    type: "switch",
    description: { "en-US": "Wait for the import job to finish", "zh-CN": "等待导入任务完成" },
  },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval (default: 5 seconds)",
      "zh-CN": "轮询间隔（默认 5 秒）",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Import existing data-center files into an existing knowledge base",
    "zh-CN": "将已有数据中心文件导入已有知识库",
  },
  auth: "apiKey",
  flags: FLAGS,
  usageArgs: "--index-id <id> (--doc-id <fileId> ... | --category-id <id> ...) [flags]",
  exampleArgs: [
    "--index-id idx-xxx --doc-id file-xxx --wait",
    "--index-id idx-xxx --category-id category-xxx --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Reuses file IDs without uploading again. Importing may start parsing and indexing. --doc-id takes a data-center fileId.",
      "zh-CN": "复用 fileId，无需重新上传。导入可能触发解析和索引。--doc-id 传入数据中心 fileId。",
    },
  ],
  validate(flags) {
    if (
      flags.chunkSize !== undefined &&
      (!Number.isInteger(flags.chunkSize) || flags.chunkSize < 1 || flags.chunkSize > 6000)
    )
      return {
        "en-US": "--chunk-size must be an integer from 1 to 6000.",
        "zh-CN": "--chunk-size 必须为 1 到 6000 的整数。",
      };
    if (
      flags.overlapSize !== undefined &&
      (!Number.isInteger(flags.overlapSize) || flags.overlapSize < 0 || flags.overlapSize > 1024)
    )
      return {
        "en-US": "--overlap-size must be an integer from 0 to 1024.",
        "zh-CN": "--overlap-size 必须为 0 到 1024 的整数。",
      };
    if (flags.chunkMode === "length" && flags.chunkSize === undefined)
      return {
        "en-US": "length mode requires --chunk-size.",
        "zh-CN": "length 模式需要 --chunk-size。",
      };
    if (flags.chunkMode === "regex" && !flags.separator)
      return {
        "en-US": "regex mode requires --separator.",
        "zh-CN": "regex 模式需要 --separator。",
      };
    if (!!flags.docId?.length === !!flags.categoryId?.length)
      return {
        "en-US": "Provide exactly one of --doc-id or --category-id.",
        "zh-CN": "必须且只能指定 --doc-id 或 --category-id 中的一种。",
      };
    if ([...(flags.docId ?? []), ...(flags.categoryId ?? [])].some((value) => !value.trim()))
      return { "en-US": "Source IDs cannot be empty.", "zh-CN": "来源 ID 不能为空。" };
    if (
      flags.pollInterval !== undefined &&
      (!Number.isFinite(flags.pollInterval) || flags.pollInterval <= 0)
    )
      return {
        "en-US": "--poll-interval must be positive.",
        "zh-CN": "--poll-interval 必须为正数。",
      };
    return undefined;
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.indexJobCreate);
    const request = {
      indexId: flags.indexId,
      ...(flags.chunkMode !== undefined ? { chunkMode: flags.chunkMode } : {}),
      ...(flags.chunkSize !== undefined ? { chunkSize: flags.chunkSize } : {}),
      ...(flags.overlapSize !== undefined ? { overlapSize: flags.overlapSize } : {}),
      ...(flags.separator !== undefined ? { separator: flags.separator } : {}),
      ...(flags.enableHeaders !== undefined ? { enableHeaders: flags.enableHeaders } : {}),
      ...(flags.docId?.length
        ? { sourceType: "DATA_CENTER_FILE", docIds: flags.docId }
        : { sourceType: "DATA_CENTER_CATEGORY", categoryIds: flags.categoryId }),
    };
    const format = detectOutputFormat(settings.output);
    if (settings.dryRun) {
      emitResult({ endpoint, request }, format);
      return;
    }
    const response = await ctx.client.requestJson<RagJobCreateResponse>({
      path: endpoint,
      method: "POST",
      body: request,
    });
    const ingestionId = response.data?.ingestionId;
    if (!ingestionId)
      throw new BailianError(
        ctx.localize({
          "en-US": "Import response did not contain an ingestionId.",
          "zh-CN": "导入响应未包含 ingestionId。",
        }),
        ExitCode.GENERAL,
      );
    let status;
    if (flags.wait) {
      try {
        status = await pollImportJob(ctx.client, settings, {
          statusUrl: importJobStatusUrl(workspaceId, flags.indexId, ingestionId).toString(),
          intervalSec: flags.pollInterval ?? 5,
        });
        if (failedImportDocs(status).length)
          throw new BailianError(
            importJobFailureMessage(
              status,
              ctx.localize({
                "en-US": "Import reported document failures.",
                "zh-CN": "导入任务中有文件失败。",
              }),
            ),
            ExitCode.GENERAL,
          );
      } catch (error) {
        throw withPartialSuccessHint(
          error,
          `indexId: ${flags.indexId}; ingestionId: ${ingestionId}`,
        );
      }
    }
    if (settings.quiet) {
      emitBare(ingestionId);
      return;
    }
    if (format === "text") {
      emitBare(`ingestionId: ${ingestionId}`);
      if (status) emitBare(`status: ${status.data?.ingestion_status ?? "UNKNOWN"}`);
      return;
    }
    emitResult({ ...response, ...(status ? { status } : {}) }, format);
  },
});
