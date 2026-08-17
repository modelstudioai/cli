import {
  defineCommand,
  uploadDataset,
  validateDataset,
  parseDatasetSchemaFlag,
  formatIssue,
  MAX_DATASET_BYTES,
  MAX_CPT_BYTES,
  MAX_MEDIA_ZIP_BYTES,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const UPLOAD_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Local dataset file (.jsonl or .zip; ≤200MB SFT/DPO, ≤300MB CPT, ≤2GB media zip)",
    required: true,
  },
  purpose: {
    type: "string",
    valueHint: "<name>",
    description: 'Dataset purpose tag (default: "fine-tune"; e.g. "evaluation")',
  },
  schema: {
    type: "string",
    valueHint: "<s>",
    description:
      'Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "tts" (audio), "image" (image generation), or "video" (video generation). Default auto-detects per record.',
  },
  noValidate: {
    type: "switch",
    description: "Skip the local JSONL pre-flight check (not recommended)",
  },
  fullValidate: {
    type: "switch",
    description: "JSON.parse every line instead of sampling (slower)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Upload a dataset file (.jsonl or .zip) to Bailian",
  auth: "apiKey",
  usageArgs:
    "--file <path> [--purpose <name>] [--schema <chatml|dpo|cpt|tts|image|video>] [--no-validate] [--full-validate]",
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
    "Supports .jsonl (text) and .zip (audio/image archives with a data.jsonl",
    "manifest). Six record schemas are recognized: chatml = {messages:[...]}",
    '(SFT); dpo = {messages:[...], chosen, rejected}; cpt = {text:"..."}',
    '(continual pre-training, raw text); tts = {wav_fn:"train/xxx.wav",',
    'text:"..."} (audio fine-tuning); image = {img_path:"..."} (image',
    "generation); video = {first_frame_path:...} (video generation). With no",
    "--schema, a record carrying wav_fn is validated as TTS, img_path as image,",
    "chosen/rejected as DPO, text (no messages) as CPT, otherwise ChatML.",
    "Upload cap: 200MB SFT/DPO text, 300MB CPT, 2GB media zip. Upload uses the",
    "OpenAI-compatible /compatible-mode/v1/files endpoint so the purpose tag is",
    "persisted (the DashScope-native /api/v1/files drops it).",
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const filePath = flags.file;
    const purpose = flags.purpose || "fine-tune";
    const schema = parseDatasetSchemaFlag(flags.schema);
    // Size caps differ per training type: SFT/DPO 200MB, CPT 300MB, media ZIP 2GB.
    const isMediaSchema = schema === "image" || schema === "video";
    const maxBytes = isMediaSchema
      ? MAX_MEDIA_ZIP_BYTES
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
          max_bytes: maxBytes,
          validate: !flags.noValidate,
          schema: schema ?? "auto",
        },
        "json",
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
    } else {
      emitResult({ ...file, request_id }, "json");
    }
  },
});
