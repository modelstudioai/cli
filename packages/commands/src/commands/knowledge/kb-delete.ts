import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagIndexFilesResponse,
  type RagMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, confirmDangerousAction } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";
import { fetchIndexDetail } from "./kb-info.ts";

const KB_DELETE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  yes: {
    type: "switch",
    description: { "en-US": "Skip the confirmation prompt", "zh-CN": "跳过确认提示" },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Confirmation summary lookup: name + document count; any lookup failure degrades to id-only (never blocks deletion) */
async function buildDeleteSummary(
  ctx: { client: Parameters<typeof fetchIndexDetail>[0] },
  workspaceId: string,
  indexId: string,
): Promise<string> {
  let namePart = "";
  let docCountPart = "";
  try {
    const detail = await fetchIndexDetail(ctx.client, workspaceId, indexId);
    namePart = `  name: ${detail.name}`;
  } catch {
    // Degrade gracefully: a missing name does not block confirmation
  }
  try {
    const filesUrl = new URL(ragEndpoint(workspaceId, RAG_PATHS.indexFiles));
    filesUrl.searchParams.set("index_id", indexId);
    filesUrl.searchParams.set("page_num", "1");
    filesUrl.searchParams.set("page_size", "1");
    const files = await ctx.client.requestJson<RagIndexFilesResponse>({
      path: filesUrl.toString(),
      method: "GET",
    });
    const totalCount = files.data?.total_count;
    if (typeof totalCount === "number") docCountPart = `  documents: ${totalCount}`;
  } catch {
    // Same graceful degradation as above
  }
  return `Delete knowledge base ${indexId}${namePart}${docCountPart}\nThis permanently removes the knowledge base with all documents and chunks. It cannot be undone.`;
}

export default defineCommand({
  description: {
    "en-US": "Delete a knowledge base with all its documents and chunks",
    "zh-CN": "删除知识库及其所有文档和 Chunk",
  },
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: KB_DELETE_FLAGS,
  notes: [
    {
      "en-US": "Irreversible — the knowledge base and all indexed content are permanently removed.",
      "zh-CN": "该操作不可撤销——知识库及所有已索引内容将被永久删除。",
    },
    {
      "en-US":
        "Files in the data center are not affected; only the knowledge base index is deleted.",
      "zh-CN": "数据中心中的文件不受影响；仅删除知识库索引。",
    },
  ],
  exampleArgs: ["--index-id idx-xxx --workspace-id ws-xxx", "--index-id idx-xxx --yes"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // This endpoint is back to snake_case: body { index_id }
    const body = { index_id: flags.indexId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.indexDelete);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const summary = flags.yes
      ? "" // --yes bypasses the prompt, so skip the summary lookups
      : await buildDeleteSummary(ctx, workspaceId, flags.indexId);
    await confirmDangerousAction(summary, flags.yes ?? false);

    const response = await ctx.client.requestJson<RagMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`deleted: ${flags.indexId}`);
      return;
    }
    emitResult(response, format);
  },
});
