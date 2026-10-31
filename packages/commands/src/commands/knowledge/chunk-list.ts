import { validateNonemptyFlags } from "./nonempty-flags.ts";
import { firstNonEmptyText, mediaSummary } from "./media-output.ts";
import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  type FlagsDef,
  type RagChunkListResponse,
} from "bailian-cli-core";
import { resolveWorkspaceId, PAGE_FLAGS, WORKSPACE_FLAG } from "./shared.ts";

const CHUNK_LIST_FLAGS = {
  indexId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  docId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Only show chunks belonging to this document",
      "zh-CN": "仅显示属于该文档的 Chunk",
    },
  },
  ...PAGE_FLAGS,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List chunks in a knowledge base with content and status",
    "zh-CN": "列出知识库中的 Chunk 及其内容和状态",
  },
  auth: "apiKey",
  usageArgs: "--index-id <id> [flags]",
  flags: CHUNK_LIST_FLAGS,
  notes: [
    {
      "en-US":
        "Use metadata._id as the chunk id and metadata.doc_id as the document id in chunk update/delete commands.",
      "zh-CN":
        "在 Chunk 更新/删除命令中，使用 metadata._id 作为 Chunk ID，使用 metadata.doc_id 作为文档 ID。",
    },
    {
      "en-US": "Page size defaults to 20 (server default), max 100.",
      "zh-CN": "分页大小默认为 20（服务端默认值），最大为 100。",
    },
  ],
  exampleArgs: [
    "--index-id idx-xxx --workspace-id ws-xxx",
    "--index-id idx-xxx --doc-id file-xxx --page-size 50",
  ],
  validate(flags) {
    const nonemptyError = validateNonemptyFlags({ "index-id": flags.indexId });
    if (nonemptyError) return nonemptyError;

    if (flags.pageSize !== undefined && (flags.pageSize < 1 || flags.pageSize > 100)) {
      return "--page-size must be between 1 and 100";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = settings.output;

    // Gotcha: this endpoint's pagination keys are pageNum/pageSize (camelCase, in the body)
    const body = {
      indexId: flags.indexId,
      pageNum: flags.pageNumber ?? 1,
      pageSize: flags.pageSize ?? 20,
      ...(flags.docId ? { docId: flags.docId } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.chunkList);

    if (settings.dryRun) {
      ctx.output.result({ endpoint, request: body });
      return;
    }

    const response = await ctx.client.requestJson<RagChunkListResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    let text: string | undefined;
    if (format === "text") {
      const nodes = response.data?.nodes ?? [];
      const lines: string[] = [];
      if (nodes.length === 0) {
        lines.push(ctx.localize({ "en-US": "No chunks found.", "zh-CN": "未找到切片。" }));
      } else {
        for (const node of nodes) {
          const metadata = node.metadata ?? {};
          const statusPart = metadata._chunk_status_message
            ? ctx.localize({
                "en-US": `  status: ${metadata._chunk_status_message}`,
                "zh-CN": `  状态: ${metadata._chunk_status_message}`,
              })
            : "";
          const excludedPart =
            metadata.is_displayed_chunk_content === false
              ? ctx.localize({ "en-US": "  [excluded from retrieval]", "zh-CN": "  [不参与检索]" })
              : "";
          lines.push(
            ctx.localize({
              "en-US": `[chunk] ${metadata._id ?? "?"}  (doc: ${metadata.doc_name ?? "?"}, doc_id: ${metadata.doc_id ?? "?"})${statusPart}${excludedPart}`,
              "zh-CN": `[切片] ${metadata._id ?? "?"}  (文档: ${metadata.doc_name ?? "?"}, doc_id: ${metadata.doc_id ?? "?"})${statusPart}${excludedPart}`,
            }),
          );
          const contentText = firstNonEmptyText(
            metadata.content,
            node.text,
            metadata.clip_description,
          );
          lines.push(
            `  ${contentText.length > 200 ? `${contentText.slice(0, 200)}…` : contentText}`,
          );
          for (const line of mediaSummary(metadata)) lines.push(`  ${line}`);
        }
      }
      lines.push(
        ctx.localize({
          "en-US": `total: ${response.data?.total ?? nodes.length}`,
          "zh-CN": `总数: ${response.data?.total ?? nodes.length}`,
        }),
      );
      text = lines.join("\n");
    }
    ctx.output.result(response, text === undefined ? undefined : { text });
  },
});
