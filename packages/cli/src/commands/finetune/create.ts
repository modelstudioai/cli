import {
  defineCommand,
  detectOutputFormat,
  createFineTune,
  getDataset,
  uploadDataset,
  validateDataset,
  fetchModelCapability,
  listSupportedTrainingTypes,
  preflightBatchSizeGate,
  isTrainingTypeCli,
  toServerTrainingType,
  TRAINING_TYPES_CLI,
  DEFAULT_TRAINING_TYPE,
  formatIssue,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
  type CreateFineTuneRequest,
  type FineTuneHyperParameters,
  type DatasetFile,
  type DatasetSchema,
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

interface ResolvedDataset {
  /**
   * Tokens in input order. Local paths are kept as-is here (a placeholder
   * until `uploadResolvedLocal` swaps them for real file-ids); bare file-ids
   * pass through untouched. In dry-run the paths stay (the previewed body
   * reflects exactly what the user typed).
   */
  fileIds: string[];
  /** Local paths in input order, for the deferred upload step. */
  localPaths: string[];
  /** In-hand size for the first local token, if known (local statSync). */
  firstSize?: number;
  /**
   * Total training-sample count across local tokens, when known. Sourced from
   * `validateDataset`'s `stats.totalRecords` (summed per token). Undefined when
   * any token is a bare file-id (no local file to count) or in dry-run — the
   * pre-submit batch-size gate only fires when this is known, so file-id flows
   * fall through to the platform rather than risk a false positive.
   */
  recordCount?: number;
}

/**
 * Analyze a comma-separated `--datasets` / `--validations` value WITHOUT
 * uploading: bare file-ids pass through; local paths are validated through the
 * same pipeline as `bl dataset upload` (so structural errors surface here),
 * their sample count and size are captured for the pre-submit gate, and the
 * path itself is recorded in `localPaths` for a later, deferred upload.
 *
 * Splitting analysis from upload lets the batch-size gate fire before any
 * network call — a doomed job (too few samples) is rejected without burning an
 * upload, and is offline-testable. In dry-run mode local paths are not
 * validated (the preview never touches the network or the disk beyond stat).
 */
async function analyzeDatasetTokens(
  config: Config,
  raw: string,
  label: string,
  schema?: DatasetSchema,
): Promise<ResolvedDataset> {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new BailianError(`--${label} must contain at least one entry.`, ExitCode.USAGE);
  }

  const fileIds: string[] = [];
  const localPaths: string[] = [];
  let firstSize: number | undefined;
  let recordCount: number | undefined;
  // A file-id token has no local file to count, so the total sample count is
  // only knowable when every token is a local path. Once any file-id is seen,
  // flip to unknown and stop accumulating to avoid an undercount that could
  // trip the batch-size gate falsely.
  let recordCountKnown = true;

  for (const token of tokens) {
    if (!isLocalPath(token)) {
      fileIds.push(token);
      recordCountKnown = false;
      continue;
    }

    fileIds.push(token);
    localPaths.push(token);

    if (config.dryRun) continue;

    // Local path → validate (same checks as `bl dataset upload`). Upload is
    // deferred to `uploadResolvedLocal` so the gate can run first. The schema
    // (SFT vs DPO) is derived from --training-type so a DPO job validates the
    // chosen/rejected preference pairs here, not on the platform.
    const result = await validateDataset(token, { schema });
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

    // Accumulate the sample count so the caller can pre-flight the batch-size
    // gate before submitting. `totalRecords` is set by the jsonl validator as
    // (non-blank lines); undefined stats fall back to "unknown" (no gate).
    const tokenRecords = result.stats.totalRecords;
    if (typeof tokenRecords === "number") {
      recordCount = (recordCount ?? 0) + tokenRecords;
    }
    if (firstSize === undefined) firstSize = statSync(token).size;
  }

  return {
    fileIds,
    localPaths,
    firstSize,
    recordCount: recordCountKnown ? recordCount : undefined,
  };
}

/**
 * Upload each local path recorded in `resolved.localPaths`, swapping the
 * placeholder path entries in `resolved.fileIds` for the returned file-ids.
 * Returns the uploaded file records (for the confirmation panel). No-op in
 * dry-run. Validation already happened in `analyzeDatasetTokens`, so this is
 * pure upload.
 */
