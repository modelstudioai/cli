import {
  defineCommand,
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
  type CommandContext,
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
  modality: DataModality,
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

    // The command's modality is authoritative; each local file is validated
    // under that modality's schema. Reuse the caller's pre-detected modality
    // when available to avoid opening the same file twice (matters for large
    // ZIPs).
    const tokenModality =
      knownModality && knownModality.path === token ? knownModality.modality : modality;

    // Local path → validate through the profile. The profile internally routes
    // to the correct validator based on modality. Upload is deferred to
    // `uploadResolvedLocal` so the gate can run first. `model` is forwarded for
    // schema-agnostic cross-checks.
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

/** The modality a `finetune <modality> create` subcommand is bound to. */
type CommandModality = "text" | "audio" | "image" | "video";

/**
 * Flags shared by every `finetune <modality> create` subcommand: what to train
 * (model), what data to train on (datasets / validations), and how to name the
 * output. Every modality's model consumes these.
 */
const COMMON_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: "Base model to fine-tune (e.g. qwen3-8b; not the output model name)",
    required: true,
  },
  datasets: {
    type: "string",
    valueHint: "<ids|paths>",
    description:
      "Comma-separated dataset file IDs or local paths (.jsonl for text, .zip for audio/image). Local paths are uploaded (validated) first, then their file-ids are used.",
    required: true,
  },
  validations: {
    type: "string",
    valueHint: "<ids|paths>",
    description:
      "Comma-separated validation dataset file IDs or local paths (auto-uploaded like --datasets).",
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
} satisfies FlagsDef;

/**
 * Text flags: text models consume the full hyper-parameter surface — training
 * type selection plus n_epochs / batch_size / learning_rate / max_length (see
 * resolveTextHyperParameters). Only text exposes --training-type because only
 * text models support types other than the sft-lora default.
 */
