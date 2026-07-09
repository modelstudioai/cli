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
  aigcUseInputPrompt: {
    type: "boolean",
    valueHint: "<bool>",
    description:
      "Video LoRA (aigc_config): honor the caller's prompt at inference (default false = use preset template)",
  },
  aigcPrompt: {
    type: "string",
    valueHint: "<text>",
    description:
      "Video LoRA (aigc_config): preset prompt template used when use-input-prompt is false",
  },
  aigcLoraPromptDefault: {
    type: "string",
    valueHint: "<text>",
    description: "Video LoRA (aigc_config): default trigger-word phrase for the LoRA",
  },
} satisfies FlagsDef;

/**
 * `bl deploy create` — create a model deployment.
 *
 * Plan-specific behaviour (required flags / body assembly / auto-pick) lives
 * in `plans.ts` (`PlanStrategy` + `STRATEGIES`). This file only handles the
 * shared envelope: flag validation, dispatch, dry-run, and result
 * formatting. Adding a new plan = one entry in the strategy table;
 * nothing here changes.
 *
 * `--model` (model identifier) and `--name` (console display name) are required.
 */
export default defineCommand({
  description: "Create a model deployment",
  auth: "apiKey",
  usageArgs:
    "--model <model_name> --name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--model my-qwen-sft --name my-sft-test",
    "--model qwen3.6-flash-2026-04-16 --name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000",
    "--model qwen3-8b --name my-qwen3-mu --plan mu",
    "--model qwen3-8b --name my-qwen3 --plan mu --deploy-spec MU1 --capacity 2",
    '--model wan2.5-i2v-preview-ft-xxx --name my-video-lora --plan lora --aigc-prompt "..." --aigc-lora-prompt-default "..."',
  ],
  notes: [
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
    "For fine-tuned Wan video (i2v/kf2v) LoRA models, use --plan lora and pass",
    "--aigc-prompt / --aigc-lora-prompt-default (and optionally",
    "--aigc-use-input-prompt) to set the deployment's aigc_config.",
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

    // AIGC config (fine-tuned Wan video LoRA deployments). Only valid for
    // plan=lora — reject early for ptu/mu so the user gets a clear CLI error
    // instead of an opaque server-side rejection.
    const aigcUseInputPrompt = flags.aigcUseInputPrompt;
    const aigcPrompt = flags.aigcPrompt;
    const aigcLoraPromptDefault = flags.aigcLoraPromptDefault;
    const hasAigcFlags =
      aigcUseInputPrompt !== undefined ||
      aigcPrompt !== undefined ||
      aigcLoraPromptDefault !== undefined;
    if (hasAigcFlags && plan !== "lora") {
      throw new BailianError(
        `--aigc-* flags are only valid for plan=lora (video LoRA deployments). Got plan=${plan}.`,
        ExitCode.USAGE,
      );
    }
    if (hasAigcFlags) {
      const aigcConfig: Record<string, unknown> = {
        use_input_prompt: aigcUseInputPrompt ?? false,
      };
      if (aigcPrompt !== undefined) aigcConfig.prompt = aigcPrompt;
      if (aigcLoraPromptDefault !== undefined) {
        aigcConfig.lora_prompt_default = aigcLoraPromptDefault;
      }
      body.aigc_config = aigcConfig;
    }

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
