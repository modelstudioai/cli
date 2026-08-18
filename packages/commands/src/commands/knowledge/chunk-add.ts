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
    description: { "en-US": "Knowledge base ID", "zh-CN": "知识库 ID" },
    required: true,
  },
  docId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US":
        "Owning document ID from the doc list command; required in practice for all knowledge base types",
      "zh-CN": "来自文档列表命令的所属文档 ID；实际使用时所有知识库类型都需要提供",
    },
  },
  content: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Chunk body text, up to 6000 chars (document-type); alternative to --content-file",
      "zh-CN": "Chunk 正文，最多 6000 个字符（文档型）；与 --content-file 二选一",
    },
  },
  contentFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Read chunk body from a UTF-8 plain text file (.md/.txt etc.)",
      "zh-CN": "从 UTF-8 纯文本文件（.md/.txt 等）读取 Chunk 正文",
    },
  },
  title: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Chunk title, up to 50 chars (document-type)",
      "zh-CN": "Chunk 标题，最多 50 个字符（文档型）",
    },
  },
  imageUrl: {
    type: "array",
    valueHint: "<url>",
    description: {
      "en-US": "Chunk image URL (repeatable, up to 10; document-type)",
      "zh-CN": "Chunk 图片 URL（可重复，最多 10 个；文档型）",
    },
  },
  field: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US":
        "Arbitrary field entry (repeatable) for table/image knowledge bases where keys are Excel column headers; mutually exclusive with content/title/image flags",
      "zh-CN":
        "表格/图片知识库的自定义字段（可重复），键为 Excel 列标题；不能与 content/title/image 相关选项同时使用",
    },
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
  description: {
    "en-US": "Add a chunk directly to a knowledge base",
    "zh-CN": "直接向知识库添加 Chunk",
  },
  auth: "apiKey",
  usageArgs: "--index-id <id> (--content <text> | --field <k=v>) [flags]",
  flags: CHUNK_ADD_FLAGS,
  notes: [
    {
      "en-US": "Document / table / image knowledge bases are supported; audio-video ones are not.",
      "zh-CN": "支持文档、表格和图片知识库；不支持音视频知识库。",
    },
    {
      "en-US":
        "--doc-id is required in practice for all knowledge base types. Use the document-level id from the doc list command; the per-row doc_id in chunk list output is not accepted.",
      "zh-CN":
        "实际使用时，所有知识库类型都需要 --doc-id。请使用文档列表命令返回的文档级 ID；Chunk 列表每行返回的 doc_id 不被接受。",
    },
    {
      "en-US":
        "Image-type documents do not support text chunks. Target a text-type document (docx/pdf/txt) instead.",
      "zh-CN": "图片型文档不支持文本 Chunk；请改为操作文本型文档（docx/pdf/txt）。",
    },
    {
      "en-US":
        "The API is idempotent but rate-limited to 10 calls per second — throttle batch scripts.",
      "zh-CN": "该 API 具有幂等性，但限流为每秒 10 次调用——批处理脚本需要控制速率。",
    },
    {
      "en-US": "The response carries no chunk id; list chunks afterwards to find the new one.",
      "zh-CN": "响应不包含 Chunk ID；添加后请列出 Chunk 以查找新条目。",
    },
    {
      "en-US":
        "For table/image knowledge bases use --field with Excel column headers as keys; values are passed through as strings.",
      "zh-CN": "表格/图片知识库请使用 --field，并以 Excel 列标题作为键；值将按字符串原样传递。",
    },
  ],
  exampleArgs: [
    {
      "en-US": '--index-id idx-xxx --content "chunk text" --title intro --workspace-id ws-xxx',
      "zh-CN": '--index-id idx-xxx --content "Chunk 文本" --title 简介 --workspace-id ws-xxx',
    },
    {
      "en-US": "--index-id idx-xxx --field columnA=v1 --field columnB=v2",
      "zh-CN": "--index-id idx-xxx --field 列A=v1 --field 列B=v2",
    },
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
        flags.contentFile !== undefined
          ? readUtf8TextFile(flags.contentFile, "--content")
          : flags.content;
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
