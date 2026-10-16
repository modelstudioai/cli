/**
 * Per-plan strategy table for `deploy <modality> create`.
 *
 * Each PlanStrategy owns one slice of plan-specific behaviour:
 *   - required-flag checks (returned as validate-style error strings)
 *   - any pre-flight side-effects (e.g. mu auto-picks a template from the
 *     catalog; lora/ptu are pure)
 *   - the plan-specific body fragment for POST /api/v1/deployments
 *
 * The dispatcher in the `deploy <modality> create` command only knows about
 * `STRATEGIES[plan]`. Adding a new plan = one new strategy object + one line in
 * `STRATEGIES`. Nothing in the command needs to change. This collapses the
 * places where lora / ptu / mu used to be hard-coded (default value list /
 * required-flag checks / auto-pick / body assembly) into one strategy entry per
 * plan.
 */
import { listDeployableModels } from "./api.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { Client } from "../client/client.ts";
import { DEPLOY_PLAN, BILLING_METHOD, CHARGE_TYPE, DEFAULT_BILLING_METHOD } from "./constants.ts";
import {
  buildPrepaidInfo,
  buildReservationCapacity,
  hasPrepaidFlags,
  validatePrepaidFlags,
  validateReservationCapacity,
  type ReservationFlags,
} from "./reservation.ts";

/** Plan-relevant subset of `deploy <modality> create` flags (parsed flags satisfy this shape). */
export interface CreatePlanFlags extends ReservationFlags {
  plan?: string;
  deploySpec?: string;
  capacity?: number;
  billingMethod?: string;
  chargeType?: string;
  serviceTier?: string;
  suffix?: string;
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
  /** Optional console display name (`--name`); PTU can use the generated name. */
  name?: string;
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

/** PTU reservation creation buys the first instance; capacity is expressed in kTPM. */
const ptuStrategy: PlanStrategy = {
  name: DEPLOY_PLAN.PTU,
  validateFlags(flags) {
    if (
      flags.capacity !== undefined ||
      flags.deploySpec !== undefined ||
      flags.billingMethod !== undefined
    ) {
      return "--capacity, --deploy-spec and --billing-method are not supported for plan=ptu; use reservation capacity and --charge-type.\nplan=ptu 不支持 --capacity、--deploy-spec 和 --billing-method；请使用预留容量参数和 --charge-type。";
    }
    if (flags.thinkingOutputTpm !== undefined) {
      return "--thinking-output-tpm is not supported by current reservation models.\n当前吞吐预留模型不支持 --thinking-output-tpm。";
    }
    if (flags.chargeType !== CHARGE_TYPE.PRE_PAID && flags.chargeType !== CHARGE_TYPE.POST_PAID) {
      return "--charge-type is required for plan=ptu and must be pre_paid or post_paid.\nplan=ptu 必须提供 --charge-type，且只能为 pre_paid 或 post_paid。";
    }
    if (
      flags.serviceTier !== undefined &&
      flags.serviceTier !== "ptu_fast" &&
      flags.serviceTier !== "ptu_default"
    ) {
      return "--service-tier must be ptu_fast or ptu_default.\n--service-tier 只能为 ptu_fast 或 ptu_default。";
    }
    if (flags.serviceTier === "ptu_default" && flags.chargeType === CHARGE_TYPE.POST_PAID) {
      return "ptu_default only supports pre_paid.\nptu_default 仅支持 pre_paid。";
    }
    if (flags.chargeType === CHARGE_TYPE.POST_PAID && hasPrepaidFlags(flags)) {
      return "Prepaid flags are not allowed with --charge-type post_paid.\n--charge-type post_paid 不允许提供预付费参数。";
    }
    return (
      validateReservationCapacity(flags, true) ??
      validatePrepaidFlags(flags, flags.chargeType === CHARGE_TYPE.PRE_PAID)
    );
  },
  async resolve(ctx: PlanContext): Promise<PlanResolved> {
    const body: Record<string, unknown> = {
      charge_type: ctx.flags.chargeType,
      ptu_capacity: buildReservationCapacity(ctx.flags),
    };
    if (ctx.flags.serviceTier !== undefined) body.service_tier = ctx.flags.serviceTier;
    if (ctx.flags.suffix !== undefined) body.suffix = ctx.flags.suffix;
    const prepaid = buildPrepaidInfo(ctx.flags);
    if (prepaid !== undefined) body.pre_paid_info = prepaid;
    return { body };
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
 * accepted by the create endpoint, so the dispatcher in the command will
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
