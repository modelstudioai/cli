/**
 * Per-plan strategy table for `bl deploy create`.
 *
 * Each PlanStrategy owns one slice of plan-specific behaviour:
 *   - required-flag checks (USAGE errors when the user is missing something)
 *   - any pre-flight side-effects (e.g. mu auto-picks a template from the
 *     catalog; lora/ptu are pure)
 *   - the plan-specific body fragment for POST /api/v1/deployments
 *   - the plan-specific confirmation-panel rows
 *
 * The dispatcher in `create.ts` only knows about `STRATEGIES[plan]`. Adding a
 * new plan = one new strategy object + one line in `STRATEGIES`. Nothing in
 * `create.ts` needs to change. This collapses the 5 places where lora / ptu /
 * mu used to be hard-coded (default value list / required-flag checks /
 * auto-pick / body assembly / confirm rows) into one strategy entry per plan.
 */
import {
  listDeployableModels,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";

export interface PlanContext {
  config: Config;
  flags: GlobalFlags;
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
  /**
   * Lines to append to the confirmation panel — each already formatted like
   * `  key:        value`.
   */
  confirmRows: string[];
  /**
   * Suffix appended to the `plan: <name>` confirm row, e.g.
   * ` (Token-billed)`. Empty / undefined when no annotation is needed.
   */
  planLabelSuffix?: string;
}

export interface PlanStrategy {
  /** Plan id, matches `--plan` CLI value. */
  name: string;
  /** Throws USAGE-coded BailianError when required flags are missing. */
  validateFlags(flags: GlobalFlags): void;
  /**
   * Resolve plan-specific bits to a body fragment + confirm rows. May call
   * into the API (e.g. mu auto-picks a template from the deployable-models
   * catalog).
   */
  resolve(ctx: PlanContext): Promise<PlanResolved>;
}

/**
 * `lora` (Token-billed) — the CLI default. The API requires `capacity` even
 * though it is ignored for token-billed plans (per the working example), so
 * the CLI injects `1` as a placeholder.
 */
const loraStrategy: PlanStrategy = {
  name: "lora",
  validateFlags() {
    /* no required flags */
  },
  async resolve(): Promise<PlanResolved> {
    return {
      body: { capacity: 1 },
      confirmRows: [],
      planLabelSuffix: " (Token-billed)",
    };
  },
};

/**
 * `ptu` (Token-billed, provisioned throughput). The platform rejects creation
 * without `ptu_capacity.input_tpm` / `output_tpm` ("Miss ptu capacity info")
 * even though the doc lists 10000/1000 defaults — so the CLI treats them as
 * required.
 */
const ptuStrategy: PlanStrategy = {
  name: "ptu",
  validateFlags(flags: GlobalFlags): void {
    const usage =
      "bl deploy create --plan ptu --model <m> --name <n> --input-tpm <n> --output-tpm <n>";
    if (flags.inputTpm === undefined) failIfMissing("input-tpm", usage);
    if (flags.outputTpm === undefined) failIfMissing("output-tpm", usage);
  },
  async resolve(ctx: PlanContext): Promise<PlanResolved> {
    const inputTpm = ctx.flags.inputTpm as number;
    const outputTpm = ctx.flags.outputTpm as number;
    const thinkingOutputTpm = ctx.flags.thinkingOutputTpm as number | undefined;
    const ptuCapacity: Record<string, number> = {
      input_tpm: inputTpm,
      output_tpm: outputTpm,
    };
    if (thinkingOutputTpm !== undefined) ptuCapacity.thinking_output_tpm = thinkingOutputTpm;

    const rows = [`  input_tpm:    ${inputTpm}`, `  output_tpm:   ${outputTpm}`];
    if (thinkingOutputTpm !== undefined) rows.push(`  thinking_output_tpm: ${thinkingOutputTpm}`);

    return {
      body: { ptu_capacity: ptuCapacity },
      confirmRows: rows,
      planLabelSuffix: " (Token-billed, provisioned throughput)",
    };
  },
};

/**
 * `mu` (model-unit-billed). `capacity`, `billing_method` and `template_id` are
 * all required by the API but every one has a CLI-side default:
 *   - billing_method defaults to POST_PAY (the only supported value).
 *   - template_id auto-picks from GET /deployments/models — the one whose
 *     `charge_type` matches `billing_method`, else the first available.
 *   - capacity defaults to the template's `capacity_unit_per_instance` (the
 *     smallest valid multiple of base_capacity).
 *
 * The catalog lookup is skipped when `--template-id` is supplied explicitly:
 * fine-tuned custom models may not appear in the `source=base` catalog, and
 * forcing the lookup would otherwise raise a spurious "no template" error.
 * It is also skipped in dry-run mode to keep `--dry-run` side-effect-free.
 */
const muStrategy: PlanStrategy = {
  name: "mu",
  validateFlags() {
    /* every required field has a default — nothing to assert up-front */
  },
  async resolve(ctx: PlanContext): Promise<PlanResolved> {
    const billingMethod = (ctx.flags.billingMethod as string | undefined) || "POST_PAY";
    let templateId = ctx.flags.templateId as string | undefined;
    let capacity = ctx.flags.capacity as number | undefined;
    let autoPickedTemplate = false;

    if (!ctx.config.dryRun && !templateId) {
      try {
        const resp = await listDeployableModels(ctx.config, {
          modelSource: "base",
          pageSize: 100,
          version: "v1.0",
        });
        const payload = resp.output ?? resp.data;
        const target = (payload?.models ?? []).find((m) => m.model_name === ctx.model);
        const muPlan = target?.plans?.find((p) => p.plan === "mu");
        const templates = muPlan?.templates ?? [];
        if (templates.length === 0) {
          throw new BailianError(
            `No mu-plan template found for model "${ctx.model}". ` +
              `Run \`bl deploy models --source base\` to inspect available models, ` +
              `or pass --template-id explicitly.`,
            ExitCode.USAGE,
          );
        }
        // POST_PAY → post_paid template; fall back to the first available.
        const wantChargeType = billingMethod === "POST_PAY" ? "post_paid" : "pre_paid";
        const picked = templates.find((t) => t.charge_type === wantChargeType) ?? templates[0];
        if (!picked?.template_id) {
          throw new BailianError(
            `No mu-plan template found for model "${ctx.model}". ` +
              `Run \`bl deploy models --source base\` to inspect available models, ` +
              `or pass --template-id explicitly.`,
            ExitCode.USAGE,
          );
        }
        templateId = picked.template_id;
        autoPickedTemplate = true;
        if (capacity === undefined) {
          capacity = picked.roles?.unified?.capacity_unit_per_instance ?? 1;
        }
      } catch (e) {
        if (e instanceof BailianError) throw e;
        throw new BailianError(
          `Failed to auto-pick template for plan=mu: ${(e as Error).message}. ` +
            `Pass --template-id explicitly.`,
          ExitCode.USAGE,
        );
      }
    }

    const body: Record<string, unknown> = {
      capacity: capacity ?? 1,
      billing_method: billingMethod,
    };
    if (templateId) body.template_id = templateId;

    const rows: string[] = [];
    if (templateId) {
      const hint = autoPickedTemplate ? " (auto-picked)" : "";
      rows.push(`  template_id:  ${templateId}${hint}`);
    }
    rows.push(`  capacity:     ${capacity ?? 1}`);
    rows.push(`  billing_method: ${billingMethod}`);

    return { body, confirmRows: rows };
  },
};

/**
 * Registry of supported plans. Adding a new plan = one entry here. The
 * catalog lists some additional plan names (e.g. `ptu_v2`) that are NOT
 * accepted by the create endpoint, so the dispatcher in `create.ts` will
 * reject anything outside this table with a clear USAGE error.
 */
export const STRATEGIES: Record<string, PlanStrategy> = {
  lora: loraStrategy,
  ptu: ptuStrategy,
  mu: muStrategy,
};

/** Throws USAGE if `plan` is not in the strategy table. */
export function pickPlanStrategy(plan: string): PlanStrategy {
  const s = STRATEGIES[plan];
  if (!s) {
    throw new BailianError(
      `Unsupported plan "${plan}". Supported plans: ${Object.keys(STRATEGIES).join(", ")}.`,
      ExitCode.USAGE,
    );
  }
  return s;
}
