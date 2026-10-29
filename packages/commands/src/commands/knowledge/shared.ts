// Shared building blocks for the knowledge admin commands.
import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type FlagsDef,
  type RagIndexJobDoc,
  type RagIndexJobStatusResponse,
  type Settings,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";

// The workspace scope is shared with the memory commands, so it lives in
// ../shared/workspace.ts; re-exported here to keep the knowledge imports local.
export { resolveWorkspaceId, WORKSPACE_FLAG } from "../shared/workspace.ts";

// Unified pagination flags for admin list commands. The server-side page/size
// parameter names differ per endpoint (page_number/page_num/pageNum/pageNumber…)
// and the body-vs-query-string placement also varies — each command maps these
// flags to its own API contract. Never pass the flag names through verbatim;
// the CLI-facing flag vocabulary is stable even when the backend is not.
export const PAGE_FLAGS = {
  pageNumber: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page size per request", "zh-CN": "每次请求的分页大小" },
  },
} satisfies FlagsDef;

/** Truncate text-mode table rows to the terminal width; no truncation when not a TTY (pipe/redirect). */
export function truncateLine(line: string): string {
  if (!process.stdout.isTTY) return line;
  const width = process.stdout.columns ?? 120;
  return line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line;
}

// ---- Shared import-job (index_job/status) logic ----
// Verified against the live API: the overall job state lives in `ingestion_status`
// (PENDING/RUNNING/COMPLETED, no FAILED value); the per-document list is `rows[]`
// and failures surface via `rows[].code` (e.g. PARSE_FAILED).
// Shared by doc status / doc upload / kb create — contract changes only touch this file.

/** Overall job state (ingestion_status) */
export function importJobStatus(response: unknown): string {
  return (response as RagIndexJobStatusResponse).data?.ingestion_status ?? "UNKNOWN";
}

/** Per-document failures: rows[].code / status containing FAILED */
export function failedImportDocs(response: RagIndexJobStatusResponse): RagIndexJobDoc[] {
  return (response.data?.rows ?? []).filter((doc) =>
    [doc.code, doc.status].some((value) => typeof value === "string" && value.includes("FAILED")),
  );
}

/**
 * Whether every document has reached a terminal state (FINISH or *FAILED).
 * Used to stop polling before ingestion_status becomes COMPLETED — the server
 * may leave the job on RUNNING indefinitely even after all documents finish.
 */
function allDocsTerminal(response: RagIndexJobStatusResponse): boolean {
  const rows = response.data?.rows ?? [];
  if (rows.length === 0) return false;
  const totalCount = response.data?.total_count;
  if (typeof totalCount === "number" && rows.length < totalCount) return false;
  return rows.every((doc) => {
    const code = doc.code ?? doc.status ?? "";
    return code === "FINISH" || code.includes("FAILED");
  });
}

/** Per-document failure summary: lists both failed and succeeded documents so the user knows the full picture. */
export function importJobFailureMessage(
  response: RagIndexJobStatusResponse,
  fallbackMessage: string,
): string {
  const rows = response.data?.rows ?? [];
  const failed = failedImportDocs(response);
  const failedIds = new Set(failed.map((doc) => doc.doc_id));
  const succeeded = rows.filter((doc) => !failedIds.has(doc.doc_id));

  const failedDetail = failed
    .map((doc) => `${doc.doc_name ?? doc.doc_id ?? "?"}: ${doc.message ?? doc.code ?? "unknown"}`)
    .join("; ");
  const succeededDetail = succeeded.map((doc) => doc.doc_name ?? doc.doc_id ?? "?").join(", ");

  const parts: string[] = [];
  if (failedDetail) parts.push(`failed: ${failedDetail}`);
  if (succeededDetail) parts.push(`succeeded: ${succeededDetail}`);

  return parts.length > 0 ? `${fallbackMessage} (${parts.join("; ")})` : fallbackMessage;
}

/** Build the index_job/status query string (both index_id and job_id are required) */
export function importJobStatusUrl(workspaceId: string, indexId: string, jobId: string): URL {
  const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexJobStatus));
  url.searchParams.set("index_id", indexId);
  url.searchParams.set("job_id", jobId);
  return url;
}

/**
 * Poll the import job until the overall state is COMPLETED or every document
 * has reached a terminal state (FINISH or FAILED). The overall state has no
 * FAILED value, so isFailed is always false — failures are determined by the
 * caller after return via `failedImportDocs`. The server may leave
 * ingestion_status on RUNNING indefinitely after documents finish, so checking
 * rows[] mid-poll avoids a misleading timeout; callers re-check failedImportDocs
 * after return, keeping the error path uniform.
 */
