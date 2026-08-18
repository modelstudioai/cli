import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type RagCreateIndexV2Response,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  resolveWorkspaceId,
  WORKSPACE_FLAG,
  failedImportDocs,
  importJobFailureMessage,
  importJobStatus,
  importJobStatusUrl,
  pollImportJob,
} from "./shared.ts";

const KB_CREATE_FLAGS = {
  name: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Knowledge base name (1-20 chars, unique in workspace)",
      "zh-CN": "知识库名称（1–20 个字符，在 Workspace 中唯一）",
    },
    required: true,
  },
  docId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Data-center file id to import (repeatable); mutually exclusive with --category-id",
      "zh-CN": "要导入的数据中心文件 ID（可重复）；不能与 --category-id 同时使用",
    },
  },
  categoryId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US":
        "Import every file under this category (repeatable); mutually exclusive with --doc-id",
      "zh-CN": "导入该类目下的所有文件（可重复）；不能与 --doc-id 同时使用",
    },
  },
  embeddingModel: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Embedding model name (default: text-embedding-v4)",
      "zh-CN": "Embedding 模型名称（默认：text-embedding-v4）",
    },
  },
  chunkSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Chunk size in characters (default: 600, recommended 300-800)",
      "zh-CN": "Chunk 字符数（默认：600，建议：300–800）",
    },
  },
  wait: {
    type: "switch",
    description: {
      "en-US": "Poll the initial import job to a terminal state",
      "zh-CN": "轮询初始导入任务直到进入终态",
    },
  },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval when waiting (default: 5)",
      "zh-CN": "等待时的轮询间隔（默认：5）",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** sourceType/docIds/categoryIds derivation, centralized for unit testing (gotcha: the parameter is docIds, not fileIds) */
export function buildDataSourceFields(flags: { docId?: string[]; categoryId?: string[] }): {
  sourceType: string;
  docIds?: string[];
  categoryIds?: string[];
  dataSources: Array<{ sourceType: string }>;
} {
  if (flags.docId?.length) {
    return {
      sourceType: "DATA_CENTER_FILE",
      docIds: flags.docId,
      dataSources: [{ sourceType: "DATA_CENTER_FILE" }],
    };
  }
  return {
    sourceType: "DATA_CENTER_CATEGORY",
    categoryIds: flags.categoryId,
    dataSources: [{ sourceType: "DATA_CENTER_CATEGORY" }],
  };
}

export default defineCommand({
  description: {
    "en-US": "Create a knowledge base and import data-center files or categories",
    "zh-CN": "创建知识库并导入数据中心文件或类目",
  },
  auth: "apiKey",
  usageArgs: "--name <text> (--doc-id <id> | --category-id <id>) [flags]",
  flags: KB_CREATE_FLAGS,
  notes: [
    {
      "en-US":
        "Structure/sink types are fixed to the default document knowledge base (unstructured, BUILT_IN storage).",
      "zh-CN": "结构和存储类型固定为默认文档知识库（unstructured、BUILT_IN 存储）。",
    },
    {
      "en-US":
        "Returns the knowledge base id (pipelineId) and the initial import job id (ingestionId).",
      "zh-CN": "返回知识库 ID（pipelineId）和初始导入任务 ID（ingestionId）。",
    },
    {
      "en-US": "Use the import job status command (or --wait) to track the initial import.",
      "zh-CN": "使用导入任务状态命令（或 --wait）跟踪初始导入。",
    },
  ],
  exampleArgs: [
    "--name demo --doc-id file-xxx --workspace-id ws-xxx",
    "--name demo --category-id cate-xxx --wait",
  ],
  validate(flags) {
    if (flags.name.length < 1 || flags.name.length > 20) return "--name must be 1-20 characters";
    const hasDocIds = !!flags.docId?.length;
    const hasCategoryIds = !!flags.categoryId?.length;
    if (hasDocIds && hasCategoryIds) return "Use either --doc-id or --category-id, not both";
    if (!hasDocIds && !hasCategoryIds)
      return "Provide --doc-id or --category-id as the data source";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // Fixed values, not exposed as flags in this version: structureType unstructured, sinkType BUILT_IN.
    // Note: the public docs' example uses sinkType DEFAULT, but BUILT_IN is what works against the live API.
    const body = {
      name: flags.name,
      structureType: "unstructured",
      sinkType: "BUILT_IN",
      embeddingModelName: flags.embeddingModel ?? "text-embedding-v4",
      chunkSize: flags.chunkSize ?? 600,
      ...buildDataSourceFields(flags),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.indexCreateV2);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagCreateIndexV2Response>({
      path: endpoint,
      method: "POST",
      body,
    });
    const pipelineId = response.data?.pipelineId;
    const ingestionId = response.data?.ingestionId;

    let finalStatus: string | undefined;
    if (flags.wait && pipelineId && ingestionId) {
      const statusResponse = await pollImportJob(ctx.client, settings, {
        statusUrl: importJobStatusUrl(workspaceId, pipelineId, ingestionId).toString(),
        intervalSec: flags.pollInterval ?? 5,
      });
      finalStatus = importJobStatus(statusResponse);
      // Job finished but some documents failed to parse → non-zero exit, server message
      // passed through verbatim (the knowledge base was created; its id goes in the hint)
      if (failedImportDocs(statusResponse).length > 0) {
        throw new BailianError(
          importJobFailureMessage(statusResponse, "Initial import reported document failures."),
          ExitCode.GENERAL,
          `Knowledge base created: ${pipelineId}`,
          { api: { requestId: statusResponse.request_id } },
        );
      }
    }

    if (settings.quiet) {
      emitBare(pipelineId ?? "");
      return;
    }
    if (format === "text") {
      emitBare(`index_id: ${pipelineId ?? "-"}`);
      if (ingestionId) emitBare(`ingestion_id: ${ingestionId}`);
      if (finalStatus) emitBare(`status: ${finalStatus}`);
      emitBare("Next: check the import job status, then search against this knowledge base.");
      return;
    }
    emitResult(finalStatus ? { ...response, final_status: finalStatus } : response, format);
  },
});
