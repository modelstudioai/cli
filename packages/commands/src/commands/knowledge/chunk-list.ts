import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagChunkListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, PAGE_FLAGS, WORKSPACE_FLAG } from "./shared.ts";

const CHUNK_LIST_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  docId: {
    type: "string",
    valueHint: "<id>",
    description: "Only show chunks belonging to this document",
  },
  ...PAGE_FLAGS,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "List chunks in a knowledge base with content and status",
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: CHUNK_LIST_FLAGS,
  notes: [
    "Use metadata._id as the chunk id and metadata.doc_id as the document id in chunk update/delete commands.",
    "Page size defaults to 20 (server default), max 100.",
  ],
  exampleArgs: [
    "--index-id idx-xxx --workspace-id ws-xxx",
    "--index-id idx-xxx --doc-id file-xxx --page-size 50",
  ],
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

    // Gotcha: this endpoint's pagination keys are pageNum/pageSize (camelCase, in the body)
    const body = {
      indexId: flags.indexId,
      pageNum: flags.pageNumber ?? 1,
      pageSize: flags.pageSize ?? 20,
      ...(flags.docId ? { docId: flags.docId } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.chunkList);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagChunkListResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const nodes = response.data?.nodes ?? [];
    if (settings.quiet) {
      // chunk ids only, for piping into chunk update/delete
      for (const node of nodes) emitBare(node.metadata?._id ?? "");
      return;
    }
    if (format === "text") {
      if (nodes.length === 0) {
        emitBare("No chunks found.");
      } else {
        for (const node of nodes) {
          const metadata = node.metadata ?? {};
          const statusPart = metadata._chunk_status_message
            ? `  status: ${metadata._chunk_status_message}`
            : "";
          const excludedPart =
            metadata.is_displayed_chunk_content === false ? "  [excluded from retrieval]" : "";
          emitBare(
            `[chunk] ${metadata._id ?? "?"}  (doc: ${metadata.doc_name ?? "?"}, doc_id: ${metadata.doc_id ?? "?"})${statusPart}${excludedPart}`,
          );
          const contentText = metadata.content ?? node.text ?? "";
          emitBare(`  ${contentText.length > 200 ? `${contentText.slice(0, 200)}…` : contentText}`);
        }
      }
      emitBare(`total: ${response.data?.total ?? nodes.length}`);
    } else {
      emitResult(response, format);
    }
  },
});
