/**
 * `cpt` profile — Continual Pre-Training (full-parameter).
 * Maps to the server's `cpt` training type. CPT record schema.
 * CPT allows larger files (300 MB) compared to SFT/DPO (200 MB).
 */
import type { TrainingProfile, DataModality } from "./types.ts";
import type { ValidateOpts, ValidationResult } from "../../dataset/validate/types.ts";
import { validateDataset } from "../../dataset/validate/registry.ts";
import { resolveTextHyperParameters } from "./common.ts";
import { MAX_CPT_BYTES } from "../../dataset/validate/common.ts";

export const cptProfile: TrainingProfile = {
  clientTrainingType: "cpt",
  serverTrainingType: "cpt",
  acceptedExtensions: [".jsonl"],

  async validate(
    filePath: string,
    _modality: DataModality,
    opts: ValidateOpts,
  ): Promise<ValidationResult> {
    return validateDataset(filePath, { ...opts, schema: "cpt", maxBytes: MAX_CPT_BYTES });
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
