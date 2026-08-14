import {
  defineCommand,
  detectOutputFormat,
  uploadDataset,
  validateDataset,
  parseDatasetSchemaFlag,
  formatIssue,
  MAX_DATASET_BYTES,
  MAX_MEDIA_ZIP_BYTES,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

const UPLOAD_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Local dataset file (.jsonl or .zip; ≤300MB text, ≤1GB image)",
      "zh-CN": "本地数据集文件（.jsonl 或 .zip；文本不超过 300MB，图片不超过 1GB）",
    },
    required: true,
  },
  purpose: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": 'Dataset purpose tag (default: "fine-tune"; e.g. "evaluation")',
      "zh-CN": '数据集用途标签（默认："fine-tune"；例如 "evaluation"）',
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
  noValidate: {
    type: "switch",
    description: {
      "en-US": "Skip the local JSONL pre-flight check (not recommended)",
      "zh-CN": "跳过本地 JSONL 预检查（不推荐）",
    },
  },
  fullValidate: {
    type: "switch",
    description: {
      "en-US": "JSON.parse every line instead of sampling (slower)",
      "zh-CN": "使用 JSON.parse 检查每一行，而不是抽样检查（速度较慢）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Upload a dataset file (.jsonl or .zip) to Bailian",
    "zh-CN": "将数据集文件（.jsonl 或 .zip）上传到百炼",
  },
  auth: "apiKey",
  usageArgs:
    "--file <path> [--purpose <name>] [--schema <chatml|dpo|cpt|tts|image>] [--no-validate] [--full-validate]",
  flags: UPLOAD_FLAGS,
  exampleArgs: [
    "--file train.jsonl",
    "--file dpo.jsonl --schema dpo",
    "--file cpt.jsonl --schema cpt",
    "--file audio.zip --schema tts",
    "--file eval.jsonl --purpose evaluation",
    "--file train.jsonl --full-validate",
    "--file train.jsonl --no-validate",
  ],
  notes: [
    {
      "en-US":
        'Supports .jsonl (text) and .zip (audio/image archives with a data.jsonl manifest). Five record schemas are recognized: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen, rejected}; cpt = {text:"..."} (continual pre-training, raw text); tts = {wav_fn:"train/xxx.wav", text:"..."} (audio fine-tuning); image = {img_path:"..."} (image generation).',
      "zh-CN":
        '支持 .jsonl（文本）和 .zip（包含 data.jsonl 清单的音频/图片归档）。可识别五种记录 Schema：chatml = {messages:[...]}（SFT）；dpo = {messages:[...], chosen, rejected}；cpt = {text:"..."}（持续预训练，原始文本）；tts = {wav_fn:"train/xxx.wav", text:"..."}（音频微调）；image = {img_path:"..."}（图片生成）。',
    },
    {
      "en-US":
        "With no --schema, a record carrying wav_fn is validated as TTS, img_path as image, chosen/rejected as DPO, text (no messages) as CPT, otherwise ChatML.",
      "zh-CN":
        "未指定 --schema 时，包含 wav_fn 的记录按 TTS 验证，包含 img_path 的按 image 验证，包含 chosen/rejected 的按 DPO 验证，仅含 text（无 messages）的按 CPT 验证，其他记录按 ChatML 验证。",
    },
    {
      "en-US":
        "Upload cap: 300MB text, 1GB image. Upload uses the OpenAI-compatible /compatible-mode/v1/files endpoint so the purpose tag is persisted (the DashScope-native /api/v1/files drops it).",
      "zh-CN":
        "上传上限：文本 300MB，图片 1GB。上传使用 OpenAI 兼容的 /compatible-mode/v1/files Endpoint，以便保留 purpose 标签；DashScope 原生 /api/v1/files 会丢弃该标签。",
    },
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const filePath = flags.file;
    const purpose = flags.purpose || "fine-tune";
    const schema = parseDatasetSchemaFlag(flags.schema);
    if (schema === "video") {
      throw new BailianError(
        `--schema video is not supported.`,
        ExitCode.USAGE,
        `Supported schemas: chatml, dpo, cpt, tts, image.`,
      );
    }
    const format = detectOutputFormat(settings.output);
    // Image schema allows larger ZIPs (1 GB vs 300 MB for text).
    const isMediaSchema = schema === "image";

    if (!flags.noValidate) {
      const maxBytes = isMediaSchema ? MAX_MEDIA_ZIP_BYTES : MAX_DATASET_BYTES;
      const result = await validateDataset(filePath, {
        fullValidate: flags.fullValidate,
        schema,
        maxBytes,
      });
      if (!result.valid) {
        const lines = [
          `Dataset validation failed for ${filePath}`,
          ...result.errors.slice(0, 10).map(formatIssue),
        ];
        if (result.errors.length > 10) {
          lines.push(`  … and ${result.errors.length - 10} more error(s).`);
        }
        lines.push(
          "",
          `Hint: re-run \`${identity.binName} dataset validate --file <path>\` for the full report,`,
          "      or pass --no-validate to skip this check at your own risk.",
        );
        throw new BailianError(lines.join("\n"), ExitCode.GENERAL);
      }
      // Surface warnings to stderr but keep going.
      if (result.warnings.length > 0 && !settings.quiet) {
        process.stderr.write(
          `Dataset validation passed with ${result.warnings.length} warning(s):\n`,
        );
        for (const warning of result.warnings.slice(0, 5))
          process.stderr.write(`${formatIssue(warning)}\n`);
        if (result.warnings.length > 5) {
          process.stderr.write(`  … and ${result.warnings.length - 5} more.\n`);
        }
      }
    }

    if (settings.dryRun) {
      emitResult(
        {
          action: "dataset.upload",
          file: filePath,
          purpose,
          max_bytes: isMediaSchema ? MAX_MEDIA_ZIP_BYTES : MAX_DATASET_BYTES,
          validate: !flags.noValidate,
          schema: schema ?? "auto",
        },
        format,
      );
      return;
    }

    const uploaded = await uploadDataset(ctx.client, {
      filePath,
      purpose,
    });
    const { request_id, ...file } = uploaded;

    if (settings.quiet) {
      emitBare(file.file_id);
    } else if (format === "text") {
      emitBare(`Uploaded ${file.name} → file_id=${file.file_id}`);
      emitRequestId(request_id, settings.quiet);
    } else {
      emitResult({ ...file, request_id }, format);
    }
  },
});
