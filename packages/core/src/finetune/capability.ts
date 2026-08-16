import type { Settings } from "../config/schema.ts";
import { anonymousConsoleCall } from "../console/gateway.ts";
import { findModelByName } from "../console/models.ts";

/**
 * Training-type vocabulary exposed to users.
 *
 * Convention: the bare method name is **full-parameter** tuning; the `-lora`
 * suffix is the LoRA variant. This holds for `sft` and `dpo` (both have a
 * full + lora pair). `cpt` is the exception — the platform only supports
 * full-parameter CPT (no `cpt-lora` exists server-side), so it has no lora
 * sibling.
 *
 * Each CLI value maps 1:1 to a server `training_type`. The mapping happens at
 * the interface boundary (request body), so the rest of the CLI never sees the
 * raw server strings (`efficient_sft`, `dpo_full`, ...).
 */
export const TRAINING_TYPE_MAP = {
  sft: { server: "sft", method: "sft", variant: "full" },
  "sft-lora": { server: "efficient_sft", method: "sft", variant: "lora" },
  dpo: { server: "dpo_full", method: "dpo", variant: "full" },
  "dpo-lora": { server: "dpo_lora", method: "dpo", variant: "lora" },
  cpt: { server: "cpt", method: "cpt", variant: "full" },
} as const satisfies Record<string, { server: string; method: string; variant: string }>;

export type TrainingTypeCli = keyof typeof TRAINING_TYPE_MAP;

/** All accepted CLI training-type values (for whitelisting / help text). */
export const TRAINING_TYPES_CLI: readonly TrainingTypeCli[] = Object.keys(
  TRAINING_TYPE_MAP,
) as TrainingTypeCli[];

/** Default training type when `--training-type` is omitted. */
export const DEFAULT_TRAINING_TYPE: TrainingTypeCli = "sft-lora";

/** Subset of `supports` relevant to training capability. */
interface ModelSupports {
  sft?: boolean;
  dpo?: boolean;
  cpt?: boolean;
  [key: string]: unknown;
}

/**
 * A model record's training-capability fields. The full listFoundationModels
 * item carries many more fields; only these are consulted here.
 */
export interface ModelCapability {
  model?: string;
  supports?: ModelSupports;
  trainingTypes?: Record<string, string[]>;
  [key: string]: unknown;
}

/** True when `value` is one of the accepted CLI training types. */
export function isTrainingTypeCli(value: string): value is TrainingTypeCli {
  return value in TRAINING_TYPE_MAP;
}

/** The (method, variant) pair a CLI training type resolves to. */
export function trainingTypeMethodVariant(value: TrainingTypeCli): {
  method: string;
  variant: string;
} {
  const { method, variant } = TRAINING_TYPE_MAP[value];
  return { method, variant };
}

/**
 * Whether a model supports the given CLI training type.
 *
 * A model supports `<method>[-lora]` when both:
 *   1. `supports.<method> === true` (the high-level capability gate), and
 *   2. `trainingTypes.<method>` includes the corresponding variant
 *      (`full` for the bare name, `lora` for the `-lora` suffix).
 */
export function modelSupportsTrainingType(
  model: ModelCapability | undefined | null,
  value: TrainingTypeCli,
): boolean {
  if (!model) return false;
  const { method, variant } = TRAINING_TYPE_MAP[value];
  if (model.supports?.[method] !== true) return false;
  const variants = model.trainingTypes?.[method];
  return Array.isArray(variants) && variants.includes(variant);
}

/**
 * Every CLI training type a model supports, in canonical order
 * (sft, sft-lora, dpo, dpo-lora, cpt). Empty when the model carries no
 * capability metadata or supports none.
 */
export function listSupportedTrainingTypes(
  model: ModelCapability | undefined | null,
): TrainingTypeCli[] {
  if (!model) return [];
  return TRAINING_TYPES_CLI.filter((value) => modelSupportsTrainingType(model, value));
}

/**
 * Fetch a single model's foundation metadata by name (console gateway
 * `listFoundationModels` with a `name` filter). No console login required —
 * `listFoundationModels` is a public API, so only a DashScope API key is needed.
 *
 * Returns the first exact-model match, or `null` when nothing matches (the
 * server's `name` filter is a substring match, so we additionally require an
 * exact `model` equality to avoid e.g. `qwen3-8b` matching `qwen3-8b-v2`).
 */
export async function fetchModelCapability(
  settings: Settings,
  modelName: string,
): Promise<ModelCapability | null> {
  // Public model catalog — anonymous gateway call, no console token needed.
  const match = await findModelByName(anonymousConsoleCall(settings), modelName);
  return match as ModelCapability | null;
}
