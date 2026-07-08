import {
  defineCommand,
  detectOutputFormat,
  getFineTuneLogs,
  type Client,
  type FineTuneLogEntry,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

/**
 * Render a single log entry as a single line (mirrors the flatten logic used
 * for non-search text output: prefer common fields, fall back to JSON).
 */
function renderEntry(entry: FineTuneLogEntry | string): string {
  if (typeof entry === "string") return entry;
  const record = entry as Record<string, unknown>;
  const ts = (record.timestamp ?? record.time ?? record.create_time ?? "") as string;
  const level = (record.level ?? "") as string;
  const msg = (record.message ?? record.msg ?? record.log ?? "") as string;
  if (msg || ts || level) {
    return [ts, level, msg].filter(Boolean).join("\t");
  }
  return JSON.stringify(entry);
}

/**
 * Case-insensitive substring match. String entries match against themselves;
 * object entries match against their rendered form (so timestamp / level /
 * message are all searchable).
 */
function entryMatches(entry: FineTuneLogEntry | string, keywordLower: string): boolean {
  return renderEntry(entry).toLowerCase().includes(keywordLower);
}

/**
 * Page through every log page for a job (server reports `total`), returning
 * the full ordered entry list. Used when filtering by `--search` across the
 * complete log rather than a single page.
 */
async function fetchAllLogs(
  client: Client,
  jobId: string,
  pageSize: number,
): Promise<{ entries: Array<FineTuneLogEntry | string>; total: number }> {
  const entries: Array<FineTuneLogEntry | string> = [];
  let pageNo = 1;
  let total = 0;
  // Hard cap to avoid an unbounded loop if the server misreports `total`.
  const maxPages = 200;
  for (let i = 0; i < maxPages; i++) {
    const response = await getFineTuneLogs(client, jobId, { pageNo, pageSize });
    const payload = response.output ?? response.data;
    const page = payload?.logs ?? [];
    total = payload?.total ?? total;
    if (page.length === 0) break;
    entries.push(...page);
    // Stop once we've collected everything the server claims exists.
    if (total && entries.length >= total) break;
    if (page.length < pageSize) break;
    pageNo++;
  }
  return { entries, total };
}

const LOGS_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
  page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: "Lines per page (default: server-defined)",
  },
  search: {
    type: "string",
    valueHint: "<keyword>",
    description:
      "Case-insensitive substring filter. When set, all log pages are fetched and filtered client-side (--page is ignored).",
  },
  tail: {
    type: "number",
    valueHint: "<n>",
    description:
      "Keep only the last N entries. When set, all log pages are fetched and the trailing N are kept (--page is ignored).",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Fetch training logs for a fine-tune job",
  auth: "apiKey",
  usageArgs: "--job-id <id> [--page <n>] [--page-size <n>] [--search <keyword>] [--tail <n>]",
  flags: LOGS_FLAGS,
  exampleArgs: [
    "--job-id ft-xxx",
    "--job-id ft-xxx --page-size 100 --output json",
    "--job-id ft-xxx --search checkpoint",
    "--job-id ft-xxx --search error --output json",
    "--job-id ft-xxx --tail 20",
    "--job-id ft-xxx --search checkpoint --tail 5",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const pageNo = flags.page;
    const pageSize = flags.pageSize;
    const search = flags.search || undefined;
    const tail = flags.tail;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          action: "finetune.logs",
          job_id: jobId,
          page: pageNo,
          page_size: pageSize,
          search,
          tail,
        },
        format,
      );
      return;
    }

    // --search / --tail both need the full log: fan out across every page,
    // then filter (search) and/or take the trailing N (tail) client-side.
    if (search || tail !== undefined) {
      const { entries, total } = await fetchAllLogs(ctx.client, jobId, pageSize ?? 100);

      // Apply --search first: narrow to the matching entries.
      let scanned = entries;
      let matched: number | undefined;
      if (search) {
        const keywordLower = search.toLowerCase();
        scanned = entries.filter((entry) => entryMatches(entry, keywordLower));
        matched = scanned.length;
      }

      // Then apply --tail: keep the trailing N of whatever remains.
      const tailApplied =
        tail !== undefined && tail >= 0 ? Math.min(tail, scanned.length) : undefined;
      const result =
        tailApplied !== undefined ? scanned.slice(scanned.length - tailApplied) : scanned;

      if (settings.quiet || format === "text") {
        if (result.length === 0) {
          emitBare(search ? `No logs matched "${search}".` : "No logs returned.");
          return;
        }
        for (const entry of result) emitBare(renderEntry(entry));
        const parts: string[] = [`${result.length} shown`];
        if (matched !== undefined) parts.push(`matched ${matched}`);
        parts.push(`of ${entries.length}` + (total ? ` (total ${total})` : ""));
        emitBare(`\n${parts.join(", ")}`);
        return;
      }
      emitResult(
        {
          ...(matched !== undefined ? { matched } : {}),
          scanned: entries.length,
          total: total || entries.length,
          ...(search ? { search } : {}),
          ...(tailApplied !== undefined ? { tail: tailApplied } : {}),
          logs: result,
        },
        format,
      );
      return;
    }

    // Default: single page, verbatim response.
    const response = await getFineTuneLogs(ctx.client, jobId, { pageNo, pageSize });
    const payload = response.output ?? response.data;
    const logs = payload?.logs ?? [];

    if (settings.quiet || format === "text") {
      if (logs.length === 0) {
        emitBare("No logs returned.");
        return;
      }
      for (const entry of logs) {
        emitBare(renderEntry(entry));
      }
      if (payload?.total !== undefined) emitBare(`\nTotal: ${payload.total}`);
    } else {
      emitResult(response, format);
    }
  },
});
