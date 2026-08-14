import {
  defineCommand,
  detectOutputFormat,
  validateDataset,
  parseDatasetSchemaFlag,
  formatIssue,
  BailianError,
  ExitCode,
  type ValidationResult,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

function formatStats(result: ValidationResult): string[] {
  const out: string[] = [];
  if (result.stats.totalRecords !== undefined) out.push(`records: ${result.stats.totalRecords}`);
  if (result.stats.sampledRecords !== undefined)
    out.push(`sampled: ${result.stats.sampledRecords}`);
  if (result.stats.bytes !== undefined) out.push(`bytes: ${result.stats.bytes}`);
  if (result.stats.durationMs !== undefined) out.push(`took: ${result.stats.durationMs}ms`);
  return out;
}

const VALIDATE_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Local dataset file (.jsonl or .zip)",
      "zh-CN": "本地数据集文件（.jsonl 或 .zip）",
    },
    required: true,
  },
  fullValidate: {
    type: "switch",
    description: {
      "en-US": "JSON.parse every line instead of sampling (slower)",
      "zh-CN": "使用 JSON.parse 检查每一行，而不是抽样检查（速度较慢）",
    },
  },
  schema: {
    type: "string",
    valueHint: "<s>",
    description: {
      "en-US":
        'Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "tts" (audio), or "image" (image generation). Default auto-detects per record.',
      "zh-CN":
        '记录 Schema："chatml"（SFT）、"dpo"（chosen/rejected）、"cpt"（原始文本）、"tts"（音频）或 "image"（图片生成）。默认逐条自动识别。',
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Locally validate a dataset file (.jsonl or .zip) without uploading",
    "zh-CN": "在本地验证数据集文件（.jsonl 或 .zip），不执行上传",
  },
  // 纯本地校验，不触网、不需 API key（与 `pipeline validate` 一致）。
  auth: "none",
  usageArgs: "--file <path> [--full-validate] [--schema <chatml|dpo|cpt|tts|image>]",
  flags: VALIDATE_FLAGS,
  exampleArgs: [
    "--file train.jsonl",
    "--file dpo.jsonl --schema dpo",
    "--file cpt.jsonl --schema cpt",
    "--file audio.zip --schema tts",
    "--file eval.jsonl --full-validate",
    "--file train.jsonl --output json",
  ],
  notes: [
    {
      "en-US":
        "Default scan: every line gets a structural check, then ~160 lines (front 50, evenly spaced 100, last 10) are JSON.parsed against the active schema.",
      "zh-CN":
        "默认扫描：先对每一行进行结构检查，再抽取约 160 行（前 50 行、均匀抽取 100 行、最后 10 行），使用 JSON.parse 按当前 Schema 验证。",
    },
    {
      "en-US":
        'Schemas: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen, rejected}; cpt = {text:"..."} (continual pre-training, raw text); tts = {wav_fn:"train/xxx.wav", text:"..."} (audio fine-tuning); image = {img_path:"..."} (image generation).',
      "zh-CN":
        'Schema：chatml = {messages:[...]}（SFT）；dpo = {messages:[...], chosen, rejected}；cpt = {text:"..."}（持续预训练，原始文本）；tts = {wav_fn:"train/xxx.wav", text:"..."}（音频微调）；image = {img_path:"..."}（图片生成）。',
    },
    {
      "en-US":
        "With no --schema, a record carrying wav_fn is validated as TTS, img_path as image, chosen/rejected as DPO, text (no messages) as CPT, otherwise ChatML. Pass --schema to require a specific shape on every record.",
      "zh-CN":
        "未指定 --schema 时，包含 wav_fn 的记录按 TTS 验证，包含 img_path 的按 image 验证，包含 chosen/rejected 的按 DPO 验证，仅含 text（无 messages）的按 CPT 验证，其他记录按 ChatML 验证。使用 --schema 要求每条记录符合指定结构。",
    },
    {
      "en-US":
        "ZIP archives (.zip) are validated structurally (data.jsonl present, media references resolve) in addition to per-record content checks. Use --full-validate to JSON.parse every line.",
      "zh-CN":
        "ZIP 归档（.zip）除逐条检查记录内容外，还会执行结构验证（存在 data.jsonl、媒体引用可解析）。使用 --full-validate 对每一行执行 JSON.parse。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const filePath = flags.file;
    const schema = parseDatasetSchemaFlag(flags.schema);
    if (schema === "video") {
      throw new BailianError(
        `--schema video is not supported.`,
        ExitCode.USAGE,
        `Supported schemas: chatml, dpo, cpt, tts, image.`,
      );
    }
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          action: "dataset.validate",
          file: filePath,
          full: flags.fullValidate,
          schema: schema ?? "auto",
        },
        format,
      );
      return;
    }

    const result = await validateDataset(filePath, { fullValidate: flags.fullValidate, schema });

    if (format === "json") {
      // For json output we always emit the structured result, exit code conveys validity.
      emitResult(result, format);
    } else if (settings.quiet) {
      emitBare(result.valid ? "ok" : "fail");
    } else {
      const status = result.valid ? "PASSED" : "FAILED";
      emitBare(`Dataset validation ${status} for ${result.filePath}`);
      const stats = formatStats(result);
      if (stats.length) emitBare(`  ${stats.join(" · ")}`);

      if (result.errors.length) {
        emitBare(`Errors (${result.errors.length}):`);
        for (const error of result.errors.slice(0, 20)) emitBare(formatIssue(error));
        if (result.errors.length > 20) {
          emitBare(`  … and ${result.errors.length - 20} more.`);
        }
      }
      if (result.warnings.length) {
        emitBare(`Warnings (${result.warnings.length}):`);
        for (const warning of result.warnings.slice(0, 10)) emitBare(formatIssue(warning));
        if (result.warnings.length > 10) {
          emitBare(`  … and ${result.warnings.length - 10} more.`);
        }
      }
    }

    if (!result.valid) {
      // Match the upload command's exit-code convention; details already printed.
      throw new BailianError(
        `Dataset validation failed: ${result.errors.length} error(s).`,
        ExitCode.GENERAL,
      );
    }
  },
});
