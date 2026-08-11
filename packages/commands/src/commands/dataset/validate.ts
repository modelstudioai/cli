import {
  defineCommand,
  validateDataset,
  parseDatasetSchemaFlag,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const VALIDATE_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Local dataset file (.jsonl or .zip)",
    required: true,
  },
  fullValidate: {
    type: "switch",
    description: "JSON.parse every line instead of sampling (slower)",
  },
  schema: {
    type: "string",
    valueHint: "<s>",
    description:
      'Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "tts" (audio), "image" (image generation), or "video" (video generation). Default auto-detects per record.',
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Locally validate a dataset file (.jsonl or .zip) without uploading",
  // 纯本地校验，不触网、不需 API key（与 `pipeline validate` 一致）。
  auth: "none",
  usageArgs: "--file <path> [--full-validate] [--schema <chatml|dpo|cpt|tts|image|video>]",
  flags: VALIDATE_FLAGS,
  exampleArgs: [
    "--file train.jsonl",
    "--file dpo.jsonl --schema dpo",
    "--file cpt.jsonl --schema cpt",
    "--file audio.zip --schema tts",
    "--file wan-i2v-training-dataset.zip --schema video",
    "--file eval.jsonl --full-validate",
    "--file train.jsonl --output json",
  ],
  notes: [
    "Default scan: every line gets a structural check, then ~160 lines (front 50,",
    "evenly spaced 100, last 10) are JSON.parsed against the active schema.",
    "Schemas: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen,",
    'rejected}; cpt = {text:"..."} (continual pre-training, raw text);',
    'tts = {wav_fn:"train/xxx.wav", text:"..."} (audio fine-tuning);',
    'image = {img_path:"..."} (image generation);',
    'video = {first_frame_path:"...", video_path:"..."} (video generation,',
    "i2v first-frame or kf2v first+last-frame with last_frame_path). With no",
    "--schema, a record carrying wav_fn is validated as TTS, img_path as image,",
    "first_frame_path/video_path as video, chosen/rejected as DPO, text (no",
    "messages) as CPT, otherwise ChatML. Pass --schema to require a specific",
    "shape on every record. ZIP archives (.zip) are validated structurally",
    "(data.jsonl present, media references resolve) in addition to per-record",
    "content checks. Use --full-validate to JSON.parse every line.",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const filePath = flags.file;
    const schema = parseDatasetSchemaFlag(flags.schema);
    if (settings.dryRun) {
      emitResult(
        {
          action: "dataset.validate",
          file: filePath,
          full: flags.fullValidate,
          schema: schema ?? "auto",
        },
        "json",
      );
      return;
    }

    const result = await validateDataset(filePath, { fullValidate: flags.fullValidate, schema });

    if (settings.quiet) {
      emitBare(result.valid ? "ok" : "fail");
    } else {
      emitResult(result, "json");
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
