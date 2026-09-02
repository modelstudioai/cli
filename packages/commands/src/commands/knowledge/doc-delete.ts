import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagDeleteFileResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const DOC_DELETE_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  docId: {
    type: "array",
    valueHint: "<id>",
    description: {
      "en-US": "Document ID to delete (repeatable)",
      "zh-CN": "要删除的文档 ID（可重复）",
    },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Delete documents and their chunks from a knowledge base",
    "zh-CN": "从知识库中删除文档及其 Chunk",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the selected documents and all of their chunks.",
      "zh-CN": "该操作会永久删除所选文档及其全部 Chunk，且无法撤销。",
    },
  },
  usageArgs: "--index-id <id> --doc-id <id> [flags]",
  flags: DOC_DELETE_FLAGS,
  notes: [
    {
      "en-US":
        "Removes documents from the knowledge base index only; the source files remain in the data center.",
      "zh-CN": "仅从知识库索引中移除文档；源文件仍保留在数据中心。",
    },
    {
      "en-US":
        "Use the doc_id from `knowledge doc list --quiet`, not the fileId from `knowledge doc upload`. For documents created via `knowledge create --doc-id`, the doc_id equals the fileId; for documents imported via `knowledge doc upload --index-id`, the doc_id may include a workspace suffix.",
      "zh-CN":
        "请使用 `knowledge doc list --quiet` 返回的 doc_id，而不是 `knowledge doc upload` 返回的 fileId。通过 `knowledge create --doc-id` 创建的文档，其 doc_id 等于 fileId；通过 `knowledge doc upload --index-id` 导入的文档，其 doc_id 可能带有 Workspace 后缀。",
    },
    {
      "en-US":
        "Deletion may take up to ~30s to propagate — the document may still appear in the doc list briefly.",
      "zh-CN": "删除结果最多可能需要约 30 秒才会生效——文档可能会短暂地继续出现在列表中。",
    },
    {
      "en-US": "The output lists the ids actually deleted.",
      "zh-CN": "输出会列出实际删除的 ID。",
    },
  ],
  exampleArgs: [
    "--index-id idx-xxx --doc-id file-xxx --workspace-id ws-xxx --dry-run",
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
