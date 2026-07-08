import {
  defineCommand,
  detectOutputFormat,
  createDeployment,
  BailianError,
  ExitCode,
  type CreateDeploymentRequest,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { pickPlanStrategy, STRATEGIES } from "./plans.ts";

const CREATE_FLAGS = {
  model: {
    type: "string",
    valueHint: "<name>",
    description: "Model name (catalog model or fine-tuned output) (required)",
    required: true,
  },
  name: {
    type: "string",
    valueHint: "<display_name>",
    description: "Console display name for the deployment (required)",
    required: true,
  },
  plan: {
    type: "string",
    valueHint: "<plan>",
    description: "Billing plan: lora (default, Token-billed) | ptu (Token-billed) | mu",
  },
  templateId: {
    type: "string",
    valueHint: "<id>",
    description: "Template id (only used by plan=mu; auto-picked if omitted)",
  },
  capacity: {
    type: "number",
    valueHint: "<n>",
    description: "Resource units (plan=mu only; required by API; defaults to the template's unit)",
  },
  billingMethod: {
    type: "string",
    valueHint: "<m>",
    description: 'Billing method (plan=mu only; default "POST_PAY", the only supported value)',
  },
  inputTpm: {
    type: "number",
    valueHint: "<n>",
    description: "PTU max input tokens/min (required for plan=ptu)",
  },
  outputTpm: {
    type: "number",
    valueHint: "<n>",
    description: "PTU max output tokens/min (required for plan=ptu)",
  },
  thinkingOutputTpm: {
    type: "number",
    valueHint: "<n>",
    description: "PTU max thinking-output tokens/min (optional, some models)",
  },
  yes: { type: "switch", description: "Confirm deployment creation (required to create)" },
} satisfies FlagsDef;

/**
 * `bl deploy create` — create a model deployment.
 *
 * Plan-specific behaviour (required flags / body assembly / auto-pick) lives
 * in `plans.ts` (`PlanStrategy` + `STRATEGIES`). This file only handles the
 * shared envelope: flag validation, dispatch, dry-run, the --yes gate, and
 * result formatting. Adding a new plan = one entry in the strategy table;
 * nothing here changes.
 *
 * `--model` (model identifier) and `--name` (console display name) are required.
 */
export default defineCommand({
  description: "Create a model deployment",
  auth: "apiKey",
  usageArgs:
    "--model <model_name> --name <display_name> --yes [--plan <plan>] [--template-id <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model my-qwen-sft --name my-sft-test --yes",
    "--model qwen3.6-flash-2026-04-16 --name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000 --yes",
    "--model qwen3-8b --name my-qwen3-mu --plan mu --yes",
    "--model qwen3-8b --name my-qwen3 --plan mu --template-id MU1 --capacity 2 --yes",
  ],
  notes: [
    "Plan defaults to `lora` (Token-billed). Pass --plan to override.",
    "For plan=ptu (Token-billed, provisioned throughput), --input-tpm and",
    "--output-tpm are required (the platform rejects creation without an",
    "explicit ptu_capacity despite the doc listing defaults).",
    "For plan=mu, `capacity`, `billing_method` and `template_id` are required.",
    "billing_method defaults to POST_PAY (only supported value); template_id",
    "and capacity are auto-picked from GET /deployments/models when omitted.",
    "Use `bl deploy models --source base` to inspect available templates.",
    "After creation, status starts at PENDING and transitions to RUNNING.",
    "Invoke the deployed model with: bl text chat --model <deployed_model>",
    "WARNING: --model is overloaded across commands and refers to DIFFERENT",
    "values. `bl deploy create --model` takes the exported model_name (e.g.",
    "`qwen3-8b-ft-...`), but the create response also returns a `deployed_model`",
    "field (the deployment instance id, e.g. `qwen3-8b-5ecb5f068d79`). The",
    "inference call `bl text chat --model` must use the `deployed_model` from",
    "the create response — NOT the `model_name` you passed to `deploy create`.",
    "Do not reuse the value across the two commands.",
  ],
  validate: (flags) => {
    const plan = flags.plan || "lora";
    const strategy = STRATEGIES[plan];
    if (!strategy) {
      return `Unsupported plan "${plan}". Supported plans: ${Object.keys(STRATEGIES).join(", ")}.`;
    }
    return strategy.validateFlags(flags);
  },
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const model = flags.model;
    const name = flags.name;
    const plan = flags.plan || "lora";
    const format = detectOutputFormat(settings.output);

    // Plan-specific behaviour is owned by `plans.ts`. The strategy resolves
    // the plan-specific body fragment (mu may auto-pick a template from the
    // deployable-models catalog). Anything outside the strategy table was
    // already rejected by `validate` above.
    const strategy = pickPlanStrategy(plan);

    // Gate before any side-effecting resolution (mu hits the catalog API).
    if (!settings.dryRun && !flags.yes) {
      throw new BailianError(
        `Refusing to create deployment (model=${model}, name=${name}, plan=${plan}) without --yes.`,
        ExitCode.USAGE,
        "Pass --yes to confirm deployment creation, or use --dry-run to preview the request.",
      );
    }

    const resolved = await strategy.resolve({
      client: ctx.client,
      dryRun: settings.dryRun,
      binName: identity.binName,
      flags,
      model,
      name,
    });
    const body: Record<string, unknown> = {
      model_name: model,
      name,
      plan,
      ...resolved.body,
    };

    if (settings.dryRun) {
      emitResult({ action: "deploy.create", body }, format);
      return;
    }

    const response = await createDeployment(ctx.client, body as CreateDeploymentRequest);
    const deployment = response.output ?? response.data;

    if (settings.quiet) {
      emitBare(deployment?.deployed_model ?? "");
    } else if (format === "text") {
      emitBare(`Created deployment.`);
      if (deployment?.deployed_model) emitBare(`  deployed_model:  ${deployment.deployed_model}`);
      if (deployment?.status) emitBare(`  status:          ${deployment.status}`);
      if (deployment?.plan) emitBare(`  plan:            ${deployment.plan}`);
      emitBare(
        `\nNext: track readiness with: ${identity.binName} deploy get --deployed-model ${deployment?.deployed_model ?? "<id>"}`,
      );
    } else {
      emitResult(response, format);
    }
  },
});