const TEXT_FLAGS = {
  ...COMMON_FLAGS,
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

/**
 * Audio (CosyVoice TTS) flags: the audio model runs sft-lora with a fully fixed
 * hyper-parameter set (AUDIO_HYPER_PARAMS). No --training-type or hyper-parameter
 * flag is honored by resolveHyperParameters, so none are exposed.
 */
const AUDIO_FLAGS = {
  ...COMMON_FLAGS,
} satisfies FlagsDef;

/**
 * Image (Wan generation) flags: the image model runs sft-lora with fixed
 * defaults; resolveHyperParameters only honors learning_rate, so --learning-rate
 * is the sole extra numeric knob. --generation-type declares T2I vs I2I
 * explicitly (the platform expects generation_type as a request field); it is
 * required to reach I2I from a bare file-id or in --dry-run, where the data
 * cannot be inspected.
 */
const IMAGE_FLAGS = {
  ...COMMON_FLAGS,
  generationType: {
    type: "string",
    choices: ["t2i", "i2i"] as const,
    valueHint: "<t2i|i2i>",
    description:
      "Generation type: t2i (default) | i2i. Sets generation_type/max_pixels. Required to train I2I from a file-id or with --dry-run (local data auto-detects input_img).",
  },
  learningRate: {
    type: "string",
    valueHint: "<str>",
    description: 'Learning rate as a string to preserve precision (e.g. "3e-5")',
  },
} satisfies FlagsDef;

const TEXT_USAGE =
  "--base-model <model> --datasets <id|path,...> [--validations <id|path,...>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>] [--max-length <n>] [--training-type <sft|sft-lora|dpo|dpo-lora|cpt>]";

const AUDIO_USAGE =
  "--base-model <model> --datasets <id|path> [--validations <id|path>] [--model-name <name>] [--suffix <text>]";

const IMAGE_USAGE =
  "--base-model <model> --datasets <id|path> [--validations <id|path>] [--model-name <name>] [--suffix <text>] [--generation-type <t2i|i2i>] [--learning-rate <str>]";

/**
 * Video (Wan i2v/kf2v) flags: exposes the three hyper-parameters that the
 * video API supports and users may want to override. Defaults are model-specific
 * (resolved by the sft-lora profile: wan2.7 → batch_size 1 / max_pixels 102400,
 * wan2.5 → 4 / 36864, wan2.2 → 4 / 262144).
 */
const VIDEO_FLAGS = {
  ...COMMON_FLAGS,
  nEpochs: {
    type: "number",
    valueHint: "<n>",
    description: "Training epochs (default: 50)",
  },
  batchSize: {
    type: "number",
    valueHint: "<n>",
    description: "Batch size (default: model-specific, 1 for wan2.7, 4 for wan2.5/2.2)",
  },
  learningRate: {
    type: "string",
    valueHint: "<str>",
    description: 'Learning rate as a string to preserve precision (default: "2e-5")',
  },
} satisfies FlagsDef;

const VIDEO_USAGE =
  "--base-model <model> --datasets <id|path> [--validations <id|path>] [--model-name <name>] [--suffix <text>] [--n-epochs <n>] [--batch-size <n>] [--learning-rate <str>]";

const COMMON_NOTES = [
  "Creating a job uploads any local datasets and consumes training quota.",
  "Use --dry-run to preview the request body without submitting.",
  "--datasets / --validations accept either file-ids (from `dataset upload`)",
  "or local paths. Local paths are validated and uploaded first, then their",
  "file-ids are submitted — a one-step upload-and-train.",
];

const TEXT_NOTES = [
  ...COMMON_NOTES,
  "Training-type values use the `<method>` / `<method>-lora` convention:",
  "sft (full) | sft-lora (LoRA) | dpo (full) | dpo-lora (LoRA) | cpt. These map",
  "to the server's training_type at the interface boundary, so the rest of the",
  "CLI never sees the raw server strings.",
  "Before submitting (non dry-run) the job, the model's training capability is",
  "checked via listFoundationModels (no console login required); an unsupported",
  "training type fails fast with the list the model actually supports.",
  "n_epochs defaults to 3. Other hyper-parameters are platform defaults unless set.",
  "Learning rate is forwarded as a string to avoid JSON-number precision loss.",
  "Pre-submit gate: if the training dataset's sample count is not greater",
  "than batch_size, the job is rejected before upload or quota consumption",
  "(the platform would otherwise fail ~10 min in, after data processing).",
];

const AUDIO_NOTES = [
  ...COMMON_NOTES,
  "Audio TTS training runs sft-lora (efficient_sft) with fixed CosyVoice",
  "hyper-parameter defaults; there are no training-type or hyper-parameter",
  "knobs to set.",
];

const IMAGE_NOTES = [
  ...COMMON_NOTES,
  "Image generation training runs sft-lora (efficient_sft) with fixed defaults;",
  "only --learning-rate is overridable. T2I vs I2I is declared with",
  "--generation-type (default t2i), which sets generation_type/max_pixels. For",
  "local data the type is auto-detected (records with input_img train I2I);",
  "pass --generation-type explicitly to train I2I from a file-id or in --dry-run.",
];

/**
 * Shared `finetune <modality> create` implementation. The parameter surface and
 * run logic are identical to the previous single `finetune create`; the ONLY
 * change is that the data modality is fixed by the subcommand instead of being
 * detected from data content. This is what lets file-id datasets (which have no
 * local file to inspect) train the correct model — the old command silently
 * defaulted a file-id to "text".
 *
 * Image is the only modality with a sub-variant (T2I vs I2I). It is upgraded to
 * `image-i2i` only when a local file's first record carries `input_img`; a bare
 * file-id defaults to plain "image" (T2I), matching the old detection fallback.
 */
async function runCreate<F extends FlagsDef>(
  commandModality: CommandModality,
  ctx: CommandContext<F>,
): Promise<void> {
  const { identity, settings } = ctx;
  const flags = ctx.flags as Record<string, unknown>;
  const model = flags.baseModel as string;
  const datasetsRaw = flags.datasets as string;

  // CosyVoice audio fine-tuning accepts exactly one training file
  // (`training_file_ids` supports a single ID per the speech-synthesis
  // contract). Reject a multi-token --datasets up-front so the job isn't
  // rejected server-side after an upload.
  if (commandModality === "audio") {
    const audioTokens = datasetsRaw
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    if (audioTokens.length > 1) {
      throw new BailianError(
        `Audio (TTS) fine-tuning accepts exactly one training file, got ${audioTokens.length}.`,
        ExitCode.USAGE,
        "Merge your recordings into a single .zip (or pass one file-id).",
      );
    }
  }

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

  // Profile: single source of truth for how this training type behaves
  // (validation rules, hyper-parameters, gates, capability check).
  const profile = getProfile(trainingType);

  // Modality is fixed by the subcommand (no content-based detection) — this is
  // the sole behavioural change of the modality split. Image alone has a T2I/I2I
  // sub-variant: an explicit --generation-type is authoritative (the only way to
  // reach I2I from a bare file-id or in --dry-run, where data can't be
  // inspected); otherwise a local file is probed to upgrade T2I → I2I, and a
  // bare file-id stays "image" (T2I).
  const firstLocalPath = datasetsRaw
    .split(",")
    .map((token) => token.trim())
    .find((token) => isLocalPath(token));
  let modality: DataModality = commandModality;
  if (commandModality === "image") {
    const generationType = flags.generationType as "t2i" | "i2i" | undefined;
    if (generationType === "i2i") {
      modality = "image-i2i";
    } else if (!generationType && firstLocalPath && !settings.dryRun) {
      const detected = await detectModality(firstLocalPath);
      if (detected === "image-i2i") modality = "image-i2i";
    }
  }
  if (commandModality === "video" && firstLocalPath && !settings.dryRun) {
    const detected = await detectModality(firstLocalPath);
    if (detected === "video-kf2v") modality = "video-kf2v";
  }

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
        flags.validations as string,
        "validations",
        profile,
        modality,
        model,
      )
    : undefined;
  const validationFileIds = validation?.fileIds;

  const modelName = flags.modelName as string | undefined;
  const suffix = flags.suffix as string | undefined;

  // Hyper-parameters: the profile resolves modality-specific defaults
  // (text: n_epochs/batch_size/learning_rate; audio: lm_max_epoch/fm_max_epoch/...).
  const hp = profile.resolveHyperParameters(
    modality,
    flags as Record<string, unknown>,
  ) as FineTuneHyperParameters;

  // Restore the batch-size clamping warning that was lost when the logic moved
  // into profiles. The profile silently clamps to [8, 1024]; surface it here
  // so the user has an audit trail. Skip modalities that bypass the batch_size
  // gate (image): their batch_size is a fixed model-family default, not a
  // clamp of the user's value, so the [8, 1024] "clamped" message would be
  // self-contradictory and misleading.
  if (
    flags.batchSize !== undefined &&
    hp.batch_size !== undefined &&
    !settings.quiet &&
    !profile.shouldSkipGate("batch_size", modality)
  ) {
    const requested = flags.batchSize as number;
    if (hp.batch_size !== requested) {
      process.stderr.write(
        `warning: --batch-size ${requested} clamped to ${hp.batch_size} ` +
          `(server range [8, 1024] for the common training types).\n`,
      );
    }
  }
  // For modalities that skip the batch_size gate, warn the user that their
  // explicit --batch-size was discarded (model uses a fixed batch_size).
  if (
    flags.batchSize !== undefined &&
    !settings.quiet &&
    profile.shouldSkipGate("batch_size", modality)
  ) {
    const requested = flags.batchSize as number;
    if (hp.batch_size !== undefined && hp.batch_size !== requested) {
      process.stderr.write(
        `warning: --batch-size ${requested} ignored for ${modality} training ` +
          `(model uses a fixed batch_size of ${hp.batch_size}).\n`,
      );
    }
  }

  // Auto batch_size for small datasets — only for text data. Audio/image
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
  // capability check) has cleared them. This swaps the placeholder path
  // entries in `training.fileIds` / `validation?.fileIds` for real file-ids.
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

  if (settings.dryRun) {
    const pending = [
      ...training.localPaths.map((path) => ({ field: "datasets", path })),
      ...(validation?.localPaths ?? []).map((path) => ({ field: "validations", path })),
    ];
    emitResult(
      pending.length > 0
        ? { action: "finetune.create", body, pending_uploads: pending }
        : { action: "finetune.create", body },
      "json",
    );
    return;
  }

  const response = await createFineTune(ctx.client, body);
  const job = response.output ?? response.data;

  if (settings.quiet) {
    if (job?.job_id) emitBare(job.job_id);
  } else {
    emitResult(response, "json");
  }
}

