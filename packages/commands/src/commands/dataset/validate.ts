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
      'Record schema: "chatml" (SFT), "dpo" (chosen/rejected), "cpt" (raw text), "tts" (audio), or "image" (image generation). Default auto-detects per record.',
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Locally validate a dataset file (.jsonl or .zip) without uploading",
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
    "Default scan: every line gets a structural check, then ~160 lines (front 50,",
    "evenly spaced 100, last 10) are JSON.parsed against the active schema.",
    "Schemas: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen,",
    'rejected}; cpt = {text:"..."} (continual pre-training, raw text);',
    'tts = {wav_fn:"train/xxx.wav", text:"..."} (audio fine-tuning);',
    'image = {img_path:"..."} (image generation). With no --schema, a record',
    "carrying wav_fn is validated as TTS, img_path as image, chosen/rejected",
    "as DPO, text (no messages) as CPT, otherwise ChatML. Pass --schema to",
    "require a specific shape on every record. ZIP archives (.zip) are",
    "validated structurally (data.jsonl present, media references resolve) in",
    "addition to per-record content checks. Use --full-validate to JSON.parse",
    "every line.",
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
