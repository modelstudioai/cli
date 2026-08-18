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
    description: {
      "en-US": "Data-center file ID to tag (repeatable, 1-20 per call)",
      "zh-CN": "要添加标签的数据中心文件 ID（可重复，每次调用 1–20 个）",
    },
    required: true,
  },
  tag: {
    type: "array",
    valueHint: "<text>",
    description: {
      "en-US": "Tag applied to every --doc-id (repeatable, each up to 32 chars)",
      "zh-CN": "应用于每个 --doc-id 的标签（可重复，每个最多 32 个字符）",
    },
    required: true,
  },
  mode: {
    type: "string",
    valueHint: "<mode>",
    description: {
      "en-US": "Update mode: append (default) or overwrite",
      "zh-CN": "更新模式：append（默认）或 overwrite",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Batch update tags on data-center files",
    "zh-CN": "批量更新数据中心文件标签",
  },
  auth: "apiKey",
  usageArgs: "--doc-id <id> --tag <text> [flags]",
  flags: DOC_TAG_FLAGS,
  notes: [
    {
      "en-US":
        "The same tag set is applied to every --doc-id; run the command multiple times for different tag sets.",
      "zh-CN": "同一组标签会应用于每个 --doc-id；若需应用不同标签组，请多次运行该命令。",
    },
    {
      "en-US":
        "Server limits: up to 100 tags per file, total tag length up to 700 chars, tag up to 32 chars.",
      "zh-CN":
        "服务端限制：每个文件最多 100 个标签，标签总长度最多 700 个字符，单个标签最多 32 个字符。",
    },
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