/** `bl finetune text create` — fine-tune a text model. Datasets are `.jsonl`. */
export const finetuneTextCreate = defineCommand({
  description: "Create a text model fine-tune job (sft | sft-lora | dpo | dpo-lora | cpt)",
  auth: "apiKey",
  usageArgs: TEXT_USAGE,
  flags: TEXT_FLAGS,
  exampleArgs: [
    "--base-model qwen3-8b --datasets file-xxx",
    "--base-model qwen3-8b --datasets ./train.jsonl",
    "--base-model qwen3-8b --datasets ./train.jsonl --validations ./eval.jsonl",
    "--base-model qwen3-8b --datasets file-aaa,./extra.jsonl",
    "--base-model qwen3-8b --datasets ./train.jsonl --training-type sft",
    '--base-model qwen3-8b --datasets file-xxx --learning-rate "1.6e-5" --n-epochs 4',
    "--base-model qwen3-8b --datasets file-xxx --output json",
    "--base-model qwen3-8b --datasets file-xxx --dry-run",
  ],
  notes: TEXT_NOTES,
  run: (ctx) => runCreate("text", ctx),
});

/** `bl finetune audio create` — fine-tune an audio TTS model. Datasets are `.zip`. */
export const finetuneAudioCreate = defineCommand({
  description: "Create an audio TTS model fine-tune job (sft-lora)",
  auth: "apiKey",
  usageArgs: AUDIO_USAGE,
  flags: AUDIO_FLAGS,
  exampleArgs: [
    "--base-model cosyvoice-v3-flash --datasets ./audio.zip",
    "--base-model cosyvoice-v3-flash --datasets file-xxx",
    "--base-model cosyvoice-v3-flash --datasets ./audio.zip --model-name my-tts",
    "--base-model cosyvoice-v3-flash --datasets file-xxx --output json",
    "--base-model cosyvoice-v3-flash --datasets ./audio.zip --dry-run",
  ],
  notes: AUDIO_NOTES,
  run: (ctx) => runCreate("audio", ctx),
});

