import { defineCommand, UsageError, type ParsexSubmitRequest } from "bailian-cli-core";
import {
  buildSubmitBody,
  integer,
  objectValue,
  PARSEX_NOTE,
  runSubmit,
  SUBMIT_FLAGS,
  SUBMIT_NOTE,
  WORKSPACE_FLAG,
} from "./shared.ts";

const FLAGS = {
  ...SUBMIT_FLAGS,
  fileUrl: { ...SUBMIT_FLAGS.fileUrl, required: true },
  outputFileFormat: {
    type: "array",
    valueHint: "<format>",
    choices: ["markdown"] as const,
    description: { "en-US": "Result file format (markdown)", "zh-CN": "结果文件格式（markdown）" },
  },
  layoutTableFormat: {
    type: "string",
    valueHint: "<format>",
    choices: ["markdown", "html"] as const,
    description: {
      "en-US": "Table format inside Markdown results",
      "zh-CN": "Markdown 结果中的表格格式",
    },
  },
  ...WORKSPACE_FLAG,
} as const;

function validateProcessing(body: ParsexSubmitRequest): void {
  const processing = body.processing;
  if (!processing) return;
  if (processing.user_prompt !== undefined && typeof processing.user_prompt !== "string")
    throw new UsageError(
      "processing.user_prompt must be a string. / processing.user_prompt 必须为字符串。",
    );
  for (const [field, booleans] of [
    ["doc_processing_config", ["head_foot", "layout_position", "image_caption"]],
    [
      "media_processing_config",
      [
        "enable_diarization",
        "enable_synopsis_parse",
        "enable_synopsis_segments",
        "enable_synopsis_summary",
      ],
    ],
  ] as const) {
    if (processing[field] === undefined) continue;
    const config = objectValue(processing[field], `processing.${field}`);
    for (const key of booleans) {
      if (config[key] !== undefined && typeof config[key] !== "boolean")
        throw new UsageError(`${field}.${key} must be boolean. / ${field}.${key} 必须为布尔值。`);
    }
    if (
      field === "doc_processing_config" &&
      config.page_index !== undefined &&
      (typeof config.page_index !== "string" || !/^1-[1-9]\d*$/.test(config.page_index))
    )
      throw new UsageError("page_index must use 1-n (n >= 1). / page_index 必须为 1-n（n >= 1）。");
    if (field !== "media_processing_config" || config.frame_extraction === undefined) continue;
    const frame = objectValue(config.frame_extraction, "frame_extraction");
    if (frame.mode !== undefined && !["auto", "frame_rate"].includes(frame.mode as string))
      throw new UsageError(
        "frame_extraction.mode must be auto or frame_rate. / 抽帧模式必须为 auto 或 frame_rate。",
      );
    if (frame.mode === "frame_rate" && frame.frame_rate === undefined)
      throw new UsageError(
        "frame_rate mode requires frame_rate. / frame_rate 模式需要提供 frame_rate。",
      );
    if (
      frame.frame_rate !== undefined &&
      (typeof frame.frame_rate !== "number" ||
        !Number.isFinite(frame.frame_rate) ||
        frame.frame_rate < 0.2 ||
        frame.frame_rate > 5)
    )
      throw new UsageError("frame_rate must be in [0.2, 5]. / 抽帧帧率必须在 [0.2, 5] 内。");
    for (const key of ["output_image_width", "output_image_height"])
      integer(frame[key] as number | undefined, key, 32, 4096);
  }
}

export default defineCommand({
  description: {
    "en-US": "Submit a ParseX document or media parsing task",
    "zh-CN": "提交 ParseX 文档或音视频解析任务",
  },
  auth: "apiKey",
  flags: FLAGS,
  usageArgs: "--file-url <url> [--workspace-id <id>] [flags]",
  notes: [
    PARSEX_NOTE,
    SUBMIT_NOTE,
    {
      "en-US":
        'processing.json example: {"doc_processing_config":{"page_index":"1-10","layout_position":true}}. For media use media_processing_config (diarization, synopsis and frame_extraction).',
      "zh-CN":
        'processing.json 示例：{"doc_processing_config":{"page_index":"1-10","layout_position":true}}。音视频使用 media_processing_config（人声分离、剧情解析及 frame_extraction）。',
    },
  ],
  exampleArgs: [
    '--file-url "https://example.com/document.pdf" --file-name document.pdf --workspace-id ws-example',
    '--file-url "https://example.com/document.pdf" --processing-file processing.json --output-file-format markdown --output json',
    '--file-url "https://example.com/video.mp4" --config-id config-example --dry-run',
  ],
  async validate(flags) {
    validateProcessing(await buildSubmitBody(flags));
  },
  async run(ctx) {
    const body = await buildSubmitBody(ctx.flags);
    validateProcessing(body);
    if (ctx.flags.outputFileFormat || ctx.flags.layoutTableFormat)
      body.output = {
        ...body.output,
        ...(ctx.flags.outputFileFormat ? { output_file_format: ctx.flags.outputFileFormat } : {}),
        ...(ctx.flags.layoutTableFormat
          ? { layout_table_format: ctx.flags.layoutTableFormat }
          : {}),
      };
    await runSubmit(ctx, "parse", body);
  },
});
