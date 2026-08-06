import {
  defineCommand,
  createDeployment,
  pickPlanStrategy,
  STRATEGIES,
  defaultDeployPlan,
  type DeployModality,
  type CreateDeploymentRequest,
  type CreatePlanFlags,
  type CommandContext,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const CREATE_FLAGS = {
  modelName: {
    type: "string",
    valueHint: "<model_name>",
    description: "Model to deploy — fine-tuned output name or catalog model (required)",
    required: true,
  },
  displayName: {
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
  "--model-name <model_name> --display-name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]";

const CREATE_NOTES = [
  "Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-",
  "billed) for audio (CosyVoice TTS). Pass --plan to override.",
  "For plan=ptu (Token-billed, provisioned throughput), --input-tpm and",
  "--output-tpm are required (the platform rejects creation without an",
  "explicit ptu_capacity despite the doc listing defaults).",
  "For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required.",
  "billing_method defaults to POST_PAY (only supported value); deploy_spec",
  "and capacity are auto-picked from GET /deployments/models when omitted.",
  "Use `bl deploy models --source base` to inspect available templates.",
  "After creation, status starts at PENDING and transitions to RUNNING.",
  "Invoke the deployed model with: bl text chat --model <deployed_model>",
  "NOTE: --model-name is the model being deployed (e.g. `qwen3-8b-ft-...`).",
  "The create response also returns a `deployed_model` field — the deployment",
  "instance id (e.g. `qwen3-8b-5ecb5f068d79`). Use that id for inference",
  "(`bl text chat --model <deployed_model>`) and lifecycle commands",
  "(`deploy get/scale/pause/resume/delete --deployed-model <id>`).",
];

/**
 * Shared `deploy <modality> create` flag validation. Plan support is
 * server-catalog-driven, so validation is identical for every modality: resolve
 * the effective plan (modality-specific default when --plan is omitted), reject
 * an unknown --plan, then defer to the plan strategy's required-flag check.
 */
function validateCreate(modality: DeployModality, flags: CreatePlanFlags): string | undefined {
  const plan = flags.plan || defaultDeployPlan(modality);
  const strategy = STRATEGIES[plan];
  if (!strategy) {
    return `Unsupported plan "${plan}". Supported plans: ${Object.keys(STRATEGIES).join(", ")}.`;
  }
  return strategy.validateFlags(flags);
}

/**
 * Shared `deploy <modality> create` implementation. deploy create takes a model
 * by name and a billing plan — it does NOT inspect data modality for the request
 * body, so the run logic is identical across text / audio / image. The modality
 * only fixes the default plan (audio → mu, text/image → lora) and the command
 * path / description / examples.
 *
 * Plan-specific behaviour (required flags / body assembly / auto-pick) lives in
 * core `plans.ts` (`PlanStrategy` + `STRATEGIES`). This file only handles the
 * shared envelope: dispatch, dry-run, and result formatting.
 */
async function runCreate(
  modality: DeployModality,
  ctx: CommandContext<typeof CREATE_FLAGS>,
): Promise<void> {
  const { identity, settings, flags } = ctx;
  const model = flags.modelName as string;
  const name = flags.displayName as string;
  const plan = (flags.plan as string | undefined) || defaultDeployPlan(modality);

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
    emitResult({ action: "deploy.create", body }, "json");
    return;
  }

  const response = await createDeployment(ctx.client, body as CreateDeploymentRequest);
  const deployment = response.output ?? response.data;

  if (settings.quiet) {
    emitBare(deployment?.deployed_model ?? "");
  } else {
    emitResult(response, "json");
  }
}

/** `bl deploy text create` — deploy a text model. */
export const deployTextCreate = defineCommand({
  description: "Create a text model deployment",
  auth: "apiKey",
  usageArgs: CREATE_USAGE,
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model-name my-qwen-sft --display-name my-sft-test",
    "--model-name qwen3.6-flash-2026-04-16 --display-name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000",
    "--model-name qwen3-8b --display-name my-qwen3-mu --plan mu",
    "--model-name qwen3-8b --display-name my-qwen3 --plan mu --deploy-spec MU1 --capacity 2",
  ],
  notes: CREATE_NOTES,
  validate: (flags) => validateCreate("text", flags),
  run: (ctx) => runCreate("text", ctx),
});

/** `bl deploy audio create` — deploy an audio (TTS) model. Defaults to plan=mu. */
export const deployAudioCreate = defineCommand({
  description: "Create an audio (TTS) model deployment",
  auth: "apiKey",
  usageArgs: CREATE_USAGE,
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model-name my-cosyvoice-ft --display-name my-tts",
    "--model-name my-cosyvoice-ft --display-name my-tts --deploy-spec dps-xxxx --capacity 1",
    "--model-name my-cosyvoice-ft --display-name my-tts --dry-run",
  ],
  notes: CREATE_NOTES,
  validate: (flags) => validateCreate("audio", flags),
  run: (ctx) => runCreate("audio", ctx),
});

/** `bl deploy image create` — deploy an image generation model. */
export const deployImageCreate = defineCommand({
  description: "Create an image generation model deployment",
  auth: "apiKey",
  usageArgs: CREATE_USAGE,
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model-name my-wan-ft --display-name my-wan",
    "--model-name my-wan-ft --display-name my-wan-mu --plan mu",
    "--model-name my-wan-ft --display-name my-wan --dry-run",
  ],
  notes: CREATE_NOTES,
  validate: (flags) => validateCreate("image", flags),
  run: (ctx) => runCreate("image", ctx),
});
