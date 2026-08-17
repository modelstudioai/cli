import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagIndexFilesResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, ansi } from "bailian-cli-runtime";
import { resolveWorkspaceId, truncateLine, PAGE_FLAGS, WORKSPACE_FLAG } from "./shared.ts";

const DOC_LIST_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  ...PAGE_FLAGS,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "List documents in a knowledge base with parse/index status",
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: DOC_LIST_FLAGS,
  notes: [
    "Documents with status FAILED are highlighted in text mode — use the import job status command to inspect failures.",
    "Page size defaults to 10 (server default), max 100.",
  ],
  exampleArgs: ["--index-id idx-xxx --workspace-id ws-xxx", "--index-id idx-xxx --page-size 100"],
  validate(flags) {
    if (flags.pageSize !== undefined && (flags.pageSize < 1 || flags.pageSize > 100)) {
      return "--page-size must be between 1 and 100";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // Gotcha: this endpoint's page parameter is page_num (not page_number)
    const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexFiles));
    url.searchParams.set("index_id", flags.indexId);
    url.searchParams.set("page_num", String(flags.pageNumber ?? 1));
    url.searchParams.set("page_size", String(flags.pageSize ?? 10));
    const endpoint = url.toString();

    if (settings.dryRun) {
      emitResult({ endpoint, request: null }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagIndexFilesResponse>({
      path: endpoint,
      method: "GET",
    });

    const rows = response.data?.rows ?? [];
    if (settings.quiet) {
      for (const row of rows) emitBare(row.doc_id ?? "");
      return;
    }
    if (format === "text") {
      const styles = ansi(process.stdout);
      if (rows.length === 0) {
        emitBare("No documents found.");
      } else {
        for (const row of rows) {
          const line = truncateLine(
            [row.doc_id, row.status, row.doc_name, row.doc_type ?? "-", row.size ?? "-"].join("  "),
          );
          emitBare(row.status === "FAILED" ? styles.red(line) : line);
        }
      }
      emitBare(`total: ${response.data?.total_count ?? rows.length}`);
    } else {
      emitResult(response, format);
    }
  },
});
