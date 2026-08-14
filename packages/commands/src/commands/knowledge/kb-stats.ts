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
    description:
      "Range start: Unix seconds or ISO date, must be in the past (default: 24 hours ago)",
  },
  end: {
    type: "string",
    valueHint: "<time>",
    description: "Range end: Unix seconds or ISO date, must be in the past (default: now)",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Normalize time input to a second-precision string (the API requires seconds as a string). Accepts Unix seconds or an ISO date. */
export function toEpochSecondsString(input: string): string {
  if (/^\d+$/.test(input)) {
    // Digits-only input is treated as Unix seconds; 13-digit millisecond timestamps are reduced to seconds
    return input.length >= 13 ? String(Math.floor(Number(input) / 1000)) : input;
  }
  // Non-numeric input must be a full ISO date (YYYY-MM-DD, optionally with a time
  // part). Date.parse alone is too lenient — V8 silently reads truncated input
  // like "2026-" as Jan 1st, which would query a misleading range.
  const parsedMs = /^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(input) ? Date.parse(input) : Number.NaN;
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
    "Future timestamps are rejected for --start and clamped to now for --end, since the monitor API only returns past data.",
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
    let endTimestamp = flags.end ? toEpochSecondsString(flags.end) : String(nowSeconds);

    // The monitor API rejects future timestamps with a misleading
    // "missing or invalid" error — validate here with a clear message.
    if (Number(startTimestamp) > nowSeconds) {
      throw new BailianError(
        `Start time is in the future; the monitor API only accepts past or current timestamps.`,
        ExitCode.USAGE,
        "Use a start date/time at or before now, or omit --start to default to 24 hours ago.",
      );
    }
    const clampedEnd = Number(endTimestamp) > nowSeconds;
    if (clampedEnd) {
      endTimestamp = String(nowSeconds);
    }

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

    if (format !== "text") {
      emitResult(response, format);
      return;
    }
    if (clampedEnd) {
      emitBare("note: end time was in the future, clamped to now.");
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
