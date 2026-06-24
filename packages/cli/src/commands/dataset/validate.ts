import {
  defineCommand,
  detectOutputFormat,
  validateDataset,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
  type ValidationIssue,
  type ValidationResult,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

function formatIssue(i: ValidationIssue): string {
  const where: string[] = [];
  if (i.line !== undefined) where.push(`line ${i.line}`);
  if (i.path) where.push(i.path);
  const tag = where.length ? ` [${where.join(" · ")}]` : "";
  return `  ${i.severity.toUpperCase()} ${i.code}${tag}: ${i.message}`;
}

function formatStats(r: ValidationResult): string[] {
  const out: string[] = [];
  if (r.stats.totalRecords !== undefined) out.push(`records: ${r.stats.totalRecords}`);
  if (r.stats.sampledRecords !== undefined) out.push(`sampled: ${r.stats.sampledRecords}`);
  if (r.stats.bytes !== undefined) out.push(`bytes: ${r.stats.bytes}`);
  if (r.stats.durationMs !== undefined) out.push(`took: ${r.stats.durationMs}ms`);
  return out;
}

export default defineCommand({
  name: "dataset validate",
  description: "Locally validate a dataset file (.jsonl) without uploading",
  usage: "bl dataset validate --file <path> [--full-validate]",
  options: [
    { flag: "--file <path>", description: "Local .jsonl dataset file", required: true },
    {
      flag: "--full-validate",
      description: "JSON.parse every line instead of sampling (slower)",
      type: "boolean",
    },
  ],
  examples: [
    "bl dataset validate --file train.jsonl",
    "bl dataset validate --file eval.jsonl --full-validate",
    "bl dataset validate --file train.jsonl --output json",
  ],
  notes: [
    "Default scan: every line gets a structural check, then ~160 lines (front 50,",
    "evenly spaced 100, last 10) are JSON.parsed against the active schema.",
    "Today the only registered .jsonl schema is ChatML (messages array).",
    "Use --full-validate to JSON.parse every line.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const filePath = flags.file as string | undefined;
    if (!filePath) failIfMissing("file", "bl dataset validate --file <path>");

    const fullValidate = Boolean(flags.fullValidate);
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "dataset.validate", file: filePath, full: fullValidate }, format);
      return;
    }

    const result = await validateDataset(filePath!, { fullValidate });

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
        for (const e of result.errors.slice(0, 20)) emitBare(formatIssue(e));
        if (result.errors.length > 20) {
          emitBare(`  … and ${result.errors.length - 20} more.`);
        }
      }
      if (result.warnings.length) {
        emitBare(`Warnings (${result.warnings.length}):`);
        for (const w of result.warnings.slice(0, 10)) emitBare(formatIssue(w));
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
