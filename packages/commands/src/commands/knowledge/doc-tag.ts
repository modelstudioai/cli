import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagBatchUpdateTagResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const DOC_TAG_FLAGS = {
  docId: {
    type: "array",
    valueHint: "<id>",
    description: "Data-center file ID to tag (repeatable, 1-20 per call)",
    required: true,
  },
  tag: {
    type: "array",
    valueHint: "<text>",
    description: "Tag applied to every --doc-id (repeatable, each up to 32 chars)",
    required: true,
  },
  mode: {
    type: "string",
    valueHint: "<mode>",
    description: "Update mode: append (default) or overwrite",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Batch update tags on data-center files",
  auth: "apiKey",
  usageArgs: "--doc-id <id> --tag <text> [flags]",
  flags: DOC_TAG_FLAGS,
  notes: [
    "The same tag set is applied to every --doc-id; run the command multiple times for different tag sets.",
    "Server limits: up to 100 tags per file, total tag length up to 700 chars, tag up to 32 chars.",
  ],
  exampleArgs: [
    "--doc-id file-xxx --tag project-a --tag draft --workspace-id ws-xxx",
    "--doc-id file-a --doc-id file-b --tag final --mode overwrite",
  ],
  validate(flags) {
    if (flags.docId.length > 20) return "--doc-id accepts at most 20 ids per call";
    if (flags.mode !== undefined && flags.mode !== "append" && flags.mode !== "overwrite") {
      return "--mode must be append or overwrite";
    }
    // Hard limits stated by the API contract: each tag ≤32 chars; ≤100 tags per file; total length ≤700
    if (flags.tag.length > 100) return "At most 100 tags per file";
    const overlongTag = flags.tag.find((tag) => tag.length > 32);
    if (overlongTag) return `Tag exceeds 32 characters: ${overlongTag}`;
    const totalLength = flags.tag.reduce((sum, tag) => sum + tag.length, 0);
    if (totalLength > 700) return "Total tag length exceeds 700 characters";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = {
      fileInfos: flags.docId.map((fileId) => ({ fileId, tags: flags.tag })),
      updateMode: (flags.mode ?? "append").toUpperCase(),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.batchUpdateFileTag);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagBatchUpdateTagResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`tagged: ${flags.docId.length} file(s) with [${flags.tag.join(", ")}]`);
      return;
    }
    emitResult(response, format);
  },
});
