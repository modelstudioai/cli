import { validateNonemptyFlags } from "./nonempty-flags.ts";
import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  type FlagsDef,
  type RagMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, normalizeError } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const CHUNK_DELETE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  chunkId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Chunk ID to delete (repeatable; batches of 10 are sent automatically)",
      "zh-CN": "要删除的 Chunk ID（可重复；每 10 个自动分批发送）",
    },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** The server caps each request at 10 chunk ids — the client batches automatically (bulk delete is where the CLI beats the console) */
export function splitIntoBatches(chunkIds: string[], batchSize = 10): string[][] {
  const batches: string[][] = [];
  for (let batchStart = 0; batchStart < chunkIds.length; batchStart += batchSize) {
    batches.push(chunkIds.slice(batchStart, batchStart + batchSize));
  }
  return batches;
}

export default defineCommand({
  description: {
    "en-US": "Delete chunks from a knowledge base (irreversible)",
    "zh-CN": "从知识库中删除 Chunk（不可撤销）",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the selected chunks and cannot be undone.",
      "zh-CN": "该操作会永久删除所选 Chunk，且无法撤销。",
    },
  },
  usageArgs: "--index-id <id> --chunk-id <id> [flags]",
  flags: CHUNK_DELETE_FLAGS,
  notes: [
    {
      "en-US": "Accepts at most 10 chunk ids per call; larger sets are batched automatically.",
      "zh-CN": "每次调用最多接受 10 个 Chunk ID；更多 ID 会自动分批处理。",
    },
  ],
  exampleArgs: [
    "--index-id idx-xxx --chunk-id chunk-a --chunk-id chunk-b --workspace-id ws-xxx",
    "--index-id idx-xxx --chunk-id chunk-a --yes",
  ],
  validate(flags) {
    const nonemptyError = validateNonemptyFlags({
      "index-id": flags.indexId,
      "chunk-id": flags.chunkId,
    });
    if (nonemptyError) return nonemptyError;
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const batches = splitIntoBatches(flags.chunkId);
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.chunkDelete);

    if (settings.dryRun) {
      emitResult(
        {
          endpoint,
          batches: batches.map((batchIds) => ({
            request: { pipelineId: flags.indexId, chunkIds: batchIds },
          })),
        },
        format,
      );
      return;
    }

    // Sequential batches; any batch failure aborts, listing already-deleted batches in the error
    let deletedCount = 0;
    const completedBatches: string[][] = [];
    for (const batchIds of batches) {
      try {
        await ctx.client.requestJson<RagMutationResponse>({
          path: endpoint,
          method: "POST",
          body: { pipelineId: flags.indexId, chunkIds: batchIds },
        });
        deletedCount += batchIds.length;
        completedBatches.push(batchIds);
      } catch (error) {
        const original = normalizeError(error, ctx.identity.binName);
        const failedBatch = completedBatches.length + 1;
        const progress = [
          ctx.localize({
            "en-US": `Confirmed deleted: ${deletedCount} chunk(s) in ${completedBatches.length} completed batch(es).`,
            "zh-CN": `已确认删除：${completedBatches.length} 个成功批次，共 ${deletedCount} 个切片。`,
          }),
          ...completedBatches.map((completedIds, batchIndex) =>
            ctx.localize({
              "en-US": `Batch ${batchIndex + 1}: ${JSON.stringify(completedIds)}`,
              "zh-CN": `第 ${batchIndex + 1} 批：${JSON.stringify(completedIds)}`,
            }),
          ),
          ctx.localize({
            "en-US": `Batch ${failedBatch} failed; its deletion outcome is unconfirmed. Later batches were not executed.`,
            "zh-CN": `第 ${failedBatch} 批失败，删除结果未确认。后续批次未执行。`,
          }),
        ].join("\n");
        throw new BailianError(
          original.message,
          original.exitCode,
          [original.hint, progress].filter(Boolean).join("\n"),
          { cause: original, api: original.api, rawResponse: original.rawResponse },
        );
      }
    }

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`deleted: ${deletedCount} chunk(s) in ${batches.length} batch(es)`);
      return;
    }
    emitResult({ deleted_count: deletedCount, batches: batches.length }, format);
  },
});
