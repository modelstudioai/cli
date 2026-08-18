import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type RagIndexJobStatusResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, ansi } from "bailian-cli-runtime";
import {
  resolveWorkspaceId,
  PAGE_FLAGS,
  WORKSPACE_FLAG,
  failedImportDocs,
  importJobFailureMessage,
  pollImportJob,
} from "./shared.ts";

const DOC_STATUS_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Import job ID (ingestionId returned by import commands)",
      "zh-CN": "导入任务 ID（导入命令返回的 ingestionId）",
    },
    required: true,
  },
  ...PAGE_FLAGS,
  wait: {
    type: "switch",
    description: {
      "en-US": "Poll until the job reaches a terminal state",
      "zh-CN": "轮询直到任务进入终态",
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

function printStatus(response: RagIndexJobStatusResponse): void {
  const styles = ansi(process.stdout);
  emitBare(`status: ${response.data?.ingestion_status ?? "UNKNOWN"}`);
  for (const doc of response.data?.rows ?? []) {
    const docState = doc.code ?? doc.status ?? "?";
    const line = `  ${doc.doc_id ?? "?"}  ${docState}  ${doc.doc_name ?? ""}`;
    emitBare(docState.includes("FAILED") ? styles.red(line) : line);
  }
}

export default defineCommand({
  description: {
    "en-US": "Check knowledge base import job status",
    "zh-CN": "检查知识库导入任务状态",
  },
  auth: "apiKey",
  usageArgs: "--index-id <id> --job-id <id> [flags]",
  flags: DOC_STATUS_FLAGS,
  notes: [
    {
      "en-US": "Both --index-id and --job-id are required (passing only one returns SystemError).",
      "zh-CN": "--index-id 和 --job-id 均为必填（只传其中一个会返回 SystemError）。",
    },
    {
      "en-US":
        "If you see a SystemError, the job may not exist — check the ingestion id in the document list output.",
      "zh-CN": "如果出现 SystemError，任务可能不存在——请检查文档列表输出中的 ingestion ID。",
    },
    {
      "en-US":
        "Overall job states are PENDING / RUNNING / COMPLETED; per-document failures (for example PARSE_FAILED) exit non-zero with the error message passed through.",
      "zh-CN":
        "任务整体状态为 PENDING / RUNNING / COMPLETED；单个文档失败（例如 PARSE_FAILED）时会以非零状态退出，并原样透传错误信息。",
    },
  ],
  exampleArgs: [
    "--index-id idx-xxx --job-id job-xxx --workspace-id ws-xxx",
    "--index-id idx-xxx --job-id job-xxx --wait --poll-interval 10",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // Both required flags are enforced by the parser up front; parameters go in
    // the query string (they are ignored in the body)
    const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexJobStatus));
    url.searchParams.set("index_id", flags.indexId);
    url.searchParams.set("job_id", flags.jobId);
    if (flags.pageNumber !== undefined) {
      url.searchParams.set("page_number", String(flags.pageNumber));
    }
    if (flags.pageSize !== undefined) {
      url.searchParams.set("page_size", String(flags.pageSize));
    }
    const endpoint = url.toString();

    if (settings.dryRun) {
      emitResult({ endpoint, request: null }, format);
      return;
    }

    let response: RagIndexJobStatusResponse;
    if (flags.wait) {
      // Reuse the shared polling (timeout → TIMEOUT(5)); failure detection happens
      // uniformly after return, based on per-document status
      response = await pollImportJob(ctx.client, settings, {
        statusUrl: endpoint,
        intervalSec: flags.pollInterval ?? 5,
      });
    } else {
      response = await ctx.client.requestJson<RagIndexJobStatusResponse>({
        path: endpoint,
        method: "GET",
      });
    }

    // Any per-document failure means a non-zero exit; the server message is passed through verbatim
    if (failedImportDocs(response).length > 0) {
      throw new BailianError(
        importJobFailureMessage(response, "Import job reported document failures."),
        ExitCode.GENERAL,
      );
    }

    if (settings.quiet) {
      emitBare(response.data?.ingestion_status ?? "UNKNOWN");
      return;
    }
    if (format === "text") {
      printStatus(response);
    } else {
      emitResult(response, format);
    }
  },
});
