import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagConnectorResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const FILE_DELETE_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Data-center file ID to delete",
      "zh-CN": "要删除的数据中心文件 ID",
    },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Permanently delete a file from the data center",
    "zh-CN": "从数据中心永久删除文件",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently deletes the data-center file. Knowledge-base document indexes that reference it may become invalid.",
      "zh-CN": "该操作会永久删除数据中心文件；引用该文件的知识库文档索引可能失效。",
    },
  },
  usageArgs: "--file-id <id> [flags]",
  flags: FILE_DELETE_FLAGS,
  notes: [
    {
      "en-US":
        "Irreversible. If knowledge bases reference this file, their related document indexes become invalid.",
      "zh-CN": "该操作不可撤销。如果知识库引用了此文件，其相关文档索引将失效。",
    },
    {
      "en-US":
        "To remove a document from a single knowledge base only, use the document delete command instead.",
      "zh-CN": "如果只需从单个知识库中移除文档，请改用文档删除命令。",
    },
  ],
  exampleArgs: ["--file-id file-xxx --workspace-id ws-xxx", "--file-id file-xxx --yes"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = { fileId: flags.fileId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.deleteFile);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<
      RagConnectorResponse<Record<string, unknown> | undefined>
    >({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`deleted: ${flags.fileId}`);
      return;
    }
    emitResult(response, format);
  },
});