/** `bl finetune image create` — fine-tune an image generation model. Datasets are `.zip`. */
export const finetuneImageCreate = defineCommand({
  description: "Create an image generation model fine-tune job (sft-lora)",
  auth: "apiKey",
  usageArgs: IMAGE_USAGE,
  flags: IMAGE_FLAGS,
  exampleArgs: [
    "--base-model wan2.7-image-pro --datasets ./images.zip",
    "--base-model wan2.7-image-pro --datasets file-xxx",
    "--base-model wan2.7-image-pro --datasets file-xxx --generation-type i2i",
    "--base-model wan2.7-image-pro --datasets ./images.zip --model-name my-wan",
    "--base-model wan2.7-image-pro --datasets file-xxx --output json",
    "--base-model wan2.7-image-pro --datasets ./images.zip --dry-run",
  ],
  notes: IMAGE_NOTES,
  run: (ctx) => runCreate("image", ctx),
});

const VIDEO_NOTES = [
  ...COMMON_NOTES,
  "Video generation training (Wan i2v/kf2v) runs efficient_sft with model-",
  "specific defaults: wan2.7 (batch_size=1, max_pixels=102400), wan2.5/2.2",
  "(batch_size=4, max_pixels per model). Override with --batch-size/--n-epochs.",
  "Datasets are .zip archives with data.jsonl + frame images + videos.",
  "Recommended: ≥10 training samples, 20-100 for stable results.",
];

/** `bl finetune video create` — fine-tune a video generation model. Datasets are `.zip`. */
export const finetuneVideoCreate = defineCommand({
  description: "Create a video generation model fine-tune job (Wan i2v/kf2v, efficient_sft)",
  auth: "apiKey",
  usageArgs: VIDEO_USAGE,
  flags: VIDEO_FLAGS,
  exampleArgs: [
    "--base-model wan2.7-i2v --datasets file-xxx",
    "--base-model wan2.7-i2v --datasets ./i2v-data.zip",
    "--base-model wan2.2-kf2v-flash --datasets file-xxx --n-epochs 100",
    "--base-model wan2.7-i2v --datasets file-xxx --dry-run",
  ],
  notes: VIDEO_NOTES,
  run: (ctx) => runCreate("video", ctx),
});
