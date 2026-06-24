import {
  defineCommand,
  detectOutputFormat,
  uploadDataset,
  validateDataset,
  MAX_DATASET_BYTES,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
  type DatasetFile,
  type ValidationResult,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

/**
 * Format a single validation issue as a one-line string.
 */
function formatIssue(issue: ValidationResult["errors"][number]): string {
  const where: string[] = [];
  if (issue.line !== undefined) where.push(`line ${issue.line}`);
  if (issue.path) where.push(issue.path);
  const tag = where.length ? ` [${where.join(" · ")}]` : "";
  return `  ${issue.severity.toUpperCase()} ${issue.code}${tag}: ${issue.message}`;
}

export default defineCommand({
  name: "dataset upload",
  description: "Upload a dataset file (.jsonl) to Bailian",
  usage: "bl dataset upload --file <path> [--purpose <name>] [--no-validate] [--full-validate]",
  options: [
    {
      flag: "--file <path>",
      description: "Local .jsonl dataset file (≤300MB)",
      required: true,
    },
    {
      flag: "--purpose <name>",
      description: 'Dataset purpose tag (default: "fine-tune"; e.g. "evaluation")',
    },
    {
      flag: "--no-validate",
      description: "Skip the local JSONL pre-flight check (not recommended)",
      type: "boolean",
    },
    {
      flag: "--full-validate",
      description: "JSON.parse every line instead of sampling (slower)",
      type: "boolean",
    },
  ],
  examples: [
    "bl dataset upload --file train.jsonl",
    "bl dataset upload --file eval.jsonl --purpose evaluation",
    "bl dataset upload --file train.jsonl --full-validate",
    "bl dataset upload --file train.jsonl --no-validate",
  ],
  notes: [
    "Only .jsonl is supported in this release. The default validator expects a",
    'ChatML schema (each line a JSON object with a "messages" array). Other',
    "purposes may carry a different schema in the future and would be served",
    "by a purpose-specific validator at that point.",
    "The dataset upload cap is 300MB per file.",
    "Upload uses the OpenAI-compatible /compatible-mode/v1/files endpoint so",
    "the purpose tag is persisted (the DashScope-native /api/v1/files drops it).",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const filePath = flags.file as string | undefined;
    if (!filePath) failIfMissing("file", "bl dataset upload --file <path>");

    const purpose = (flags.purpose as string | undefined) || "fine-tune";
    const skipValidate = Boolean(flags.noValidate);
    const fullValidate = Boolean(flags.fullValidate);
    const format = detectOutputFormat(config.output);

    if (!skipValidate) {
      const result = await validateDataset(filePath!, { fullValidate });
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
          "Hint: re-run `bl dataset validate --file <path>` for the full report,",
          "      or pass --no-validate to skip this check at your own risk.",
        );
        throw new BailianError(lines.join("\n"), ExitCode.GENERAL);
      }
      // Surface warnings to stderr but keep going.
      if (result.warnings.length > 0 && !config.quiet) {
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

    if (config.dryRun) {
      emitResult(
        {
          action: "dataset.upload",
          file: filePath,
          purpose,
          max_bytes: MAX_DATASET_BYTES,
          validate: !skipValidate,
        },
        format,
      );
      return;
    }

    const uploaded: DatasetFile = await uploadDataset(config, {
      filePath: filePath!,
      purpose,
    });

    if (config.quiet) {
      emitBare(uploaded.file_id);
    } else if (format === "text") {
      emitBare(`Uploaded ${uploaded.name} → file_id=${uploaded.file_id}`);
    } else {
      emitResult(uploaded, format);
    }
  },
});
