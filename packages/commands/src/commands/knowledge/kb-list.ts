import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagIndexListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, truncateLine, PAGE_FLAGS, WORKSPACE_FLAG } from "./shared.ts";

const KB_LIST_FLAGS = {
  name: {
    type: "string",
    valueHint: "<text>",
    description: "Filter by knowledge base name (fuzzy match, 1-20 chars)",
  },
  ...PAGE_FLAGS,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "List knowledge bases in the workspace",
  auth: "apiKey",
  usageArgs: "[flags]",
  flags: KB_LIST_FLAGS,
  notes: [
    "Auth: uses DashScope API Key (Bearer token).",
    "`--workspace-id` can be set via BAILIAN_WORKSPACE_ID env or config workspace_id.",
    "Use the returned id as --index-id in knowledge base / document management commands.",
  ],
  exampleArgs: ["--workspace-id ws-xxx", "--name demo --page-number 2 --page-size 50"],
  validate(flags) {
    if (flags.name !== undefined && (flags.name.length < 1 || flags.name.length > 20)) {
      return "--name must be 1-20 characters";
    }
    if (flags.pageSize !== undefined && (flags.pageSize < 1 || flags.pageSize > 100)) {
      return "--page-size must be between 1 and 100";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // Pagination and filter parameters must go in the query string — the server ignores them in the body
    const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexList));
    if (flags.name) url.searchParams.set("pipeline_name", flags.name);
    url.searchParams.set("page_number", String(flags.pageNumber ?? 1));
    url.searchParams.set("page_size", String(flags.pageSize ?? 20));
    const endpoint = url.toString();

    if (settings.dryRun) {
      emitResult({ endpoint, request: null }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagIndexListResponse>({
      path: endpoint,
      method: "GET",
    });

    const rows = response.data?.rows ?? [];
    if (settings.quiet) {
      for (const row of rows) emitBare(row.id);
      return;
    }
    if (format === "text") {
      if (rows.length === 0) {
        emitBare("No knowledge bases found.");
      } else {
        for (const row of rows) {
          emitBare(
            truncateLine(
              [
                row.id,
                row.name,
                row.embeddingModelName ?? "-",
                row.chunkSize ?? "-",
                row.description ?? "",
              ].join("  "),
            ),
          );
        }
      }
      emitBare(`total: ${response.data?.total ?? rows.length}`);
    } else {
      emitResult(response, format);
    }
  },
});
