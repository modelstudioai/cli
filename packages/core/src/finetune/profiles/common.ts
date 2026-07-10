/**
 * Shared helpers for training profiles.
 *
 * Most text-based training types (sft, dpo, cpt, and their -lora variants)
 * share the same hyper-parameter resolution logic: n_epochs defaults to 3,
 * learning_rate and max_length are set only when explicitly provided, and
 * batch_size is clamped to the server's [8, 1024] range. Extracting this
 * into a single helper prevents drift when defaults or bounds change.
 */
import type { TrainingProfile, DataModality } from "./types.ts";
import type { ValidateOpts, ValidationResult } from "../../dataset/validate/types.ts";
import type { DatasetSchema } from "../../dataset/validate/types.ts";
import { validateDataset } from "../../dataset/validate/registry.ts";

/**
 * Resolve text-mode hyper-parameters from CLI flags.
 *
 * Shared by every profile's text branch (and by profiles that only support
 * text). The audio branch in `sft-lora` uses its own `AUDIO_HYPER_PARAMS`.
 */
export function resolveTextHyperParameters(
  flags: Record<string, unknown>,
): Record<string, unknown> {
  const hp: Record<string, unknown> = {};
  hp.n_epochs = flags.nEpochs !== undefined ? (flags.nEpochs as number) : 3;
  if (flags.learningRate !== undefined) hp.learning_rate = flags.learningRate as string;
  if (flags.maxLength !== undefined) hp.max_length = flags.maxLength as number;
  if (flags.batchSize !== undefined) {
    const requested = flags.batchSize as number;
    let batchSize = requested;
    if (batchSize < 8) batchSize = 8;
    if (batchSize > 1024) batchSize = 1024;
    hp.batch_size = batchSize;
  }
  return hp;
}

/**
 * Factory for text-only training profiles (sft, dpo, dpo-lora, cpt).
 *
 * These profiles are structurally identical — they differ only in three
 * string constants (CLI name, server name, record schema). Using a factory
 * eliminates four near-identical files and prevents drift when the
 * TrainingProfile interface changes.
 */
export function textProfile(
  clientTrainingType: string,
  serverTrainingType: string,
  schema: DatasetSchema,
): TrainingProfile {
  return {
    clientTrainingType,
    serverTrainingType,
    acceptedExtensions: [".jsonl"],

    async validate(
      filePath: string,
      _modality: DataModality,
      opts: ValidateOpts,
    ): Promise<ValidationResult> {
      return validateDataset(filePath, { ...opts, schema });
    },

    resolveHyperParameters(
      _modality: DataModality,
      flags: Record<string, unknown>,
    ): Record<string, unknown> {
      return resolveTextHyperParameters(flags);
    },

    shouldSkipGate(_gate: string, _modality: DataModality): boolean {
      return false;
    },

    shouldSkipCapabilityCheck(_modality: DataModality): boolean {
      return false;
    },
  };
}
