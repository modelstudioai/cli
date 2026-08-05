import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type RagMonitorResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const KB_STATS_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  start: {
    type: "string",
    valueHint: "<time>",
    description: "Range start: Unix seconds or ISO date (default: 24 hours ago)",
  },
  end: {
    type: "string",
    valueHint: "<time>",
    description: "Range end: Unix seconds or ISO date (default: now)",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Normalize time input to a second-precision string (the API requires seconds as a string). Accepts Unix seconds or an ISO date. */
export function toEpochSecondsString(input: string): string {
  if (/^\d+$/.test(input)) {
    // Digits-only input is treated as Unix seconds; 13-digit millisecond timestamps are reduced to seconds
    return input.length >= 13 ? String(Math.floor(Number(input) / 1000)) : input;
  }
  const parsedMs = Date.parse(input);
  if (Number.isNaN(parsedMs)) {
    throw new BailianError(
      `Invalid time value: ${input}`,
      ExitCode.USAGE,
      "Pass Unix seconds (e.g. 1780900000) or an ISO date (e.g. 2026-07-30T00:00:00Z).",
    );
  }
  return String(Math.floor(parsedMs / 1000));
}

export default defineCommand({
  description: "Show knowledge base storage and QPS monitoring data",
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: KB_STATS_FLAGS,
  notes: [
    "Defaults to the last 24 hours when --start/--end are omitted.",
    "Timestamps are normalized to epoch seconds as required by the server.",
  ],
  exampleArgs: [
    "--index-id idx-xxx --workspace-id ws-xxx",
    "--index-id idx-xxx --start 2026-07-30 --end 2026-07-31",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const startTimestamp = flags.start
      ? toEpochSecondsString(flags.start)
      : String(nowSeconds - 24 * 3600);
    const endTimestamp = flags.end ? toEpochSecondsString(flags.end) : String(nowSeconds);

    const body = { indexId: flags.indexId, startTimestamp, endTimestamp };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.indexMonitor);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagMonitorResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet || format !== "text") {
      emitResult(response, format === "text" ? "json" : format);
      return;
    }
    // Shape verified against the live API: the monitor fields are objects, not arrays
    const storage = response.data?.storageMonitorData;
    const qps = response.data?.qpsMonitorData;
    emitBare(`plan: ${response.data?.pipelineCommercialType ?? "-"}`);
    emitBare(
      `storage: ${storage?.indexStorageUsage ?? "-"} / ${storage?.indexStorageLimit ?? "-"}`,
    );
    emitBare(`peak qps: ${qps?.peakQps ?? "-"}`);
    emitBare(`qps windows: ${qps?.monitorData?.length ?? 0} data point(s)`);
  },
});
