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

const KB_DELETE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Delete a knowledge base with all its documents and chunks",
    "zh-CN": "删除知识库及其所有文档和 Chunk",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently deletes the knowledge base and all of its documents and chunks. Data-center files are not deleted.",
      "zh-CN": "该操作会永久删除知识库及其全部文档和 Chunk，但不会删除数据中心文件。",
    },
  },
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
