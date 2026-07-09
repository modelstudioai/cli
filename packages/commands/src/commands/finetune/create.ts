import {
  defineCommand,
  detectOutputFormat,
  createFineTune,
  getDataset,
  uploadDataset,
  detectModality,
  getProfile,
  fetchModelCapability,
  listSupportedTrainingTypes,
  preflightBatchSizeGate,
  isTrainingTypeCli,
  TRAINING_TYPES_CLI,
  DEFAULT_TRAINING_TYPE,
  formatIssue,
  BailianError,
  ExitCode,
  type Client,
  type Settings,
  type CreateFineTuneRequest,
  type FineTuneHyperParameters,
  type DatasetFile,
  type TrainingProfile,
  type DataModality,
  type FlagsDef,
} from "bailian-cli-core";
import { existsSync, statSync } from "fs";
import { basename } from "path";
import { emitResult, emitBare } from "bailian-cli-runtime";

/**
 * A `--datasets` / `--validations` token is treated as a local file to upload
 * when it resolves to an existing file on disk; otherwise it is forwarded
 * verbatim as a previously-uploaded file-id (the `file-xxx` shape returned by
 * `dataset upload`). This lets users skip the manual upload step:
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
 * same pipeline as `dataset upload` (so structural errors surface here),
 * their sample count and size are captured for the pre-submit gate, and the
 * path itself is recorded in `localPaths` for a later, deferred upload.
 *
 * Splitting analysis from upload lets the batch-size gate fire before any
 * network call — a doomed job (too few samples) is rejected without burning an
 * upload, and is offline-testable. In dry-run mode local paths are not
 * validated (the preview never touches the network or the disk beyond stat).
 */
