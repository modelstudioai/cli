/**
 * Training profile registry — single point of truth for which training types
 * the CLI supports.
 *
 * Routing: `--training-type <value>` → exact match on `clientTrainingType`.
 * Unknown values are rejected with a USAGE error listing all registered types.
 *
 * Adding a new training type:
 *   1. Create `<name>.ts` exporting a `TrainingProfile` constant.
 *   2. Import and append to `PROFILES`.
 * That's it. `create.ts` never needs to change.
 */
import { BailianError } from "../../errors/base.ts";
import { ExitCode } from "../../errors/codes.ts";
import type { TrainingProfile } from "./types.ts";
import { sftProfile } from "./sft.ts";
import { sftLoraProfile } from "./sft-lora.ts";
import { dpoProfile } from "./dpo.ts";
import { dpoLoraProfile } from "./dpo-lora.ts";
import { cptProfile } from "./cpt.ts";

const PROFILES: TrainingProfile[] = [
  sftProfile,
  sftLoraProfile,
  dpoProfile,
  dpoLoraProfile,
  cptProfile,
];

/** Look up a profile by its CLI training-type name. Throws USAGE if unknown. */
export function getProfile(clientTrainingType: string): TrainingProfile {
  const p = PROFILES.find((p) => p.clientTrainingType === clientTrainingType);
  if (!p) {
    const known = PROFILES.map((p) => p.clientTrainingType).join(", ");
    throw new BailianError(
      `Unknown training type "${clientTrainingType}".`,
      ExitCode.USAGE,
      `Supported training types: ${known}.`,
    );
  }
  return p;
}

/** All registered CLI training-type names (for help text / whitelisting). */
export function listTrainingTypes(): string[] {
  return PROFILES.map((p) => p.clientTrainingType);
}

export type { TrainingProfile } from "./types.ts";
export type { DataModality } from "./types.ts";
