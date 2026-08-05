import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  type FlagsDef,
  type RagMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, confirmDangerousAction } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const CHUNK_DELETE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  chunkId: {
    type: "array",
    valueHint: "<id>",
    description: "Chunk ID to delete (repeatable; batches of 10 are sent automatically)",
    required: true,
  },
  yes: { type: "switch", description: "Skip the confirmation prompt" },
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
  description: "Delete chunks from a knowledge base (irreversible)",
  auth: "apiKey",
  usageArgs: "--index-id <id> --chunk-id <id> [flags]",
  flags: CHUNK_DELETE_FLAGS,
  notes: [
    "The server accepts at most 10 ids per call; larger sets are split into sequential batches automatically.",
    "If a batch fails, the operation stops and already-deleted batches are listed in the error.",
  ],
  exampleArgs: [
    "--index-id idx-xxx --chunk-id chunk-a --chunk-id chunk-b --workspace-id ws-xxx",
    "--index-id idx-xxx --chunk-id chunk-a --yes",
  ],
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

    await confirmDangerousAction(
      `Delete ${flags.chunkId.length} chunk(s) from knowledge base ${flags.indexId} in ${batches.length} batch(es).\nChunks are permanently removed. This cannot be undone.`,
      flags.yes ?? false,
    );

    // Sequential batches; any batch failure aborts, listing already-deleted batches in the error
    let deletedCount = 0;
    for (const batchIds of batches) {
      try {
        await ctx.client.requestJson<RagMutationResponse>({
          path: endpoint,
          method: "POST",
          body: { pipelineId: flags.indexId, chunkIds: batchIds },
        });
        deletedCount += batchIds.length;
      } catch (error) {
        if (deletedCount > 0 && error instanceof BailianError && !error.hint) {
          throw new BailianError(
            error.message,
            error.exitCode,
            `${deletedCount} chunk(s) in earlier batches were already deleted.`,
            { cause: error, api: error.api, rawResponse: error.rawResponse },
          );
        }
        throw error;
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
