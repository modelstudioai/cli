/**
 * Per-plan strategy table for `bl deploy create`.
 *
 * Each PlanStrategy owns one slice of plan-specific behaviour:
 *   - required-flag checks (returned as validate-style error strings)
 *   - any pre-flight side-effects (e.g. mu auto-picks a template from the
 *     catalog; lora/ptu are pure)
 *   - the plan-specific body fragment for POST /api/v1/deployments
 *
 * The dispatcher in `create.ts` only knows about `STRATEGIES[plan]`. Adding a
 * new plan = one new strategy object + one line in `STRATEGIES`. Nothing in
 * `create.ts` needs to change. This collapses the places where lora / ptu /
 * mu used to be hard-coded (default value list / required-flag checks /
 * auto-pick / body assembly) into one strategy entry per plan.
 */
import { listDeployableModels, BailianError, ExitCode, type Client } from "bailian-cli-core";
import { DEPLOY_PLAN, BILLING_METHOD, CHARGE_TYPE, DEFAULT_BILLING_METHOD } from "./constants.ts";

/** Plan-relevant subset of `deploy create` flags (parsed flags satisfy this shape). */
export interface CreatePlanFlags {
  plan?: string;
  deploySpec?: string;
  capacity?: number;
  billingMethod?: string;
  inputTpm?: number;
  outputTpm?: number;
  thinkingOutputTpm?: number;
}

export interface PlanContext {
  client: Client;
  /** True in --dry-run: strategies must skip side-effecting catalog lookups. */
  dryRun: boolean;
  /** CLI bin name, for usage hints in error messages. */
  binName: string;
  flags: CreatePlanFlags;
  /** Underlying model identifier (`--model`). */
  model: string;
  /** Console display name (`--name`). */
  name: string;
}

export interface PlanResolved {
  /**
   * Plan-specific fields to merge into the request body. The shared envelope
   * (`{model_name, name, plan}`) is added by the caller.
   */
  body: Record<string, unknown>;
}

export interface PlanStrategy {
  /** Plan id, matches `--plan` CLI value. */
  name: string;
  /** Returns an error message when required flags are missing; undefined to pass. */
  validateFlags(flags: CreatePlanFlags): string | undefined;
  /**
   * Resolve plan-specific bits to a body fragment. May call into the API
   * (e.g. mu auto-picks a template from the deployable-models catalog).
   */
  resolve(ctx: PlanContext): Promise<PlanResolved>;
}

/**
 * `lora` (Token-billed) — the CLI default. The API requires `capacity` even
 * though it is ignored for token-billed plans (per the working example), so
 * the CLI injects `1` as a placeholder.
 */
const loraStrategy: PlanStrategy = {
  name: DEPLOY_PLAN.LORA,
  validateFlags() {
    return undefined; /* no required flags */
  },
  async resolve(): Promise<PlanResolved> {
    return { body: { capacity: 1 } };
  },
};

/**
 * `ptu` (Token-billed, provisioned throughput). The platform rejects creation
 * without `ptu_capacity.input_tpm` / `output_tpm` ("Miss ptu capacity info")
 * even though the doc lists 10000/1000 defaults — so the CLI treats them as
 * required.
 */
const ptuStrategy: PlanStrategy = {
  name: DEPLOY_PLAN.PTU,
  validateFlags(flags) {
    if (flags.inputTpm === undefined || flags.outputTpm === undefined) {
      return "--input-tpm and --output-tpm are required for plan=ptu.";
    }
    return undefined;
  },
  async resolve(ctx: PlanContext): Promise<PlanResolved> {
    const ptuCapacity: Record<string, number> = {
      input_tpm: ctx.flags.inputTpm!,
      output_tpm: ctx.flags.outputTpm!,
    };
    if (ctx.flags.thinkingOutputTpm !== undefined) {
      ptuCapacity.thinking_output_tpm = ctx.flags.thinkingOutputTpm;
    }
    return { body: { ptu_capacity: ptuCapacity } };
  },
};

