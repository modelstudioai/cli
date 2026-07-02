import {
  defineCommand,
  detectOutputFormat,
  validateDataset,
  parseDatasetSchemaFlag,
  formatIssue,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
  type ValidationResult,
} from "bailian-cli-core";
import { failIfMissing } from "bailian-cli-runtime";
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

export default defineCommand({
  description: "Locally validate a dataset file (.jsonl) without uploading",
  // 纯本地校验，不触网、不需 API key（与 `pipeline validate` 一致）。
  skipDefaultApiKeySetup: true,
  usageArgs: "--file <path> [--full-validate] [--schema <chatml|dpo|cpt>]",
  options: [
    { flag: "--file <path>", description: "Local .jsonl dataset file", required: true },
    {
      flag: "--full-validate",
      description: "JSON.parse every line instead of sampling (slower)",
      type: "boolean",
    },
    {
      flag: "--schema <s>",
      description:
        'Record schema: "chatml" (SFT), "dpo" (chosen/rejected), or "cpt" (raw text). Default auto-detects per record.',
    },
  ],
  exampleArgs: [
    "--file train.jsonl",
    "--file dpo.jsonl --schema dpo",
    "--file cpt.jsonl --schema cpt",
    "--file eval.jsonl --full-validate",
    "--file train.jsonl --output json",
  ],
  notes: [
    "Default scan: every line gets a structural check, then ~160 lines (front 50,",
    "evenly spaced 100, last 10) are JSON.parsed against the active schema.",
    "Schemas: chatml = {messages:[...]} (SFT); dpo = {messages:[...], chosen,",
    "rejected} where chosen/rejected are single assistant messages; cpt =",
    '{text:"..."} (continual pre-training, raw text). With no --schema, a',
    "record carrying chosen/rejected is validated as DPO, one with text (and no",
    "messages) as CPT, otherwise as ChatML. Pass --schema dpo / cpt to require",
    "that shape on every record (strict), or --schema chatml to ignore the",
    "preference / text fields. Use --full-validate to JSON.parse every line.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const filePath = flags.file as string | undefined;
    if (!filePath) failIfMissing("file", "bl dataset validate --file <path>");

    const fullValidate = Boolean(flags.fullValidate);
    const schema = parseDatasetSchemaFlag(flags.schema as string | undefined);
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult(
        {
          action: "dataset.validate",
          file: filePath,
          full: fullValidate,
          schema: schema ?? "auto",
        },
        format,
      );
      return;
    }

    const result = await validateDataset(filePath!, { fullValidate, schema });

    if (format === "json") {
      // For json output we always emit the structured result, exit code conveys validity.
      emitResult(result, format);
    } else if (config.quiet) {
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
