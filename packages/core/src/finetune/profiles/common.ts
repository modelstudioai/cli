/**
 * Shared helpers for training profiles.
 *
 * Most text-based training types (sft, dpo, cpt, and their -lora variants)
 * share the same hyper-parameter resolution logic: only explicitly supplied
 * values are forwarded. Defaults and valid ranges come from the model-specific
 * training parameter schema returned by the service.
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
  if (flags.nEpochs !== undefined) hp.n_epochs = flags.nEpochs as number;
  if (flags.learningRate !== undefined) hp.learning_rate = flags.learningRate as string;
  if (flags.maxLength !== undefined) hp.max_length = flags.maxLength as number;
  if (flags.batchSize !== undefined) hp.batch_size = flags.batchSize as number;
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
