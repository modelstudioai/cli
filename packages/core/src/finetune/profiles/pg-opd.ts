/**
 * `pg-opd` profile — pure Model OPD distillation (server `pg_opd`).
 * ChatML record schema (prompt-only messages are accepted).
 *
 * Deliberately NOT registered in TRAINING_TYPE_MAP: OPD owns its command
 * surface (`finetune opd run`) and must stay unreachable from
 * `finetune text create --training-type`.
 *
 * Hyper-parameters come from the user's JSON file / --hp overrides, never
 * from flag-based defaults: the parameter API's recommend_value is not the
 * selected teacher's effective default, so the CLI fills nothing and leaves
 * omitted fields to the server's teacher resolution.
 */
import { textProfile } from "./common.ts";
import type { TrainingProfile } from "./types.ts";

const base = textProfile("pg-opd", "pg_opd", "chatml");

export const pgOpdProfile: TrainingProfile = {
  ...base,
  resolveHyperParameters: () => ({}),
  // OPD batch_size is a training-batch knob, not the per-device semantics the
  // samples>batch_size gate was built for; the gate's premise is unverified.
  shouldSkipGate: () => true,
  // The foundation catalog's capability shape for pg_opd is unverified;
  // teacher/student compatibility is decided by the server at submit time.
  shouldSkipCapabilityCheck: () => true,
};
