import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  BailianError,
  ExitCode,
  type Client,
  type FlagsDef,
  type RagIndexListResponse,
  type RagIndexRow,
} from "bailian-cli-core";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const KB_INFO_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
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
  description: {
    "en-US": "Show knowledge base configuration details",
    "zh-CN": "查看知识库配置详情",
  },
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: KB_INFO_FLAGS,
  notes: [
    {
      "en-US":
        "Indexing settings are immutable; changing them requires recreating the knowledge base.",
      "zh-CN": "索引设置不可修改；如需更改，必须重新创建知识库。",
    },
  ],
  exampleArgs: ["--index-id idx-xxx --workspace-id ws-xxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = settings.output;

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: indexDetailUrl(workspaceId, flags.indexId),
        request: null,
      });
      return;
    }

    const row = await fetchIndexDetail(ctx.client, workspaceId, flags.indexId);

    ctx.output.result(row, format === "text" ? { text: renderText() } : undefined);
    function renderText(): string {
      const lines: string[] = [];

      // Grouped by diagnostic concern; the immutable annotation on Indexing tells
      // users which settings require recreating the knowledge base
      lines.push("Basic:");
      lines.push(formatField("id", row.id));
      lines.push(formatField("name", row.name));
      lines.push(formatField("description", row.description));
      lines.push(formatField("dataType", row.dataType));
      lines.push("Indexing:   [immutable — recreate required to change]");
      lines.push(formatField("embeddingModelName", row.embeddingModelName));
      lines.push(formatField("embeddingDimension", row.embeddingDimension));
      lines.push(formatField("chunkSize", row.chunkSize));
      lines.push(formatField("overlapSize", row.overlapSize));
      lines.push(formatField("chunkMode", row.chunkMode));
      lines.push(formatField("separator", row.separator));
      lines.push("Retrieval:");
      lines.push(formatField("rerankModelName", row.rerankModelName));
      lines.push(formatField("rerankMinScore", row.rerankMinScore));
      lines.push(formatField("rerankTopN", row.rerankTopN));
      lines.push(formatField("rerankMode", row.rerankMode));
      lines.push(formatField("enableRewrite", row.enableRewrite));
      lines.push(formatField("denseSimilarityTopK", row.denseSimilarityTopK));
      lines.push(formatField("sparseSimilarityTopK", row.sparseSimilarityTopK));
      lines.push("Data:");
      lines.push(formatField("sourceType", row.sourceType));
      lines.push(formatField("connectorId", row.connectorId));

      return lines.join("\n");
    }
  },
});