/**
 * `mu` (model-unit-billed). `capacity`, `billing_method` and `deploy_spec` are
 * all required by the API but every one has a CLI-side default:
 *   - billing_method defaults to POST_PAY (the only supported value).
 *   - deploy_spec auto-picks from GET /deployments/models — the one whose
 *     `charge_type` matches `billing_method`, else the first available.
 *   - capacity defaults to the template's `capacity_unit_per_instance` (the
 *     smallest valid multiple of base_capacity).
 *
 * The catalog lookup is skipped when `--deploy-spec` is supplied explicitly:
 * fine-tuned custom models may not appear in the `source=base` catalog, and
 * forcing the lookup would otherwise raise a spurious "no template" error.
 * It is also skipped in dry-run mode to keep `--dry-run` side-effect-free.
 */
const muStrategy: PlanStrategy = {
  name: DEPLOY_PLAN.MU,
  validateFlags() {
    return undefined; /* every required field has a default — nothing to assert up-front */
  },
  async resolve(ctx: PlanContext): Promise<PlanResolved> {
    const billingMethod = ctx.flags.billingMethod || DEFAULT_BILLING_METHOD;
    let deploySpec = ctx.flags.deploySpec;
    let capacity = ctx.flags.capacity;

    if (!ctx.dryRun && !deploySpec) {
      const noTemplateError = () =>
        new BailianError(
          `No mu-plan template found for model "${ctx.model}". ` +
            `Run \`${ctx.binName} deploy models --source base\` to inspect available models, ` +
            `or pass --deploy-spec explicitly.`,
          ExitCode.USAGE,
        );
      try {
        const resp = await listDeployableModels(ctx.client, {
          modelSource: "base",
          pageSize: 100,
          version: "v1.0",
        });
        const payload = resp.output ?? resp.data;
        const target = (payload?.models ?? []).find((model) => model.model_name === ctx.model);
        const muPlan = target?.plans?.find(({ plan }) => plan === DEPLOY_PLAN.MU);
        const templates = muPlan?.templates ?? [];
        if (templates.length === 0) throw noTemplateError();
        // POST_PAY → post_paid template; fall back to the first available.
        const wantChargeType =
          billingMethod === BILLING_METHOD.POST_PAY ? CHARGE_TYPE.POST_PAID : CHARGE_TYPE.PRE_PAID;
        const picked =
          templates.find((template) => template.charge_type === wantChargeType) ?? templates[0];
        if (!picked?.deploy_spec && !picked?.template_id) throw noTemplateError();
        deploySpec = picked.deploy_spec ?? picked.template_id;
        if (capacity === undefined) {
          capacity = picked.roles?.unified?.capacity_unit_per_instance ?? 1;
        }
      } catch (error) {
        if (error instanceof BailianError) throw error;
        throw new BailianError(
          `Failed to auto-pick template for plan=mu: ${(error as Error).message}. ` +
            `Pass --deploy-spec explicitly.`,
          ExitCode.USAGE,
        );
      }
    }

    const body: Record<string, unknown> = {
      capacity: capacity ?? 1,
      billing_method: billingMethod,
    };
    if (deploySpec) body.deploy_spec = deploySpec;
    return { body };
  },
};

/**
 * Registry of supported plans. Adding a new plan = one entry here. The
 * catalog lists some additional plan names (e.g. `ptu_v2`) that are NOT
 * accepted by the create endpoint, so the dispatcher in `create.ts` will
 * reject anything outside this table with a clear USAGE error.
 */
export const STRATEGIES: Record<string, PlanStrategy> = {
  [DEPLOY_PLAN.LORA]: loraStrategy,
  [DEPLOY_PLAN.PTU]: ptuStrategy,
  [DEPLOY_PLAN.MU]: muStrategy,
};

/** Throws USAGE if `plan` is not in the strategy table. */
export function pickPlanStrategy(plan: string): PlanStrategy {
  const strategy = STRATEGIES[plan];
  if (!strategy) {
    throw new BailianError(
      `Unsupported plan "${plan}". Supported plans: ${Object.keys(STRATEGIES).join(", ")}.`,
      ExitCode.USAGE,
    );
  }
  return strategy;
}
