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
    description: {
      "en-US": "Model to deploy — fine-tuned output name or catalog model (required)",
      "zh-CN": "要部署的模型：微调输出模型名称或模型目录中的模型（必填）",
    },
    required: true,
  },
  displayName: {
    type: "string",
    valueHint: "<display_name>",
    description: {
      "en-US": "Console display name for the deployment (required)",
      "zh-CN": "部署在控制台中的显示名称（必填）",
    },
    required: true,
  },
  plan: {
    type: "string",
    valueHint: "<plan>",
    description: {
      "en-US": "Billing plan: lora (default, Token-billed) | ptu (Token-billed) | mu",
      "zh-CN": "计费方案：lora（默认，按 Token 计费）| ptu（按 Token 计费）| mu",
    },
  },
  deploySpec: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Deploy spec (only used by plan=mu; auto-picked if omitted)",
      "zh-CN": "部署规格（仅 plan=mu 使用；省略时自动选择）",
    },
  },
  capacity: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Resource units (plan=mu only; required by API; defaults to the template's unit)",
      "zh-CN": "资源单元数（仅 plan=mu；API 必填；默认为模板的单元数）",
    },
  },
  billingMethod: {
    type: "string",
    valueHint: "<m>",
    description: {
      "en-US": 'Billing method (plan=mu only; default "POST_PAY", the only supported value)',
      "zh-CN": '计费方式（仅 plan=mu；默认且仅支持 "POST_PAY"）',
    },
  },
  inputTpm: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "PTU max input tokens/min (required for plan=ptu)",
      "zh-CN": "PTU 每分钟最大输入 Token 数（plan=ptu 时必填）",
    },
  },
  outputTpm: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "PTU max output tokens/min (required for plan=ptu)",
      "zh-CN": "PTU 每分钟最大输出 Token 数（plan=ptu 时必填）",
    },
  },
  thinkingOutputTpm: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "PTU max thinking-output tokens/min (optional, some models)",
      "zh-CN": "PTU 每分钟最大思考输出 Token 数（部分模型可选）",
    },
  },
} satisfies FlagsDef;

const CREATE_USAGE =
  "--model-name <model_name> --display-name <display_name> [--plan <plan>] [--deploy-spec <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>]";

const CREATE_NOTES = [
  {
    "en-US":
      "Plan defaults to `lora` (Token-billed) for text/image and `mu` (model-unit-billed) for audio (CosyVoice TTS). Pass --plan to override.",
    "zh-CN":
      "文本和图片部署默认使用 `lora`（按 Token 计费），音频（CosyVoice TTS）默认使用 `mu`（按模型单元计费）。可通过 --plan 覆盖。",
  },
  {
    "en-US":
      "For plan=ptu (Token-billed, provisioned throughput), --input-tpm and --output-tpm are required (the platform rejects creation without an explicit ptu_capacity despite the doc listing defaults).",
    "zh-CN":
      "plan=ptu（按 Token 计费的预置吞吐）时，--input-tpm 和 --output-tpm 必填；即使文档列出了默认值，未显式传入 ptu_capacity 时平台也会拒绝创建。",
  },
  {
    "en-US":
      "For plan=mu, `capacity`, `billing_method` and `deploy_spec` are required. billing_method defaults to POST_PAY (only supported value); deploy_spec and capacity are auto-picked from GET /deployments/models when omitted.",
    "zh-CN":
      "plan=mu 时，`capacity`、`billing_method` 和 `deploy_spec` 必填。billing_method 默认且仅支持 POST_PAY；省略 deploy_spec 和 capacity 时，会从 GET /deployments/models 自动选择。",
  },
  {
    "en-US": "Use `bl deploy models --source base` to inspect available templates.",
    "zh-CN": "使用 `bl deploy models --source base` 查看可用模板。",
  },
  {
    "en-US":
      "After creation, status starts at PENDING and transitions to RUNNING. Invoke the deployed model with: bl text chat --model <deployed_model>",
    "zh-CN":
      "创建后状态从 PENDING 开始，随后转为 RUNNING。调用已部署模型：bl text chat --model <deployed_model>",
  },
  {
    "en-US":
      "NOTE: --model-name is the model being deployed (e.g. `qwen3-8b-ft-...`). The create response also returns a `deployed_model` field — the deployment instance id (e.g. `qwen3-8b-5ecb5f068d79`). Use that id for inference (`bl text chat --model <deployed_model>`) and lifecycle commands (`deploy get/scale/pause/resume/delete --deployed-model <id>`).",
    "zh-CN":
      "注意：--model-name 是要部署的模型（例如 `qwen3-8b-ft-...`）。创建响应中的 `deployed_model` 是部署实例 ID（例如 `qwen3-8b-5ecb5f068d79`），用于推理（`bl text chat --model <deployed_model>`）及生命周期命令（`deploy get/scale/pause/resume/delete --deployed-model <id>`）。",
  },
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
  description: { "en-US": "Create a text model deployment", "zh-CN": "创建文本模型部署" },
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
  description: {
    "en-US": "Create an audio (TTS) model deployment",
    "zh-CN": "创建音频（TTS）模型部署",
  },
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
  description: {
    "en-US": "Create an image generation model deployment",
    "zh-CN": "创建图片生成模型部署",
  },
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
