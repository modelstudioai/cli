import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const KB_UPDATE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: "Knowledge base ID",
    required: true,
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: "New knowledge base name (1-20 chars)",
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: "New knowledge base description",
  },
  rerankMinScore: {
    type: "number",
    valueHint: "<score>",
    description: "Rerank minimum score threshold, range 0-1 (chunks below are filtered)",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Update knowledge base name, description or rerank threshold",
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: KB_UPDATE_FLAGS,
  notes: [
    "Indexing settings (embedding model, chunk size, etc.) are immutable — recreate the knowledge base to change them.",
  ],
  exampleArgs: [
    "--index-id idx-xxx --description 'product docs v2' --workspace-id ws-xxx",
    "--index-id idx-xxx --rerank-min-score 0.3",
  ],
  validate(flags) {
    if (
      flags.name === undefined &&
      flags.description === undefined &&
      flags.rerankMinScore === undefined
    ) {
      return "Nothing to update — pass --name, --description or --rerank-min-score";
    }
    if (flags.name !== undefined && (flags.name.length < 1 || flags.name.length > 20)) {
      return "--name must be 1-20 characters";
    }
    if (
      flags.rerankMinScore !== undefined &&
      (flags.rerankMinScore < 0 || flags.rerankMinScore > 1)
    ) {
      return "--rerank-min-score must be between 0 and 1";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // Gotcha: this endpoint names the knowledge base ID parameter `id` (not index_id/indexId)
    const body = {
      id: flags.indexId,
      ...(flags.name !== undefined ? { name: flags.name } : {}),
      ...(flags.description !== undefined ? { description: flags.description } : {}),
      ...(flags.rerankMinScore !== undefined ? { rerankMinScore: flags.rerankMinScore } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.indexUpdate);

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
      emitBare(`updated: ${flags.indexId}`);
      return;
    }
    emitResult(response, format);
  },
});
