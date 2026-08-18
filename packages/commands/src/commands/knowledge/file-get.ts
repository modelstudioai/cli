import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagDescribeFileResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const FILE_GET_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Data-center file ID", "zh-CN": "数据中心文件 ID" },
    required: true,
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Show data-center file details (size, MD5, tags, timestamps)",
    "zh-CN": "查看数据中心文件详情（大小、MD5、标签、时间戳）",
  },
  auth: "apiKey",
  usageArgs: "--file-id <id> [flags]",
  flags: FILE_GET_FLAGS,
  exampleArgs: ["--file-id file-xxx --workspace-id ws-xxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = { fileId: flags.fileId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.describeFile);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagDescribeFileResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const file = response.data;
    if (settings.quiet) {
      emitBare(file?.fileId ?? "");
      return;
    }
    if (format !== "text") {
      emitResult(response, format);
      return;
    }
    emitBare(`id: ${file?.fileId ?? "-"}`);
    emitBare(`name: ${file?.fileName ?? "-"}`);
    emitBare(`type: ${file?.fileType ?? "-"}`);
    emitBare(`size: ${file?.sizeBytes ?? "-"}`);
    emitBare(`status: ${file?.status ?? "-"}`);
    emitBare(`parser: ${file?.parser ?? "-"}`);
    emitBare(`category: ${file?.category ?? "-"}`);
    emitBare(`uploaded: ${file?.uploadTime ?? "-"}`);
    const tags = Array.isArray(file?.tags) ? file.tags.join(", ") : (file?.tags ?? "-");
    emitBare(`tags: ${tags || "-"}`);
  },
});
