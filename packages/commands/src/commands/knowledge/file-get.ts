import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  type FlagsDef,
  type RagDescribeFileResponse,
} from "bailian-cli-core";
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
    const format = settings.output;

    const body = { fileId: flags.fileId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.describeFile);

    if (settings.dryRun) {
      ctx.output.result({ endpoint, request: body });
      return;
    }

    const response = await ctx.client.requestJson<RagDescribeFileResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const file = response.data;

    ctx.output.result(response, format === "text" ? { text: renderText() } : undefined);
    function renderText(): string {
      const lines: string[] = [];

      lines.push(`id: ${file?.fileId ?? "-"}`);
      lines.push(`name: ${file?.fileName ?? "-"}`);
      lines.push(`type: ${file?.fileType ?? "-"}`);
      lines.push(`size: ${file?.sizeBytes ?? "-"}`);
      lines.push(`status: ${file?.status ?? "-"}`);
      lines.push(`parser: ${file?.parser ?? "-"}`);
      lines.push(`category: ${file?.category ?? "-"}`);
      lines.push(`uploaded: ${file?.uploadTime ?? "-"}`);
      const tags = Array.isArray(file?.tags) ? file.tags.join(", ") : (file?.tags ?? "-");
      lines.push(`tags: ${tags || "-"}`);

      return lines.join("\n");
    }
  },
});