export async function pollImportJob(
  client: Client,
  settings: Settings,
  options: { statusUrl: string; intervalSec: number },
): Promise<RagIndexJobStatusResponse> {
  const deadline = Date.now() + settings.timeout * 1000;
  return poll<RagIndexJobStatusResponse>(client, settings, {
    url: options.statusUrl,
    load: () => readImportJobPages(client, options.statusUrl, deadline),
    intervalSec: options.intervalSec,
    timeoutSec: settings.timeout,
    isComplete: (data) => {
      const response = data as RagIndexJobStatusResponse;
      const total = response.data?.total_count;
      const rows = response.data?.rows ?? [];
      const covered = typeof total === "number" && total >= 0 && rows.length >= total;
      return covered && (importJobStatus(response) === "COMPLETED" || allDocsTerminal(response));
    },
    isFailed: () => false,
    getStatus: (data) => {
      const response = data as RagIndexJobStatusResponse;
      const status = importJobStatus(response);
      const failedCount = failedImportDocs(response).length;
      const total = response.data?.total_count;
      if (typeof total === "number" && total > 0) {
        return `${status} (${failedCount}/${total} failed)`;
      }
      return failedCount > 0 ? `${status} (${failedCount} failed)` : status;
    },
  });
}

/** One bounded polling snapshot: start at page one and retain all unique documents. */
async function readImportJobPages(
  client: Client,
  statusUrl: string,
  deadline: number,
): Promise<RagIndexJobStatusResponse> {
  const url = new URL(statusUrl);
  const requestedSize = Number(url.searchParams.get("page_size") ?? 100);
  const pageSize =
    Number.isInteger(requestedSize) && requestedSize > 0 ? Math.min(requestedSize, 100) : 100;
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("page_number", "1");
  const first = await client.requestJson<RagIndexJobStatusResponse>({
    path: url.toString(),
    method: "GET",
  });
  const documents = new Map<string, RagIndexJobDoc>();
  function addRows(response: RagIndexJobStatusResponse): void {
    for (const document of response.data?.rows ?? []) {
      if (document.doc_id) documents.set(document.doc_id, document);
    }
  }
  addRows(first);
  const total = first.data?.total_count;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    // No total means we cannot prove coverage; leave the snapshot non-terminal.
    return {
      ...first,
      data: { ...first.data, total_count: undefined, rows: [...documents.values()] },
    };
  }
  for (let pageNumber = 2; pageNumber <= Math.ceil(total / pageSize); pageNumber++) {
    if (Date.now() >= deadline) throw new BailianError("Polling timed out.", ExitCode.TIMEOUT);
    url.searchParams.set("page_number", String(pageNumber));
    const page = await client.requestJson<RagIndexJobStatusResponse>({
      path: url.toString(),
      method: "GET",
    });
    const previousSize = documents.size;
    addRows(page);
    if (page.data?.total_count !== total) {
      // A changing result set is not a complete snapshot. Retry from page one.
      return {
        ...first,
        data: { ...first.data, total_count: undefined, rows: [...documents.values()] },
      };
    }
    if (documents.size === previousSize) break;
  }
  return { ...first, data: { ...first.data, rows: [...documents.values()] } };
}

/** Attach a hint for partial-success cases while preserving server context (api/rawResponse kept) */
export function withPartialSuccessHint(error: unknown, hint: string): unknown {
  if (!(error instanceof BailianError)) return error;
  const combinedHint = error.hint ? `${error.hint}\n${hint}` : hint;
  return new BailianError(error.message, error.exitCode, combinedHint, {
    cause: error,
    api: error.api,
    rawResponse: error.rawResponse,
  });
}

/**
 * Read response fields from agent-domain mutation endpoints. Gotcha verified
 * against the live API: create/copy return agent_id etc. inside data, but
 * deploy returns agent_version/agent_status at the top level next to code —
 * the server envelope is inconsistent, so read both locations defensively.
 */
export function agentMutationField(
  response: { data?: Record<string, unknown>; [key: string]: unknown },
  field: "agent_id" | "agent_name" | "agent_version" | "agent_status",
): string | undefined {
  const nested = response.data?.[field];
  if (typeof nested === "string") return nested;
  const topLevel = response[field];
  return typeof topLevel === "string" ? topLevel : undefined;
}
