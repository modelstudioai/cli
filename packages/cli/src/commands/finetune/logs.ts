import {
  defineCommand,
  detectOutputFormat,
  getFineTuneLogs,
  type Config,
  type GlobalFlags,
  type FineTuneLogEntry,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

/**
 * Render a single log entry as a single line (mirrors the flatten logic used
 * for non-search text output: prefer common fields, fall back to JSON).
 */
function renderEntry(entry: FineTuneLogEntry | string): string {
  if (typeof entry === "string") return entry;
  const e = entry as Record<string, unknown>;
  const ts = (e.timestamp ?? e.time ?? e.create_time ?? "") as string;
  const level = (e.level ?? "") as string;
  const msg = (e.message ?? e.msg ?? e.log ?? "") as string;
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
  config: Config,
  jobId: string,
  pageSize: number,
): Promise<{ entries: Array<FineTuneLogEntry | string>; total: number }> {
  const entries: Array<FineTuneLogEntry | string> = [];
  let pageNo = 1;
  let total = 0;
  // Hard cap to avoid an unbounded loop if the server misreports `total`.
  const maxPages = 200;
  for (let i = 0; i < maxPages; i++) {
    const response = await getFineTuneLogs(config, jobId, { pageNo, pageSize });
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

export default defineCommand({
  name: "finetune logs",
  description: "Fetch training logs for a fine-tune job",
  usage:
    "bl finetune logs --job-id <id> [--page <n>] [--page-size <n>] [--search <keyword>] [--tail <n>]",
  options: [
    { flag: "--job-id <id>", description: "Fine-tune job ID (required)", required: true },
    { flag: "--page <n>", description: "Page number (default: 1)", type: "number" },
    {
      flag: "--page-size <n>",
      description: "Lines per page (default: server-defined)",
      type: "number",
    },
    {
      flag: "--search <keyword>",
      description:
        "Case-insensitive substring filter. When set, all log pages are fetched and filtered client-side (--page is ignored).",
    },
    {
      flag: "--tail <n>",
      description:
        "Keep only the last N entries. When set, all log pages are fetched and the trailing N are kept (--page is ignored).",
      type: "number",
    },
  ],
  examples: [
    "bl finetune logs --job-id ft-xxx",
    "bl finetune logs --job-id ft-xxx --page-size 100 --output json",
    "bl finetune logs --job-id ft-xxx --search checkpoint",
    "bl finetune logs --job-id ft-xxx --search error --output json",
    "bl finetune logs --job-id ft-xxx --tail 20",
    "bl finetune logs --job-id ft-xxx --search checkpoint --tail 5",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const jobId = flags.jobId as string | undefined;
    if (!jobId) failIfMissing("job-id", "bl finetune logs --job-id <id>");

    const pageNo = flags.page !== undefined ? (flags.page as number) : undefined;
    const pageSize = flags.pageSize !== undefined ? (flags.pageSize as number) : undefined;
    const search = (flags.search as string | undefined) || undefined;
    const tail = flags.tail !== undefined ? (flags.tail as number) : undefined;
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
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
      const { entries, total } = await fetchAllLogs(config, jobId!, pageSize ?? 100);

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

      if (config.quiet || format === "text") {
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
    const response = await getFineTuneLogs(config, jobId!, { pageNo, pageSize });
    const payload = response.output ?? response.data;
    const logs = payload?.logs ?? [];

    if (config.quiet || format === "text") {
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
