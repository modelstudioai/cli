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

// Knowledge APIs use a workspace-specific host, so --workspace-id is a per-command
// flag here (the console credential scope does not apply).
export const WORKSPACE_FLAG = {
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: "Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)",
  },
} satisfies FlagsDef;

// Unified pagination flags for admin list commands. The server-side page/size
// parameter names differ per endpoint (page_number/page_num/pageNum/pageNumber…)
// and the body-vs-query-string placement also varies — each command maps these
// flags to its own API contract. Never pass the flag names through verbatim;
// the CLI-facing flag vocabulary is stable even when the backend is not.
export const PAGE_FLAGS = {
  pageNumber: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
  pageSize: { type: "number", valueHint: "<n>", description: "Page size per request" },
} satisfies FlagsDef;

/** Three-level fallback: flag > BAILIAN_WORKSPACE_ID env > config (env/config are merged into settings); missing → USAGE. */
export function resolveWorkspaceId(ctx: {
  flags: { workspaceId?: string };
  settings: { workspaceId?: string };
  identity: { binName: string };
}): string {
  const workspaceId = ctx.flags.workspaceId || ctx.settings.workspaceId;
  if (!workspaceId) {
    throw new BailianError(
      "Workspace ID is required.",
      ExitCode.USAGE,
      `Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: ${ctx.identity.binName} config set workspace_id <id>`,
    );
  }
  return workspaceId;
}

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
  return poll<RagIndexJobStatusResponse>(client, settings, {
    url: options.statusUrl,
    intervalSec: options.intervalSec,
    timeoutSec: settings.timeout,
    isComplete: (data) => {
      const response = data as RagIndexJobStatusResponse;
      return importJobStatus(response) === "COMPLETED" || allDocsTerminal(response);
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

/** Attach a hint for partial-success cases while preserving server context (api/rawResponse kept) */
export function withPartialSuccessHint(error: unknown, hint: string): unknown {
  if (!(error instanceof BailianError) || error.hint) return error;
  return new BailianError(error.message, error.exitCode, hint, {
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
