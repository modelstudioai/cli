import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type FlagsDef,
  type RagMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";
import { readUtf8TextFile } from "./upload-support.ts";

const CHUNK_ADD_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  docId: {
    type: "string",
    valueHint: "<id>",
    description: "Attach the chunk to this document (document-type knowledge bases)",
  },
  content: {
    type: "string",
    valueHint: "<text>",
    description: "Chunk body text, up to 6000 chars (document-type); alternative to --content-file",
  },
  contentFile: {
    type: "string",
    valueHint: "<path>",
    description: "Read chunk body from a UTF-8 plain text file (.md/.txt etc.)",
  },
  title: {
    type: "string",
    valueHint: "<text>",
    description: "Chunk title, up to 50 chars (document-type)",
  },
  imageUrl: {
    type: "array",
    valueHint: "<url>",
    description: "Chunk image URL (repeatable, up to 10; document-type)",
  },
  field: {
    type: "array",
    valueHint: "<key=value>",
    description:
      "Arbitrary field entry (repeatable) for table/image knowledge bases where keys are Excel column headers; mutually exclusive with content/title/image flags",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Parse --field key=value: split on the first =, value may contain = */
export function parseFieldEntries(entries: string[]): Record<string, string> {
  const field: Record<string, string> = {};
  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      throw new BailianError(`--field must be key=value, got: ${entry}`, ExitCode.USAGE);
    }
    field[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1);
  }
  return field;
}

export default defineCommand({
  description: "Add a chunk directly to a knowledge base",
  auth: "apiKey",
  usageArgs: "--index-id <id> (--content <text> | --field <k=v>) [flags]",
  flags: CHUNK_ADD_FLAGS,
  notes: [
    "Document / table / image knowledge bases are supported; audio-video ones are not.",
    "The API is idempotent but rate-limited to 10 calls per second — throttle batch scripts.",
    "The response carries no chunk id; list chunks afterwards to find the new one.",
    "For table/image knowledge bases use --field with Excel column headers as keys; values are passed through as strings.",
  ],
  exampleArgs: [
    '--index-id idx-xxx --content "chunk text" --title intro --workspace-id ws-xxx',
    "--index-id idx-xxx --field 列A=v1 --field 列B=v2",
  ],
  validate(flags) {
    const hasConvenience =
      flags.content !== undefined ||
      flags.contentFile !== undefined ||
      flags.title !== undefined ||
      !!flags.imageUrl?.length;
    const hasField = !!flags.field?.length;
    if (hasConvenience && hasField) {
      return "--field is mutually exclusive with --content/--content-file/--title/--image-url";
    }
    if (!hasConvenience && !hasField) {
      return "Provide chunk content via --content/--content-file or --field entries";
    }
    if (flags.content !== undefined && flags.contentFile !== undefined) {
      return "Use either --content or --content-file, not both";
    }
    if (flags.content !== undefined && flags.content.length > 6000) {
      return "--content must be at most 6000 characters";
    }
    if (flags.title !== undefined && flags.title.length > 50) {
      return "--title must be at most 50 characters";
    }
    if (flags.imageUrl !== undefined && flags.imageUrl.length > 10) {
      return "--image-url accepts at most 10 entries";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // dry-run also reads the file and parses --field (rehearsal semantics)
    let field: Record<string, unknown>;
    if (flags.field?.length) {
      field = parseFieldEntries(flags.field);
    } else {
      const content =
        flags.contentFile !== undefined ? readUtf8TextFile(flags.contentFile) : flags.content;
      if (typeof content === "string" && content.length > 6000) {
        throw new BailianError("Chunk content must be at most 6000 characters", ExitCode.USAGE);
      }
      field = {
        ...(content !== undefined ? { content } : {}),
        ...(flags.title !== undefined ? { title: flags.title } : {}),
        ...(flags.imageUrl?.length ? { image_urls: flags.imageUrl } : {}),
      };
    }

    const body = {
      pipelineId: flags.indexId,
      ...(flags.docId ? { dataId: flags.docId } : {}),
      field,
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.chunkCreate);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    // The response carries no chunk_id — quiet mode exits 0 silently on success
    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`chunk created (pipeline: ${flags.indexId})`);
      emitBare("List chunks to find the new chunk id.");
      return;
    }
    emitResult(response, format);
  },
});
