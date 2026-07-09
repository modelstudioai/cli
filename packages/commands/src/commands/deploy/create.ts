import {
  defineCommand,
  detectOutputFormat,
  createDeployment,
  pickPlanStrategy,
  STRATEGIES,
  DEFAULT_DEPLOY_PLAN,
  type CreateDeploymentRequest,
  type CreatePlanFlags,
  type CommandContext,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

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
  deploySpec: {
    type: "string",
    valueHint: "<id>",
    description: "Deploy spec (only used by plan=mu; auto-picked if omitted)",
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
} satisfies FlagsDef;

const CREATE_USAGE =
  "--model <model_name> --name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]";

const CREATE_NOTES = [
  "Plan defaults to `lora` (Token-billed). Pass --plan to override.",
  "For plan=ptu (Token-billed, provisioned throughput), --input-tpm and",
  "--output-tpm are required (the platform rejects creation without an",
  "explicit ptu_capacity despite the doc listing defaults).",
  "For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required.",
  "billing_method defaults to POST_PAY (only supported value); deploy_spec",
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
];

/**
 * Shared `deploy <modality> create` flag validation. Plan support is
 * server-catalog-driven, not modality-scoped, so validation is identical for
 * every modality: reject an unknown --plan, then defer to the plan strategy's
 * required-flag check.
 */
function validateCreate(flags: CreatePlanFlags): string | undefined {
  const plan = flags.plan || DEFAULT_DEPLOY_PLAN;
  const strategy = STRATEGIES[plan];
  if (!strategy) {
    return `Unsupported plan "${plan}". Supported plans: ${Object.keys(STRATEGIES).join(", ")}.`;
  }
  return strategy.validateFlags(flags);
}

/**
 * Shared `deploy <modality> create` implementation. deploy create takes a model
 * by name and a billing plan — it does NOT inspect data modality, so the run
 * logic is identical across text / audio / image. The modality split only
 * changes the command path, description and examples; the parameter surface and
 * run logic are unchanged.
 *
 * Plan-specific behaviour (required flags / body assembly / auto-pick) lives in
 * core `plans.ts` (`PlanStrategy` + `STRATEGIES`). This file only handles the
 * shared envelope: dispatch, dry-run, and result formatting.
 */
async function runCreate(ctx: CommandContext<typeof CREATE_FLAGS>): Promise<void> {
  const { identity, settings, flags } = ctx;
  const model = flags.model as string;
  const name = flags.name as string;
  const plan = (flags.plan as string | undefined) || DEFAULT_DEPLOY_PLAN;
  const format = detectOutputFormat(settings.output);

  // Plan-specific behaviour is owned by core `plans.ts`. The strategy resolves
  // the plan-specific body fragment (mu may auto-pick a template from the
  // deployable-models catalog). Anything outside the strategy table was
  // already rejected by `validate` above.
  const strategy = pickPlanStrategy(plan);

  const resolved = await strategy.resolve({
    client: ctx.client,
    dryRun: settings.dryRun,
    binName: identity.binName,
    flags: flags as CreatePlanFlags,
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
}

/** `bl deploy text create` — deploy a text model. */
export const deployTextCreate = defineCommand({
  description: "Create a text model deployment",
  auth: "apiKey",
  usageArgs: CREATE_USAGE,
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model my-qwen-sft --name my-sft-test",
    "--model qwen3.6-flash-2026-04-16 --name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000",
    "--model qwen3-8b --name my-qwen3-mu --plan mu",
    "--model qwen3-8b --name my-qwen3 --plan mu --deploy-spec MU1 --capacity 2",
  ],
  notes: CREATE_NOTES,
  validate: (flags) => validateCreate(flags),
  run: (ctx) => runCreate(ctx),
});

/** `bl deploy audio create` — deploy an audio (TTS) model. */
export const deployAudioCreate = defineCommand({
  description: "Create an audio (TTS) model deployment",
  auth: "apiKey",
  usageArgs: CREATE_USAGE,
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model my-cosyvoice-ft --name my-tts",
    "--model my-cosyvoice-ft --name my-tts-mu --plan mu",
    "--model my-cosyvoice-ft --name my-tts --dry-run",
  ],
  notes: CREATE_NOTES,
  validate: (flags) => validateCreate(flags),
  run: (ctx) => runCreate(ctx),
});

/** `bl deploy image create` — deploy an image generation model. */
export const deployImageCreate = defineCommand({
  description: "Create an image generation model deployment",
  auth: "apiKey",
  usageArgs: CREATE_USAGE,
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model my-wan-ft --name my-wan",
    "--model my-wan-ft --name my-wan-mu --plan mu",
    "--model my-wan-ft --name my-wan --dry-run",
  ],
  notes: CREATE_NOTES,
  validate: (flags) => validateCreate(flags),
  run: (ctx) => runCreate(ctx),
});
