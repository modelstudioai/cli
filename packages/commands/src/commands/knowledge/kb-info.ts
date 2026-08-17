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

function indexDetailUrl(workspaceId: string, indexId: string): string {
  const url = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexList));
  url.searchParams.set("pipeline_id", indexId);
  url.searchParams.set("page_number", "1");
  url.searchParams.set("page_size", "1");
  return url.toString();
}

/**
 * The index/list API now supports pipeline_id filtering, so a single
 * request suffices instead of paginating. Reused by kb delete for its
 * confirmation summary.
 */
export async function fetchIndexDetail(
  client: Client,
  workspaceId: string,
  indexId: string,
): Promise<RagIndexRow> {
  const response = await client.requestJson<RagIndexListResponse>({
    path: indexDetailUrl(workspaceId, indexId),
    method: "GET",
  });
  const row = response.data?.rows?.[0];
  if (!row) {
    throw new BailianError(
      `Knowledge base not found: ${indexId}`,
      ExitCode.GENERAL,
      "Check the id — list knowledge bases in this workspace to verify it.",
    );
  }
  return row;
}

function formatField(label: string, value: string | number | boolean | null | undefined): string {
  return `  ${label}: ${value ?? "-"}`;
}

export default defineCommand({
  description: "Show knowledge base configuration details",
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: KB_INFO_FLAGS,
  notes: ["Indexing settings are immutable; changing them requires recreating the knowledge base."],
  exampleArgs: ["--index-id idx-xxx --workspace-id ws-xxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          endpoint: indexDetailUrl(workspaceId, flags.indexId),
          request: null,
        },
        format,
      );
      return;
    }

    const row = await fetchIndexDetail(ctx.client, workspaceId, flags.indexId);

    if (settings.quiet) {
      emitBare(row.id ?? "");
      return;
    }
    if (format !== "text") {
      emitResult(row, format);
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
