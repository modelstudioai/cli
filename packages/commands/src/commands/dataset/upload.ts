import {
  defineCommand,
  detectOutputFormat,
  uploadDataset,
  validateDataset,
  parseDatasetSchemaFlag,
  formatIssue,
  MAX_DATASET_BYTES,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
  type DatasetFile,
} from "bailian-cli-core";
import { failIfMissing } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Upload a dataset file (.jsonl) to Bailian",
  usageArgs:
    "--file <path> [--purpose <name>] [--schema <chatml|dpo|cpt>] [--no-validate] [--full-validate]",
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
      flag: "--schema <s>",
      description:
        'Record schema: "chatml" (SFT), "dpo" (chosen/rejected), or "cpt" (raw text). Default auto-detects per record.',
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
  exampleArgs: [
    "--file train.jsonl",
    "--file dpo.jsonl --schema dpo",
    "--file cpt.jsonl --schema cpt",
    "--file eval.jsonl --purpose evaluation",
    "--file train.jsonl --full-validate",
    "--file train.jsonl --no-validate",
  ],
  notes: [
    "Only .jsonl is supported in this release. Three record schemas are",
    "recognized: chatml = {messages:[...]} (SFT); dpo = {messages:[...],",
    "chosen, rejected} where chosen/rejected are single assistant messages;",
    'cpt = {text:"..."} (continual pre-training, raw text). With no --schema,',
    "a record carrying chosen/rejected is validated as DPO, one with text (and",
    "no messages) as CPT, otherwise as ChatML. Pass --schema dpo / cpt to",
    "require that shape on every record, or --schema chatml to ignore the",
    "preference / text fields. Other purposes may carry a different schema in",
    "the future and would be served by a purpose-specific validator.",
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
    const schema = parseDatasetSchemaFlag(flags.schema as string | undefined);
    const format = detectOutputFormat(config.output);

    if (!skipValidate) {
      const result = await validateDataset(filePath!, { fullValidate, schema });
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
          schema: schema ?? "auto",
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
    } else if (format === "rich") {
      emitBare(`Uploaded ${uploaded.name} → file_id=${uploaded.file_id}`);
    } else {
      emitResult(uploaded, format);
    }
  },
});
