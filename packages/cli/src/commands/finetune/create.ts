import {
  defineCommand,
  detectOutputFormat,
  createFineTune,
  getDataset,
  uploadDataset,
  validateDataset,
  fetchModelCapability,
  listSupportedTrainingTypes,
  isTrainingTypeCli,
  toServerTrainingType,
  TRAINING_TYPES_CLI,
  DEFAULT_TRAINING_TYPE,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
  type CreateFineTuneRequest,
  type FineTuneHyperParameters,
  type DatasetFile,
  type ValidationResult,
} from "bailian-cli-core";
import { existsSync, statSync } from "fs";
import { basename } from "path";
import { failIfMissing, promptConfirm } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

/**
 * A `--datasets` / `--validations` token is treated as a local file to upload
 * when it resolves to an existing file on disk; otherwise it is forwarded
 * verbatim as a previously-uploaded file-id (the `file-xxx` shape returned by
 * `bl dataset upload`). This lets users skip the manual upload step:
 * `--datasets ./train.jsonl` uploads then trains in one shot.
 */
function isLocalPath(token: string): boolean {
  return existsSync(token) && statSync(token).isFile();
}

/**
 * Format a single validation issue as a one-line string (mirrors
 * `dataset upload` so the error surface stays consistent across both
 * entry points into the same upload pipeline).
 */
function formatIssue(issue: ValidationResult["errors"][number]): string {
  const where: string[] = [];
  if (issue.line !== undefined) where.push(`line ${issue.line}`);
  if (issue.path) where.push(issue.path);
  const tag = where.length ? ` [${where.join(" · ")}]` : "";
  return `  ${issue.severity.toUpperCase()} ${issue.code}${tag}: ${issue.message}`;
}

interface ResolvedDataset {
  /** file-ids in input order (local uploads resolved to their new ids). */
  fileIds: string[];
  /** local paths that were uploaded (empty in dry-run). */
  uploaded: DatasetFile[];
  /** local paths recorded but not uploaded (dry-run only). */
  pendingPaths: string[];
  /** in-hand size for the first token, if known (avoids a redundant getDataset). */
  firstSize?: number;
}

/**
 * Resolve a comma-separated `--datasets` / `--validations` value into
 * file-ids, uploading any local paths through the same pipeline as
 * `bl dataset upload` (validate → upload). File-id tokens are passed through.
 *
 * In dry-run mode no upload happens: local paths are recorded in
 * `pendingPaths` and left in `fileIds` as-is so the previewed body still
 * reflects what the user typed.
 */
async function resolveDatasetTokens(
  config: Config,
  raw: string,
  purpose: string,
  label: string,
): Promise<ResolvedDataset> {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new BailianError(`--${label} must contain at least one entry.`, ExitCode.USAGE);
  }

  const fileIds: string[] = [];
  const uploaded: DatasetFile[] = [];
  const pendingPaths: string[] = [];
  let firstSize: number | undefined;

  for (const [index, token] of tokens.entries()) {
    if (!isLocalPath(token)) {
      fileIds.push(token);
      continue;
    }
    if (config.dryRun) {
      pendingPaths.push(token);
      fileIds.push(token);
      continue;
    }

    // Local path → validate then upload (same flow as `bl dataset upload`).
    const result = await validateDataset(token);
    if (!result.valid) {
      const lines = [
        `Dataset validation failed for ${token}`,
        ...result.errors.slice(0, 10).map(formatIssue),
      ];
      if (result.errors.length > 10) {
        lines.push(`  … and ${result.errors.length - 10} more error(s).`);
      }
      lines.push(
        "",
        "Hint: re-run `bl dataset validate --file <path>` for the full report,",
        "      or upload manually with `bl dataset upload --no-validate` and",
        "      pass the resulting file-id here.",
      );
      throw new BailianError(lines.join("\n"), ExitCode.GENERAL);
    }
    if (result.warnings.length > 0 && !config.quiet) {
      process.stderr.write(
        `Dataset validation passed with ${result.warnings.length} warning(s) for ${token}:\n`,
      );
      for (const warning of result.warnings.slice(0, 5)) {
        process.stderr.write(`${formatIssue(warning)}\n`);
      }
      if (result.warnings.length > 5) {
        process.stderr.write(`  … and ${result.warnings.length - 5} more.\n`);
      }
    }

    const file: DatasetFile = await uploadDataset(config, { filePath: token, purpose });
    if (!file.file_id) {
      throw new BailianError(
        `Upload of ${token} succeeded but no file_id was returned.`,
        ExitCode.GENERAL,
      );
    }
    uploaded.push(file);
    fileIds.push(file.file_id);
    if (index === 0) firstSize = file.size;

    if (!config.quiet) {
      process.stderr.write(
        `Uploaded ${basename(token)} → ${file.file_id} (auto from --${label})\n`,
      );
    }
  }

  return { fileIds, uploaded, pendingPaths, firstSize };
}

