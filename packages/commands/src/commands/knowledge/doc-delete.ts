import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagDeleteFileResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, confirmDangerousAction } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const DOC_DELETE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  docId: {
    type: "array",
    valueHint: "<id>",
    description: "Document ID to delete (repeatable)",
    required: true,
  },
  yes: { type: "switch", description: "Skip the confirmation prompt" },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Confirmation summary: list all doc_ids up to 5, otherwise show the first 5 + total count */
function buildDeleteSummary(indexId: string, docIds: string[]): string {
  const listed =
    docIds.length <= 5
      ? docIds.join("\n  ")
      : `${docIds.slice(0, 5).join("\n  ")}\n  ... (${docIds.length} documents total)`;
  return `Delete ${docIds.length} document(s) from knowledge base ${indexId}:\n  ${listed}\nDocuments and all their chunks are permanently removed from the index. This cannot be undone.`;
}

export default defineCommand({
  description: "Delete documents and their chunks from a knowledge base",
  auth: "apiKey",
  usageArgs: "--index-id <id> --doc-id <id> [flags]",
  flags: DOC_DELETE_FLAGS,
  notes: [
    "Removes documents from the knowledge base index only; the source files remain in the data center.",
    "Use the doc_id from `knowledge doc list --quiet`, not the fileId from `knowledge doc upload`. For documents created via `knowledge create --doc-id`, the doc_id equals the fileId; for documents imported via `knowledge doc upload --index-id`, the doc_id may include a workspace suffix.",
    "Deletion is asynchronous: the server returns Success immediately, but the document may still appear in `knowledge doc list` for up to ~30s until the change propagates.",
    "The output lists the ids actually deleted as reported by the server.",
  ],
  exampleArgs: [
    "--index-id idx-xxx --doc-id file-xxx --workspace-id ws-xxx",
    "--index-id idx-xxx --doc-id file-a --doc-id file-b --yes",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // snake_case: body { index_id, doc_ids }
    const body = { index_id: flags.indexId, doc_ids: flags.docId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.indexDeleteFile);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    await confirmDangerousAction(
      buildDeleteSummary(flags.indexId, flags.docId),
      flags.yes ?? false,
    );

    const response = await ctx.client.requestJson<RagDeleteFileResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    // Output follows the server's data.deleted list
    const deleted = response.data?.deleted ?? [];
    if (settings.quiet) {
      for (const docId of deleted) emitBare(docId);
      return;
    }
    if (format === "text") {
      emitBare(`deleted: ${deleted.length} document(s)`);
      for (const docId of deleted) emitBare(`  ${docId}`);
      if (deleted.length !== flags.docId.length) {
        process.stderr.write(
          `Warning: requested ${flags.docId.length} deletion(s) but the server reported ${deleted.length}.\n`,
        );
      }
      return;
    }
    emitResult(response, format);
  },
});