async function analyzeDatasetTokens(
  settings: Settings,
  binName: string,
  raw: string,
  label: string,
  profile: TrainingProfile,
  _modality: DataModality,
  model: string,
  /** Pre-detected modality for a known path (avoids re-opening the file). */
  knownModality?: { path: string; modality: DataModality },
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

    if (settings.dryRun) continue;

    // Detect modality per-file so each dataset is validated under the correct
    // schema (e.g. a text JSONL and an audio ZIP in the same --datasets list
    // are each validated with their own record schema). Reuse the caller's
    // pre-detected modality when available to avoid opening the same file
    // twice (matters for large ZIPs).
    const tokenModality =
      knownModality && knownModality.path === token
        ? knownModality.modality
        : await detectModality(token);

    // Local path → validate through the profile. The profile internally routes
    // to the correct validator based on modality (detected from file content).
    // Upload is deferred to `uploadResolvedLocal` so the gate can run first.
    // `model` is forwarded for schema-agnostic cross-checks (e.g. the video
    // validator verifies a kf2v model is paired with kf2v data).
    const result = await profile.validate(token, tokenModality, { model });
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
        `Hint: re-run \`${binName} dataset validate --file <path>\` for the full report,`,
        `      or upload manually with \`${binName} dataset upload --no-validate\` and`,
        "      pass the resulting file-id here.",
      );
      throw new BailianError(lines.join("\n"), ExitCode.GENERAL);
    }
    if (result.warnings.length > 0 && !settings.quiet) {
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
 * Returns the uploaded file records. No-op in dry-run. Validation already
 * happened in `analyzeDatasetTokens`, so this is pure upload.
 */
async function uploadResolvedLocal(
  client: Client,
  settings: Settings,
  resolved: ResolvedDataset,
  purpose: string,
  label: string,
): Promise<DatasetFile[]> {
  const uploaded: DatasetFile[] = [];
  for (const [index, token] of resolved.fileIds.entries()) {
    if (!isLocalPath(token)) continue;
    const file: DatasetFile = await uploadDataset(client, { filePath: token, purpose });
    if (!file.file_id) {
      throw new BailianError(
        `Upload of ${token} succeeded but no file_id was returned.`,
        ExitCode.GENERAL,
      );
    }
    uploaded.push(file);
    resolved.fileIds[index] = file.file_id;
    if (!settings.quiet) {
      process.stderr.write(
        `Uploaded ${basename(token)} → ${file.file_id} (auto from --${label})\n`,
      );
    }
  }
  return uploaded;
}

const CREATE_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: "Base model to fine-tune (e.g. qwen3-8b, qwen3-14b)",
    required: true,
  },
  datasets: {
    type: "string",
    valueHint: "<ids|paths>",
    description:
      "Comma-separated dataset file IDs or local .jsonl paths. Local paths are uploaded (validated) first, then their file-ids are used.",
    required: true,
  },
  validations: {
    type: "string",
    valueHint: "<ids|paths>",
    description:
      "Comma-separated validation dataset file IDs or local .jsonl paths (auto-uploaded like --datasets).",
  },
  modelName: {
    type: "string",
    valueHint: "<name>",
    description: "Output model name (after training)",
  },
  suffix: {
    type: "string",
    valueHint: "<text>",
    description: "Output suffix appended by the platform (finetuned_output_suffix)",
  },
  trainingType: {
    type: "string",
    valueHint: "<t>",
    description: `Training type: ${TRAINING_TYPES_CLI.join(" | ")} (default: ${DEFAULT_TRAINING_TYPE}). Mapping to the server happens at the interface boundary (e.g. sft-lora -> efficient_sft, dpo -> dpo_full).`,
  },
  nEpochs: {
    type: "number",
    valueHint: "<n>",
    description: "Number of epochs (default: 3)",
  },
  batchSize: {
    type: "number",
    valueHint: "<n>",
    description:
      "Per-device batch size (clamped to [8, 1024]). Auto-set to 8 for small datasets (<100KB)",
  },
  learningRate: {
    type: "string",
    valueHint: "<str>",
    description: 'Learning rate as a string to preserve precision (e.g. "1.6e-5")',
  },
  maxLength: {
    type: "number",
    valueHint: "<n>",
    description: "Max sequence length",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Create a fine-tune job (sft | sft-lora | dpo | dpo-lora | cpt)",
  auth: "apiKey",
  usageArgs:
    "--model <model> --datasets <id|path,...> [--validations <id|path,...>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>] [--max-length <n>] [--training-type <sft|sft-lora|dpo|dpo-lora|cpt>]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model qwen3-8b --datasets file-xxx",
    "--model qwen3-8b --datasets ./train.jsonl",
    "--model qwen3-8b --datasets ./train.jsonl --validations ./eval.jsonl",
    "--model qwen3-8b --datasets file-aaa,./extra.jsonl",
    "--model qwen3-8b --datasets ./train.jsonl --training-type sft",
    '--model qwen3-8b --datasets file-xxx --learning-rate "1.6e-5" --n-epochs 4',
    "--model qwen3-8b --datasets file-xxx --output json",
    "--model qwen3-8b --datasets file-xxx --dry-run",
  ],
  notes: [
    "Creating a job uploads any local datasets and consumes training quota.",
    "Use --dry-run to preview the request body without submitting.",
    "Training-type values use the `<method>` / `<method>-lora` convention:",
    "sft (full) | sft-lora (LoRA) | dpo (full) | dpo-lora (LoRA) | cpt. These map",
    "to the server's training_type at the interface boundary, so the rest of the",
    "CLI never sees the raw server strings.",
    "Before submitting (non dry-run) the job, the model's training capability is",
    "checked via listFoundationModels (no console login required); an unsupported",
    "training type fails fast with the list the model actually supports.",
    "n_epochs defaults to 3. Other hyper-parameters are platform defaults unless set.",
    "Learning rate is forwarded as a string to avoid JSON-number precision loss.",
    "--datasets / --validations accept either file-ids (from `dataset upload`)",
    "or local .jsonl paths. Local paths are validated and uploaded first, then",
    "their file-ids are submitted — a one-step upload-and-train.",
    "Dataset record schema is chosen from --training-type: dpo* → {messages,",
    "chosen, rejected}; cpt → {text} (raw pre-training text); else {messages}.",
    "Pre-submit gate: if the training dataset's sample count is not greater",
    "than batch_size, the job is rejected before upload or quota consumption",
    "(the platform would otherwise fail ~10 min in, after data processing).",
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const model = flags.model;
    const datasetsRaw = flags.datasets;

    // Resolve the training type before analyzing datasets so the validator can
    // enforce the right record schema (DPO jobs require chosen/rejected on
    // every record). Whitelist is the single source of truth in core
    // (TRAINING_TYPES_CLI); any other value is rejected up-front.
    const trainingType = flags.trainingType || DEFAULT_TRAINING_TYPE;
    if (!isTrainingTypeCli(trainingType)) {
      throw new BailianError(
        `--training-type "${trainingType}" is not supported.`,
        ExitCode.USAGE,
        `Supported values: ${TRAINING_TYPES_CLI.join(", ")} (default: ${DEFAULT_TRAINING_TYPE}).`,
      );
    }

    // Profile: single source of truth for how this training type behaves
    // (validation rules, hyper-parameters, gates, capability check).
    const profile = getProfile(trainingType);

    // Detect data modality from the first local file path in --datasets. This
    // drives the profile's internal branching (text vs audio vs image/video
    // hyper-parameters, gate skips, capability check bypass). Falls back to
    // "text" when no local file is available (file-id only). Image generation
    // has a subtype "image-i2i" (first record has input_img) picked here.
    const firstLocalPath = datasetsRaw
      .split(",")
      .map((token) => token.trim())
      .find((token) => isLocalPath(token));
    const modality: DataModality = firstLocalPath ? await detectModality(firstLocalPath) : "text";

    const training = await analyzeDatasetTokens(
      settings,
      identity.binName,
      datasetsRaw,
      "datasets",
      profile,
      modality,
      model,
      firstLocalPath ? { path: firstLocalPath, modality } : undefined,
    );
    const trainingFileIds = training.fileIds;

    const validation = flags.validations
      ? await analyzeDatasetTokens(
          settings,
          identity.binName,
          flags.validations,
          "validations",
          profile,
          modality,
          model,
        )
      : undefined;
    const validationFileIds = validation?.fileIds;

    const modelName = flags.modelName;
    const suffix = flags.suffix;

    // Hyper-parameters: the profile resolves modality-specific defaults
    // (text: n_epochs/batch_size/learning_rate; audio: lm_max_epoch/fm_max_epoch/...).
    const hp = profile.resolveHyperParameters(
      modality,
      flags as Record<string, unknown>,
    ) as FineTuneHyperParameters;

    // Restore the batch-size clamping warning that was lost when the logic moved
    // into profiles. The profile silently clamps to [8, 1024]; surface it here
    // so the user has an audit trail. Skip modalities that bypass the batch_size
    // gate (image/video): their batch_size is a fixed model-family default, not
    // a clamp of the user's value, so the [8, 1024] "clamped" message would be
    // self-contradictory (video uses 2/4) and misleading.
    if (
      flags.batchSize !== undefined &&
      hp.batch_size !== undefined &&
      !settings.quiet &&
      !profile.shouldSkipGate("batch_size", modality)
    ) {
      const requested = flags.batchSize;
      if (hp.batch_size !== requested) {
        process.stderr.write(
          `warning: --batch-size ${requested} clamped to ${hp.batch_size} ` +
            `(server range [8, 1024] for the common training types).\n`,
        );
      }
    }
    // For modalities that skip the batch_size gate (video: fixed 2/4 by model
    // family), warn the user that their explicit --batch-size was discarded.
    if (
      flags.batchSize !== undefined &&
      !settings.quiet &&
      profile.shouldSkipGate("batch_size", modality)
    ) {
      const requested = flags.batchSize;
      if (hp.batch_size !== undefined && hp.batch_size !== requested) {
        process.stderr.write(
          `warning: --batch-size ${requested} ignored for ${modality} training ` +
            `(model uses a fixed batch_size of ${hp.batch_size}).\n`,
        );
      }
    }

    // Auto batch_size for small datasets — only for text data. Audio/image/video
    // profiles already set their own batch parameters.
    if (modality === "text" && hp.batch_size === undefined && !settings.dryRun) {
      let sizeBytes = training.firstSize ?? 0;
      if (sizeBytes === 0) {
        try {
          const fileInfo = await getDataset(ctx.client, trainingFileIds[0]);
          sizeBytes = fileInfo.data?.size ?? 0;
        } catch {
          // If we can't fetch file info, skip auto-adjustment; platform will use default.
        }
      }
      if (sizeBytes > 0 && sizeBytes < 100 * 1024) {
        hp.batch_size = 8;
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
    // `BailianError` + issue convention used by `dataset upload`/`validate`.
    // ExitCode.GENERAL matches the existing validation-failed exit code.
    if (
      !settings.dryRun &&
      training.recordCount !== undefined &&
      !profile.shouldSkipGate("batch_size", modality)
    ) {
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
    if (!settings.dryRun && !profile.shouldSkipCapabilityCheck(modality)) {
      let capability: Awaited<ReturnType<typeof fetchModelCapability>> | undefined;
      try {
        capability = await fetchModelCapability(settings, model);
      } catch (error) {
        if (!settings.quiet) {
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

    // Upload local paths now that pre-flight (validation, batch-size gate,
    // capability check) has cleared them. This swaps the
    // placeholder path entries in `training.fileIds` / `validation?.fileIds`
    // for real file-ids, so the body below sees ids.
    if (!settings.dryRun) {
      await uploadResolvedLocal(ctx.client, settings, training, "fine-tune", "datasets");
      if (validation) {
        await uploadResolvedLocal(ctx.client, settings, validation, "fine-tune", "validations");
      }
    }

    const body: CreateFineTuneRequest = {
      model,
      training_file_ids: trainingFileIds,
      // Profile maps the CLI training type to the server value at the boundary.
      training_type: profile.serverTrainingType,
      hyper_parameters: hp,
    };
    if (validationFileIds && validationFileIds.length > 0) {
      body.validation_file_ids = validationFileIds;
    }
    if (modelName) body.model_name = modelName;
    if (suffix) body.finetuned_output_suffix = suffix;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
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

    const response = await createFineTune(ctx.client, body);
    const job = response.output ?? response.data;

    if (settings.quiet) {
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
