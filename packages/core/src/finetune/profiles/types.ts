/**
 * Training profile — single source of truth for "how a training type behaves".
 *
 * Each profile encapsulates everything the CLI needs to know about a specific
 * `--training-type` value: what file formats it accepts, how to validate data,
 * which hyper-parameters to use, which pre-flight gates to run, and whether
 * the model-capability check should be skipped.
 *
 * Profiles are **decoupled from validators**: the profile declares which file
 * extensions it accepts, and the data inspector (`dataset/inspect.ts`) detects
 * the data modality by parsing the file content. The profile then routes to
 * the appropriate validator internally — `create.ts` never sees an if-else
 * about modalities or file formats.
 *
 * Adding a new training type = one new profile file + one line in the registry.
 * Nothing in `create.ts` needs to change.
 */
import type { ValidateOpts, ValidationResult } from "../../dataset/validate/types.ts";

/**
 * Data modality detected by the inspector from file content.
 *
 * The inspector peeks at the first record of a JSONL or the `data.jsonl` inside
 * a ZIP to determine what kind of data the file carries. This is orthogonal to
 * the training type — `sft-lora` accepts both `.jsonl` (text) and `.zip`
 * (audio / image / video).
 *
 * `"image-i2i"` is a subtype of `"image"` — the first record contains an
 * `input_img` field (image-to-image). `"video-kf2v"` is a subtype of `"video"`
 * — the first record contains a `last_frame_path` field (first+last-frame video,
 * Wan kf2v). Profiles can branch on subtypes to adjust hyper-parameter defaults
 * or cross-check the chosen `--model`. Callers that don't care about a subtype
 * can normalise `"image-i2i"` → `"image"` and `"video-kf2v"` → `"video"`.
 */
export type DataModality = "text" | "audio" | "image" | "image-i2i" | "video" | "video-kf2v";

/**
 * A training profile. One per `--training-type` CLI value.
 *
 * The profile owns all modality-specific branching internally — callers
 * (`create.ts`) interact with it through a uniform interface and never need
 * to know whether the data is text, audio, or something else.
 */
export interface TrainingProfile {
  /** CLI vocabulary: the value users pass to `--training-type`. */
  clientTrainingType: string;

  /** Server `training_type` for the POST /fine-tunes request body. */
  serverTrainingType: string;

  /** File extensions this profile accepts (lower-case, with dot). */
  acceptedExtensions: string[];

  /**
   * Validate the training data file. The profile internally routes to the
   * correct validator based on `modality` (detected by the data inspector).
   */
  validate(filePath: string, modality: DataModality, opts: ValidateOpts): Promise<ValidationResult>;

  /**
   * Build the `hyper_parameters` object for the API request. Merges user-supplied
   * flags with modality-specific defaults (e.g. audio TTS uses `lm_max_epoch` /
   * `fm_max_epoch`, text SFT uses `n_epochs` / `batch_size`).
   */
  resolveHyperParameters(
    modality: DataModality,
    flags: Record<string, unknown>,
  ): Record<string, unknown>;

  /**
   * Whether a specific pre-flight gate should be skipped for the given modality.
   * Common gates: `"batch_size"` (samples must exceed batch_size), etc.
   * Audio TTS skips the batch-size gate (no batch_size hyper-parameter).
   */
  shouldSkipGate(gate: string, modality: DataModality): boolean;

  /**
   * Whether the model-capability pre-flight check should be skipped.
   * Audio models (e.g. cosyvoice-v3-flash) report `supports.sft = false` in
   * `listFoundationModels` but the API accepts `efficient_sft` — the check
   * would incorrectly block the submission.
   */
  shouldSkipCapabilityCheck(modality: DataModality): boolean;
}