async function uploadResolvedLocal(
  config: Config,
  resolved: ResolvedDataset,
  purpose: string,
  label: string,
): Promise<DatasetFile[]> {
  const uploaded: DatasetFile[] = [];
  for (const [index, token] of resolved.fileIds.entries()) {
    if (!isLocalPath(token)) continue;
    const file: DatasetFile = await uploadDataset(config, { filePath: token, purpose });
    if (!file.file_id) {
      throw new BailianError(
        `Upload of ${token} succeeded but no file_id was returned.`,
        ExitCode.GENERAL,
      );
    }
    uploaded.push(file);
    resolved.fileIds[index] = file.file_id;
    if (!config.quiet) {
      process.stderr.write(
        `Uploaded ${basename(token)} → ${file.file_id} (auto from --${label})\n`,
      );
    }
  }
  return uploaded;
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
    "Dataset record schema is chosen from --training-type: dpo* → {messages,",
    "chosen, rejected}; cpt → {text} (raw pre-training text); else {messages}.",
    "Pre-submit gate: if the training dataset's sample count is not greater",
    "than batch_size, the job is rejected before upload or quota consumption",
    "(the platform would otherwise fail ~10 min in, after data processing).",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const model = flags.model as string | undefined;
    if (!model) failIfMissing("model", "bl finetune create --model <model>");

    const datasetsRaw = flags.datasets as string | undefined;
    if (!datasetsRaw) failIfMissing("datasets", "bl finetune create --datasets <ids|paths>");

    // Resolve the training type before analyzing datasets so the validator can
    // enforce the right record schema (DPO jobs require chosen/rejected on
    // every record). Whitelist is the single source of truth in core
    // (TRAINING_TYPES_CLI); any other value is rejected up-front.
    const trainingType = (flags.trainingType as string | undefined) || DEFAULT_TRAINING_TYPE;
    if (!isTrainingTypeCli(trainingType)) {
      throw new BailianError(
        `--training-type "${trainingType}" is not supported.`,
        ExitCode.USAGE,
        `Supported values: ${TRAINING_TYPES_CLI.join(", ")} (default: ${DEFAULT_TRAINING_TYPE}).`,
      );
    }
    // dpo / dpo-lora → "dpo" schema (strict chosen/rejected); cpt → "cpt"
    // (raw {text} records); else ChatML ({messages}).
    const datasetSchema: DatasetSchema = trainingType.startsWith("dpo")
      ? "dpo"
      : trainingType === "cpt"
        ? "cpt"
        : "chatml";

    const training = await analyzeDatasetTokens(config, datasetsRaw!, "datasets", datasetSchema);
    const trainingFileIds = training.fileIds;

    const validationsRaw = flags.validations as string | undefined;
    const validation = validationsRaw
      ? await analyzeDatasetTokens(config, validationsRaw, "validations", datasetSchema)
      : undefined;
    const validationFileIds = validation?.fileIds;

    const modelName = flags.modelName as string | undefined;
    const suffix = flags.suffix as string | undefined;

    // Hyper-parameters: inject n_epochs=3 default unless overridden.
    const hp: FineTuneHyperParameters = {};
    hp.n_epochs = flags.nEpochs !== undefined ? (flags.nEpochs as number) : 3;
    if (flags.learningRate !== undefined) hp.learning_rate = flags.learningRate as string;
    if (flags.maxLength !== undefined) hp.max_length = flags.maxLength as number;

    // batch_size: clamp to [8, 1024] (server hard constraint, undocumented).
    // Surface the clamp on stderr instead of silently rewriting the user's
    // value — otherwise the confirmation panel below would show a number the
    // user never typed, with no audit trail. (Range observed on common SFT
    // / SFT-LoRA training types; some bases like qwen3.6-flash report a wider
    // range, so the warning explicitly mentions "server range".)
    if (flags.batchSize !== undefined) {
      const requested = flags.batchSize as number;
      let batchSize = requested;
      if (batchSize < 8) batchSize = 8;
      if (batchSize > 1024) batchSize = 1024;
      if (batchSize !== requested && !config.quiet) {
        process.stderr.write(
          `warning: --batch-size ${requested} clamped to ${batchSize} ` +
            `(server range [8, 1024] for the common training types).\n`,
        );
      }
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

    // Pre-submit batch-size gate: the platform rejects a job whose number of
    // training samples is not greater than batch_size, but only surfaces that
    // ~10 minutes into the run (after data processing). Fail fast here, before
    // burning quota. `recordCount` is only known when every --datasets token
    // was a local file we validated; file-id tokens fall through to the
    // platform rather than risk a false positive from an undercount.
    //
    // The decision lives in core (`preflightBatchSizeGate`) — a structured,
    // job-level pre-flight that returns a `ValidationIssue` (same shape / stable
    // code as `validateDataset`) so the failure surfaces through the same
    // `BailianError` + issue convention used by `bl dataset upload`/`validate`.
    // ExitCode.GENERAL matches the existing validation-failed exit code.
    if (!config.dryRun && training.recordCount !== undefined) {
      // 16 is the platform default when neither the user nor the small-file
      // auto-adjust set a batch_size (see the auto-adjust comment above).
      const effectiveBatchSize = hp.batch_size ?? 16;
      const gate = preflightBatchSizeGate({
        recordCount: training.recordCount,
        batchSize: effectiveBatchSize,
      });
      if (!gate.ok && gate.issue) {
        throw new BailianError(gate.issue.message, ExitCode.GENERAL, gate.hint);
      }
    }

    // Pre-flight capability check: confirm the model actually supports the
    // requested training type BEFORE any upload, so a wrong --model /
    // --training-type combo doesn't burn storage on datasets that will never
    // be trained against. listFoundationModels is a public API (no console
    // login required); on lookup failure (network / 401 / etc.) we fall back
    // to letting the server decide rather than blocking the submit.
    if (!config.dryRun) {
      let capability: Awaited<ReturnType<typeof fetchModelCapability>> | undefined;
      try {
        capability = await fetchModelCapability(config, model!);
      } catch (error) {
        if (!config.quiet) {
          process.stderr.write(
            `warning: model capability lookup failed (${(error as Error).message}); ` +
              "proceeding without local pre-flight.\n",
          );
        }
      }
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
    }

    // Non-interactive guard — moved BEFORE upload. In CI / scripted mode the
    // user must opt in via --yes; otherwise we must not silently consume quota
    // OR upload any file. (Local validation is still allowed to run.)
    if (!config.dryRun && !flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm fine-tune creation in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    // Upload local paths now that pre-flight (validation, batch-size gate,
    // capability check, non-interactive guard) has cleared them. This swaps
    // the placeholder path entries in `training.fileIds` / `validation?.fileIds`
    // for real file-ids, so the body and confirmation panel below see ids.
    let uploadedTraining: DatasetFile[] = [];
    let uploadedValidation: DatasetFile[] = [];
    if (!config.dryRun) {
      uploadedTraining = await uploadResolvedLocal(config, training, "fine-tune", "datasets");
      if (validation) {
        uploadedValidation = await uploadResolvedLocal(
          config,
          validation,
          "fine-tune",
          "validations",
        );
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
        ...training.localPaths.map((path) => ({ field: "datasets", path })),
        ...(validation?.localPaths ?? []).map((path) => ({ field: "validations", path })),
      ];
      emitResult(
        pending.length > 0
          ? { action: "finetune.create", body, pending_uploads: pending }
          : { action: "finetune.create", body },
        format,
      );
      return;
    }

    // Confirmation panel — destructive in the sense that it consumes quota.
    // (Capability check and non-interactive guard already ran pre-upload.)
    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      process.stderr.write("Create fine-tune job:\n");
      process.stderr.write(`  Model:          ${body.model}\n`);
      process.stderr.write(`  Training type:  ${trainingType}\n`);
      process.stderr.write(`  Training files: ${trainingFileIds.join(", ")}\n`);
      if (validationFileIds) {
        process.stderr.write(`  Validation:     ${validationFileIds.join(", ")}\n`);
      }
      for (const file of uploadedTraining) {
        process.stderr.write(`  Uploaded:       ${file.name} → ${file.file_id}\n`);
      }
      for (const file of uploadedValidation) {
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
