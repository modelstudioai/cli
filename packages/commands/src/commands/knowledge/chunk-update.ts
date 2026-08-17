import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type Client,
  type FlagsDef,
  type RagChunkListResponse,
  type RagMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";
import { readUtf8TextFile } from "./upload-support.ts";

const CHUNK_UPDATE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  chunkId: {
    type: "string",
    valueHint: "<id>",
    description: "Chunk ID (metadata._id from the chunk list output)",
    required: true,
  },
  docId: {
    type: "string",
    valueHint: "<id>",
    description: "Document ID owning the chunk (metadata.doc_id from the chunk list output)",
    required: true,
  },
  content: {
    type: "string",
    valueHint: "<text>",
    description: "New chunk content, 10-6000 chars; alternative to --content-file",
  },
  contentFile: {
    type: "string",
    valueHint: "<path>",
    description: "Read new content from a UTF-8 plain text file (.md/.txt etc.)",
  },
  title: {
    type: "string",
    valueHint: "<text>",
    description: "Chunk title, 0-50 chars (empty string clears it; omit to keep unchanged)",
  },
  exclude: { type: "switch", description: "Exclude this chunk from retrieval" },
  include: { type: "switch", description: "Include this chunk in retrieval (default)" },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** When only toggling include/exclude, read back the current content first (the API requires content — hide that quirk from users) */
async function fetchChunkContent(
  client: Client,
  workspaceId: string,
  indexId: string,
  chunkId: string,
  docId: string,
): Promise<string> {
  const maxPages = 10;
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const response = await client.requestJson<RagChunkListResponse>({
      path: ragEndpoint(workspaceId, RAG_PATHS.chunkList),
      method: "POST",
      body: { indexId, docId, pageNum, pageSize: 100 },
    });
    const nodes = response.data?.nodes ?? [];
    const match = nodes.find((node) => node.metadata?._id === chunkId);
    const matchContent = match?.metadata?.content ?? match?.text;
    if (typeof matchContent === "string") return matchContent;
    if (nodes.length < 100) break;
  }
  throw new BailianError(
    `Chunk not found: ${chunkId}`,
    ExitCode.GENERAL,
    "Check the chunk id via the chunk list command.",
  );
}

export default defineCommand({
  description: "Update chunk content or toggle its retrieval visibility",
  auth: "apiKey",
  usageArgs: "--index-id <id> --chunk-id <id> --doc-id <id> [flags]",
  flags: CHUNK_UPDATE_FLAGS,
  notes: [
    "Content must be 10-6000 characters and within the knowledge base's max chunk size.",
    "--content-file expects a UTF-8 plain text file; document formats (.docx/.pdf) are not parsed here.",
    "Toggling --exclude/--include without new content re-submits the existing content automatically.",
  ],
  exampleArgs: [
    '--index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --content "corrected text"',
    "--index-id idx-xxx --chunk-id chunk-xxx --doc-id file-xxx --exclude",
  ],
  validate(flags) {
    if (flags.content !== undefined && flags.contentFile !== undefined) {
      return "Use either --content or --content-file, not both";
    }
    if (flags.exclude && flags.include) return "--exclude and --include are mutually exclusive";
    const hasContent = flags.content !== undefined || flags.contentFile !== undefined;
    if (!hasContent && !flags.exclude && !flags.include && flags.title === undefined) {
      return "Nothing to update — pass --content/--content-file, --title, --exclude or --include";
    }
    // Content lower-bound is enforced here (not deferred to run) so dry-run and
    // missing-flag diagnostics surface the same error as the live request.
    if (flags.content !== undefined && (flags.content.length < 10 || flags.content.length > 6000)) {
      return "--content must be 10-6000 characters";
    }
    if (flags.title !== undefined && flags.title.length > 50) {
      return "--title must be at most 50 characters";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // dry-run also reads the file and validates (rehearsal semantics); the read-back
    // request is only made outside dry-run and when no new content is given
    let content =
      flags.contentFile !== undefined
        ? readUtf8TextFile(flags.contentFile, "--content")
        : flags.content;
    if (content !== undefined && (content.length < 10 || content.length > 6000)) {
      throw new BailianError("Chunk content must be 10-6000 characters", ExitCode.USAGE);
    }

    if (content === undefined) {
      if (settings.dryRun) {
        content = "<current-content (fetched at run time)>";
      } else {
        content = await fetchChunkContent(
          ctx.client,
          workspaceId,
          flags.indexId,
          flags.chunkId,
          flags.docId,
        );
      }
    }

    const body = {
      pipelineId: flags.indexId,
      chunkId: flags.chunkId,
      dataId: flags.docId,
      content,
      // Without exclude/include the chunk stays retrievable (safe default)
      isDisplayedChunkContent: !flags.exclude,
      ...(flags.title !== undefined ? { title: flags.title } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.chunkUpdate);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`updated: ${flags.chunkId}`);
      return;
    }
    emitResult(response, format);
  },
});