export default defineCommand({
  name: "finetune create",
  description: "Create a fine-tune job (sft | sft-lora | dpo | dpo-lora | cpt)",
  usage:
    "bl finetune create --model <model> --datasets <id|path,...> [--validations <id|path,...>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>] [--max-length <n>] [--training-type <sft|sft-lora|dpo|dpo-lora|cpt>] [--yes]",
  options: [
    {
      flag: "--model <model>",
      description: "Base model to fine-tune (e.g. qwen3-8b, qwen3-14b)",
      required: true,
    },
    {
      flag: "--datasets <ids|paths>",
      description:
        "Comma-separated dataset file IDs or local .jsonl paths. Local paths are uploaded (validated) first, then their file-ids are used.",
      required: true,
    },
    {
      flag: "--validations <ids|paths>",
      description:
        "Comma-separated validation dataset file IDs or local .jsonl paths (auto-uploaded like --datasets).",
    },
    {
      flag: "--model-name <name>",
      description: "Output model name (after training)",
    },
    {
      flag: "--suffix <text>",
      description: "Output suffix appended by the platform (finetuned_output_suffix)",
    },
    {
      flag: "--training-type <t>",
      description: `Training type: ${TRAINING_TYPES_CLI.join(" | ")} (default: ${DEFAULT_TRAINING_TYPE}). Mapping to the server happens at the interface boundary (e.g. sft-lora -> efficient_sft, dpo -> dpo_full).`,
    },
    {
      flag: "--n-epochs <n>",
      description: "Number of epochs (default: 3)",
      type: "number",
    },
    {
      flag: "--batch-size <n>",
      description:
        "Per-device batch size (clamped to [8, 1024]). Auto-set to 8 for small datasets (<100KB)",
      type: "number",
    },
    {
      flag: "--learning-rate <str>",
      description: 'Learning rate as a string to preserve precision (e.g. "1.6e-5")',
    },
    {
      flag: "--max-length <n>",
      description: "Max sequence length",
      type: "number",
    },
    {
      flag: "--yes",
      description: "Skip the confirmation prompt",
      type: "boolean",
    },
  ],
  examples: [
    "bl finetune create --model qwen3-8b --datasets file-xxx",
    "bl finetune create --model qwen3-8b --datasets ./train.jsonl",
    "bl finetune create --model qwen3-8b --datasets ./train.jsonl --validations ./eval.jsonl",
    "bl finetune create --model qwen3-8b --datasets file-aaa,./extra.jsonl",
    "bl finetune create --model qwen3-8b --datasets ./train.jsonl --training-type sft",
    'bl finetune create --model qwen3-8b --datasets file-xxx --learning-rate "1.6e-5" --n-epochs 4',
    "bl finetune create --model qwen3-8b --datasets file-xxx --yes --output json",
  ],
  notes: [
    "Training-type values use the `<method>` / `<method>-lora` convention:",
    "sft (full) | sft-lora (LoRA) | dpo (full) | dpo-lora (LoRA) | cpt. These map",
    "to the server's training_type at the interface boundary, so the rest of the",
    "CLI never sees the raw server strings.",
    "Before submitting (non dry-run) the job, the model's training capability is",
    "checked via listFoundationModels (no console login required); an unsupported",
    "training type fails fast with the list the model actually supports.",
    "n_epochs defaults to 3. Other hyper-parameters are platform defaults unless set.",
    "Learning rate is forwarded as a string to avoid JSON-number precision loss.",
    "--datasets / --validations accept either file-ids (from `bl dataset",
    "upload`) or local .jsonl paths. Local paths are validated and uploaded",
    "first, then their file-ids are submitted — a one-step upload-and-train.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const model = flags.model as string | undefined;
    if (!model) failIfMissing("model", "bl finetune create --model <model>");

    const datasetsRaw = flags.datasets as string | undefined;
    if (!datasetsRaw) failIfMissing("datasets", "bl finetune create --datasets <ids|paths>");

    const training = await resolveDatasetTokens(config, datasetsRaw!, "fine-tune", "datasets");
    const trainingFileIds = training.fileIds;

    const validationsRaw = flags.validations as string | undefined;
    const validation = validationsRaw
      ? await resolveDatasetTokens(config, validationsRaw, "fine-tune", "validations")
      : undefined;
    const validationFileIds = validation?.fileIds;

    const trainingType = (flags.trainingType as string | undefined) || DEFAULT_TRAINING_TYPE;
    // Whitelist is the single source of truth in core (TRAINING_TYPES_CLI);
    // any other value is rejected up-front with an actionable error.
    if (!isTrainingTypeCli(trainingType)) {
      throw new BailianError(
        `--training-type "${trainingType}" is not supported.`,
        ExitCode.USAGE,
        `Supported values: ${TRAINING_TYPES_CLI.join(", ")} (default: ${DEFAULT_TRAINING_TYPE}).`,
      );
    }
    const modelName = flags.modelName as string | undefined;
    const suffix = flags.suffix as string | undefined;

    // Hyper-parameters: inject n_epochs=3 default unless overridden.
    const hp: FineTuneHyperParameters = {};
    hp.n_epochs = flags.nEpochs !== undefined ? (flags.nEpochs as number) : 3;
    if (flags.learningRate !== undefined) hp.learning_rate = flags.learningRate as string;
    if (flags.maxLength !== undefined) hp.max_length = flags.maxLength as number;

    // batch_size: clamp to [8, 1024] (server hard constraint, undocumented).
    if (flags.batchSize !== undefined) {
      let batchSize = flags.batchSize as number;
      if (batchSize < 8) batchSize = 8;
      if (batchSize > 1024) batchSize = 1024;
      hp.batch_size = batchSize;
    }

    // Auto batch_size for small datasets: fetch first training file size.
    // With default split=0.9, validation_set = 0.1 * rows.
    // Platform default batch_size=16 needs rows > 160; batch_size=8 needs rows > 80.
    // Files < 100KB are conservatively estimated to have < 200 rows.
    // If the first file was just uploaded we already hold its size; otherwise
    // fall back to getDataset.
    let batchSizeAutoAdjusted = false;
    if (hp.batch_size === undefined && !config.dryRun) {
      let sizeBytes = training.firstSize ?? 0;
      if (sizeBytes === 0) {
        try {
          const fileInfo = await getDataset(config, trainingFileIds[0]);
          sizeBytes = fileInfo.data?.size ?? 0;
        } catch {
          // If we can't fetch file info, skip auto-adjustment; platform will use default.
        }
      }
      if (sizeBytes > 0 && sizeBytes < 100 * 1024) {
        hp.batch_size = 8;
        batchSizeAutoAdjusted = true;
      }
    }

    const body: CreateFineTuneRequest = {
      model: model!,
      training_file_ids: trainingFileIds,
      // Map the CLI training type to the server value at the interface boundary.
      training_type: toServerTrainingType(trainingType),
      hyper_parameters: hp,
    };
    if (validationFileIds && validationFileIds.length > 0) {
      body.validation_file_ids = validationFileIds;
    }
    if (modelName) body.model_name = modelName;
    if (suffix) body.finetuned_output_suffix = suffix;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      const pending = [
        ...training.pendingPaths.map((path) => ({ field: "datasets", path })),
        ...(validation?.pendingPaths ?? []).map((path) => ({ field: "validations", path })),
      ];
      emitResult(
        pending.length > 0
          ? { action: "finetune.create", body, pending_uploads: pending }
          : { action: "finetune.create", body },
        format,
      );
      return;
    }

    // Pre-flight capability check: confirm the model actually supports the
    // requested training type before consuming quota. listFoundationModels is a
    // public API (no console login needed); on any lookup failure we fall back
    // to letting the server decide rather than blocking the submit.
    const capability = await fetchModelCapability(config, model!);
    if (capability && !listSupportedTrainingTypes(capability).includes(trainingType)) {
      const supported = listSupportedTrainingTypes(capability);
      throw new BailianError(
        `Model "${model}" does not support training type "${trainingType}".`,
        ExitCode.USAGE,
        supported.length
          ? `This model supports: ${supported.join(", ")}.`
          : "This model reports no supported training types.",
      );
    }

    // Confirmation panel — destructive in the sense that it consumes quota.
    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      process.stderr.write("Create fine-tune job:\n");
      process.stderr.write(`  Model:          ${body.model}\n`);
      process.stderr.write(`  Training type:  ${trainingType}\n`);
      process.stderr.write(`  Training files: ${trainingFileIds.join(", ")}\n`);
      if (validationFileIds) {
        process.stderr.write(`  Validation:     ${validationFileIds.join(", ")}\n`);
      }
      for (const file of training.uploaded) {
        process.stderr.write(`  Uploaded:       ${file.name} → ${file.file_id}\n`);
      }
      for (const file of validation?.uploaded ?? []) {
        process.stderr.write(`  Uploaded:       ${file.name} → ${file.file_id} (validation)\n`);
      }
      process.stderr.write(`  n_epochs:       ${hp.n_epochs}\n`);
      if (hp.batch_size !== undefined) {
        const hint = batchSizeAutoAdjusted ? " (auto: small dataset)" : "";
        process.stderr.write(`  batch_size:     ${hp.batch_size}${hint}\n`);
      }
      if (hp.learning_rate !== undefined)
        process.stderr.write(`  learning_rate:  ${hp.learning_rate}\n`);
      if (hp.max_length !== undefined) process.stderr.write(`  max_length:     ${hp.max_length}\n`);
      if (modelName) process.stderr.write(`  model_name:     ${modelName}\n`);
      if (suffix) process.stderr.write(`  suffix:         ${suffix}\n`);
      const ok = await promptConfirm({ message: "Submit this job?", initialValue: false });
      if (!ok) {
        emitBare("Cancelled.");
        return;
      }
    } else if (!flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm fine-tune creation in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    const response = await createFineTune(config, body);
    const job = response.output ?? response.data;

    if (config.quiet) {
      if (job?.job_id) emitBare(job.job_id);
    } else if (format === "text") {
      if (job?.job_id) {
        emitBare(`Created fine-tune job: ${job.job_id}`);
        if (job.status) emitBare(`Status: ${job.status}`);
      } else {
        emitResult(response, format);
      }
    } else {
      emitResult(response, format);
    }
  },
});
