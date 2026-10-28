import { defineCommand, UsageError, type ParsedFlags } from "bailian-cli-core";
import {
  buildSubmitBody,
  nonEmpty,
  objectValue,
  PARSEX_NOTE,
  readObjectFile,
  runSubmit,
  SUBMIT_FLAGS,
  SUBMIT_NOTE,
  WORKSPACE_FLAG,
} from "./shared.ts";

const FLAGS = {
  ...SUBMIT_FLAGS,
  parsedFileBizId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Completed parsing task to reuse (alternative to --file-url)",
      "zh-CN": "复用已完成的解析任务（与 --file-url 二选一）",
    },
  },
  schemaFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "JSON Schema object file (alternative to --processing-file)",
      "zh-CN": "JSON Schema 对象文件（与 --processing-file 二选一）",
    },
  },
  userPrompt: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Extraction instruction (with --schema-file)",
      "zh-CN": "抽取指令（配合 --schema-file）",
    },
  },
  citationRequired: {
    type: "boolean",
    valueHint: "<boolean>",
    description: {
      "en-US": "Include citations (with --schema-file; service default: true)",
      "zh-CN": "返回引用（配合 --schema-file；服务默认 true）",
    },
  },
  allowInference: {
    type: "boolean",
    valueHint: "<boolean>",
    description: {
      "en-US": "Allow inference (with --schema-file; service default: false)",
      "zh-CN": "允许推断（配合 --schema-file；服务默认 false）",
    },
  },
  ...WORKSPACE_FLAG,
} as const;

async function buildBody(flags: ParsedFlags<typeof FLAGS>) {
  nonEmpty(flags.parsedFileBizId, "--parsed-file-biz-id");
  if ((flags.fileUrl !== undefined) === (flags.parsedFileBizId !== undefined))
    throw new UsageError(
      "Provide exactly one of --file-url or --parsed-file-biz-id. / --file-url 与 --parsed-file-biz-id 必须二选一。",
    );
  if (flags.schemaFile !== undefined && flags.processingFile !== undefined)
    throw new UsageError(
      "--schema-file and --processing-file are mutually exclusive. / --schema-file 与 --processing-file 不能同时使用。",
    );
  if (!flags.schemaFile && !flags.processingFile && !flags.configId)
    throw new UsageError(
      "Provide --schema-file, --processing-file or --config-id. / 请提供 --schema-file、--processing-file 或 --config-id。",
    );
  if (
    !flags.schemaFile &&
    [flags.userPrompt, flags.citationRequired, flags.allowInference].some(
      (value) => value !== undefined,
    )
  )
    throw new UsageError(
      "--user-prompt, --citation-required and --allow-inference require --schema-file. / 抽取快捷参数需配合 --schema-file。",
    );
  const body = await buildSubmitBody(flags);
  if (flags.parsedFileBizId !== undefined) body.parsed_file_biz_id = flags.parsedFileBizId;
  if (flags.schemaFile)
    body.processing = {
      ...(flags.userPrompt === undefined ? {} : { user_prompt: flags.userPrompt }),
      extract_processing_config: {
        extract_schema: await readObjectFile(flags.schemaFile, "--schema-file"),
        ...(flags.citationRequired === undefined
          ? {}
          : { citation_required: flags.citationRequired }),
        ...(flags.allowInference === undefined ? {} : { allow_inference: flags.allowInference }),
      },
    };
  if (body.processing) {
    if (
      body.processing.user_prompt !== undefined &&
      typeof body.processing.user_prompt !== "string"
    )
      throw new UsageError(
        "processing.user_prompt must be a string. / processing.user_prompt 必须为字符串。",
      );
    const config = objectValue(
      body.processing.extract_processing_config,
      "processing.extract_processing_config",
    );
    objectValue(config.extract_schema, "extract_schema");
    for (const key of ["citation_required", "allow_inference"]) {
      if (config[key] !== undefined && typeof config[key] !== "boolean")
        throw new UsageError(`${key} must be boolean. / ${key} 必须为布尔值。`);
    }
  }
  return body;
}

export default defineCommand({
  description: {
    "en-US": "Submit ParseX structured field extraction",
    "zh-CN": "提交 ParseX 结构化字段抽取任务",
  },
  auth: "apiKey",
  flags: FLAGS,
  usageArgs:
    "(--file-url <url> | --parsed-file-biz-id <id>) (--schema-file <path> | --processing-file <path> | --config-id <id>) [flags]",
  notes: [
    PARSEX_NOTE,
    SUBMIT_NOTE,
    {
      "en-US":
        'schema.json example: {"type":"object","properties":{"title":{"type":"string"}}}. The schema is sent as an object, not a JSON string. Extraction does not support audio/video; reused parse results must still be retained by the service.',
      "zh-CN":
        'schema.json 示例：{"type":"object","properties":{"title":{"type":"string"}}}。Schema 按对象传输，不转为 JSON 字符串。抽取不支持音视频；复用的解析结果必须仍在服务保留期内。',
    },
  ],
  exampleArgs: [
    '--file-url "https://example.com/contract.pdf" --schema-file schema.json --workspace-id ws-example',
    "--parsed-file-biz-id parse-example --schema-file schema.json --citation-required true --allow-inference false",
    '--file-url "https://example.com/contract.pdf" --config-id config-example --output json',
  ],
  async validate(flags) {
    await buildBody(flags);
  },
  async run(ctx) {
    await runSubmit(ctx, "extract", await buildBody(ctx.flags));
  },
});
