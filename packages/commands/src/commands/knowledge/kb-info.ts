import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type Client,
  type FlagsDef,
  type RagIndexListResponse,
  type RagIndexRow,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const KB_INFO_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

function indexListUrl(workspaceId: string, pageNumber: number): string {
  const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexList));
  url.searchParams.set("page_number", String(pageNumber));
  url.searchParams.set("page_size", "100");
  return url.toString();
}

/**
 * There is no dedicated detail API on the server, so fall back to paging
 * through index/list. If a detail API ships, only this function changes.
 * Also reused by kb delete for its confirmation summary.
 */
export async function fetchIndexDetail(
  client: Client,
  workspaceId: string,
  indexId: string,
): Promise<RagIndexRow> {
  const maxPages = 10;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const response = await client.requestJson<RagIndexListResponse>({
      path: indexListUrl(workspaceId, pageNumber),
      method: "GET",
    });
    const rows = response.data?.rows ?? [];
    const match = rows.find((row) => row.id === indexId);
    if (match) return match;
    if (rows.length < 100) break; // reached the last page
  }
  throw new BailianError(
    `Knowledge base not found: ${indexId}`,
    ExitCode.GENERAL,
    "Check the id — list knowledge bases in this workspace to verify it.",
  );
}

function formatField(label: string, value: string | number | boolean | null | undefined): string {
  return `  ${label}: ${value ?? "-"}`;
}

export default defineCommand({
  description: "Show knowledge base configuration details",
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: KB_INFO_FLAGS,
  notes: [
    "No dedicated detail API on the server yet — falls back to paginating the index list (up to 10 pages of 100).",
    "Indexing settings are immutable; changing them requires recreating the knowledge base.",
  ],
  exampleArgs: ["--index-id idx-xxx --workspace-id ws-xxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          endpoint: indexListUrl(workspaceId, 1),
          request: null,
          strategy:
            "paginate index/list (page_size=100, up to 10 pages) to find --index-id; no dedicated detail API",
        },
        format,
      );
      return;
    }

    const row = await fetchIndexDetail(ctx.client, workspaceId, flags.indexId);

    if (settings.quiet || format !== "text") {
      emitResult(row, format === "text" ? "json" : format);
      return;
    }

    // Grouped by diagnostic concern; the immutable annotation on Indexing tells
    // users which settings require recreating the knowledge base
    emitBare("Basic:");
    emitBare(formatField("id", row.id));
    emitBare(formatField("name", row.name));
    emitBare(formatField("description", row.description));
    emitBare(formatField("dataType", row.dataType));
    emitBare("Indexing:   [immutable — recreate required to change]");
    emitBare(formatField("embeddingModelName", row.embeddingModelName));
    emitBare(formatField("embeddingDimension", row.embeddingDimension));
    emitBare(formatField("chunkSize", row.chunkSize));
    emitBare(formatField("overlapSize", row.overlapSize));
    emitBare(formatField("chunkMode", row.chunkMode));
    emitBare(formatField("separator", row.separator));
    emitBare("Retrieval:");
    emitBare(formatField("rerankModelName", row.rerankModelName));
    emitBare(formatField("rerankMinScore", row.rerankMinScore));
    emitBare(formatField("rerankTopN", row.rerankTopN));
    emitBare(formatField("rerankMode", row.rerankMode));
    emitBare(formatField("enableRewrite", row.enableRewrite));
    emitBare(formatField("denseSimilarityTopK", row.denseSimilarityTopK));
    emitBare(formatField("sparseSimilarityTopK", row.sparseSimilarityTopK));
    emitBare("Data:");
    emitBare(formatField("sourceType", row.sourceType));
    emitBare(formatField("connectorId", row.connectorId));
  },
});
