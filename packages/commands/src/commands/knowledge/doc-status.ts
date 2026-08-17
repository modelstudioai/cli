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
    description: "Knowledge base ID",
    required: true,
  },
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Import job ID (ingestionId returned by import commands)",
    required: true,
  },
  ...PAGE_FLAGS,
  wait: { type: "switch", description: "Poll until the job reaches a terminal state" },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: "Polling interval when waiting (default: 5)",
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
  description: "Check knowledge base import job status",
  auth: "apiKey",
  usageArgs: "--index-id <id> --job-id <id> [flags]",
  flags: DOC_STATUS_FLAGS,
  notes: [
    "Both --index-id and --job-id are required (passing only one returns SystemError).",
    "If you see a SystemError, the job may not exist — check the ingestion id in the document list output.",
    "Overall job states are PENDING / RUNNING / COMPLETED; per-document failures (for example PARSE_FAILED) exit non-zero with the error message passed through.",
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
