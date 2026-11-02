import {
  defineCommand,
  uploadDataset,
  validateDataset,
  parseDatasetSchemaFlag,
  formatIssue,
  MAX_DATASET_BYTES,
  MAX_CPT_BYTES,
  MAX_DECISION_DATASET_BYTES,
  MAX_MEDIA_ZIP_BYTES,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";

const UPLOAD_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US":
        "Local dataset file (.jsonl or .zip; ≤200MB SFT/DPO, ≤300MB CPT/decision, ≤2GB media zip)",
      "zh-CN":
        "本地数据集文件（.jsonl 或 .zip；SFT/DPO 不超过 200MB，CPT/决策模型不超过 300MB，媒体 ZIP 不超过 2GB）",
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
        'Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "decision" (state/questions), "tts" (audio), "image" (image generation), or "video" (video generation). Default auto-detects per record.',
      "zh-CN":
        '记录 Schema："chatml"（SFT）、"dpo"（chosen/rejected）、"cpt"（原始文本）、"decision"（state/questions 决策数据）、"tts"（音频）、"image"（图片生成）或 "video"（视频生成）。默认逐条自动识别。',
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
  defaultOutput: "json",
  description: {
    "en-US": "Upload a dataset file (.jsonl or .zip) to Bailian",
    "zh-CN": "将数据集文件（.jsonl 或 .zip）上传到百炼",
  },
  auth: "apiKey",
  usageArgs:
    "--file <path> [--purpose <name>] [--schema <chatml|dpo|cpt|decision|tts|image|video>] [--no-validate] [--full-validate]",
  flags: UPLOAD_FLAGS,
  exampleArgs: [
    "--file train.jsonl",
    "--file dpo.jsonl --schema dpo",
    "--file cpt.jsonl --schema cpt",
    "--file decision.jsonl --schema decision",
    "--file audio.zip --schema tts",
    "--file eval.jsonl --purpose evaluation",
    "--file train.jsonl --full-validate",
    "--file train.jsonl --no-validate",
  ],
  notes: [
    {
      "en-US":
        'Supports .jsonl (text/decision) and .zip (audio/image/video archives with a data.jsonl manifest). Seven record schemas are recognized: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen, rejected}; cpt = {text:"..."}; decision = {state:{content}, questions:{...}}; tts = {wav_fn:"train/xxx.wav", text:"..."}; image = {img_path:"..."}; video = {first_frame_path:...}.',
      "zh-CN":
        '支持 .jsonl（文本/决策）和 .zip（包含 data.jsonl 清单的音频、图片或视频归档）。可识别七种记录 Schema：chatml = {messages:[...]}（SFT）；dpo = {messages:[...], chosen, rejected}；cpt = {text:"..."}；decision = {state:{content}, questions:{...}}；tts = {wav_fn:"train/xxx.wav", text:"..."}；image = {img_path:"..."}；video = {first_frame_path:...}。',
    },
    {
      "en-US":
        "With no --schema, state/questions is validated as decision data, wav_fn as TTS, img_path as image, chosen/rejected as DPO, text (no messages) as CPT, otherwise ChatML.",
      "zh-CN":
        "未指定 --schema 时，state/questions 记录按 decision 验证，包含 wav_fn 的按 TTS 验证，包含 img_path 的按 image 验证，包含 chosen/rejected 的按 DPO 验证，仅含 text（无 messages）的按 CPT 验证，其他记录按 ChatML 验证。",
    },
    {
      "en-US":
        "Upload cap: 200MB SFT/DPO text, 300MB CPT/decision data, 2GB media zip. For decision files over 200MB, pass --schema decision so the correct cap is applied. Upload uses the OpenAI-compatible /compatible-mode/v1/files endpoint so the purpose tag is persisted.",
      "zh-CN":
        "上传上限：SFT/DPO 文本 200MB、CPT/决策模型数据 300MB、媒体 ZIP 2GB。决策数据超过 200MB 时请显式传入 --schema decision，以应用正确上限。上传使用 OpenAI 兼容的 /compatible-mode/v1/files 接口，以确保持久化 purpose 标签。",
    },
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const filePath = flags.file;
    const purpose = flags.purpose || "fine-tune";
    const schema = parseDatasetSchemaFlag(flags.schema);
    // 大小上限按平台数据类型区分；自动识别仍采用保守的文本上限，避免放宽已有格式。
    const isMediaSchema = schema === "image" || schema === "video";
    const maxBytes = isMediaSchema
      ? MAX_MEDIA_ZIP_BYTES
      : schema === "decision"
        ? MAX_DECISION_DATASET_BYTES
        : schema === "cpt"
          ? MAX_CPT_BYTES
          : MAX_DATASET_BYTES;

    if (!flags.noValidate) {
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
      if (result.warnings.length > 0) {
        ctx.output.warning({
          code: "DATASET_VALIDATION_WARNINGS",
          message: {
            "en-US": `Dataset validation passed with ${result.warnings.length} warning(s).`,
            "zh-CN": `数据集校验通过，共 ${result.warnings.length} 条警告。`,
          },
          details: { file: filePath, warnings: result.warnings },
        });
      }
    }

    if (settings.dryRun) {
      const resultData1 = {
        action: "dataset.upload",
        file: filePath,
        purpose,
        max_bytes: maxBytes,
        validate: !flags.noValidate,
        schema: schema ?? "auto",
      };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }

    const uploaded = await uploadDataset(ctx.client, {
      filePath,
      purpose,
    });
    const { request_id, ...file } = uploaded;

    {
      const resultData2 = { ...file, request_id };
      ctx.output.result(
        resultData2,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData2, null, 2) } : undefined,
      );
    }
  },
});
