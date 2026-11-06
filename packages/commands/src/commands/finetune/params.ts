import {
  defineCommand,
  getFineTuneParams,
  isTrainingTypeCli,
  TRAINING_TYPES_CLI,
  DEFAULT_TRAINING_TYPE,
  TRAINING_TYPE_MAP,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";

/**
 * Build the training-option context from the dedicated flags. The OpenAPI
 * expects it as one `hyper_parameters` query parameter holding a JSON string
 * (e.g. {"modality":"vision","reasoning_mode":"thinking"}); models without
 * dynamic train options simply omit it.
 */
function buildTrainOptions(
  modality: string | undefined,
  reasoningMode: string | undefined,
): Record<string, string> {
  const options: Record<string, string> = {};
  if (modality) options.modality = modality;
  if (reasoningMode) options.reasoning_mode = reasoningMode;
  return options;
}

const PARAMS_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Base model to query training parameters for (e.g. qwen3-8b)",
      "zh-CN": "要查询训练参数的基础模型（例如 qwen3-8b）",
    },
    required: true,
  },
  trainingType: {
    type: "string",
    valueHint: "<t>",
    description: {
      "en-US": `Training type: ${TRAINING_TYPES_CLI.join(" | ")} (default: ${DEFAULT_TRAINING_TYPE}). Mapped to the server's training_type (e.g. sft-lora -> efficient_sft).`,
      "zh-CN": `训练类型：${TRAINING_TYPES_CLI.join(" | ")}（默认：${DEFAULT_TRAINING_TYPE}）。会映射为服务端 training_type（例如 sft-lora -> efficient_sft）。`,
    },
  },
  mtuSpecCode: {
    type: "string",
    valueHint: "<code>",
    description: {
      "en-US": "MTU spec code, required for resource-group queries (e.g. MTU2)",
      "zh-CN": "训练单元（MTU）规格编码，查询资源类参数时需要（例如 MTU2）",
    },
  },
  paramType: {
    type: "string",
    valueHint: "<type>",
    description: {
      "en-US": "Parameter group: hyper | resource. Omit to return all groups.",
      "zh-CN": "参数类别：hyper | resource。不传返回全部分类。",
    },
    choices: ["hyper", "resource"] as const,
  },
  modality: {
    type: "string",
    valueHint: "<text|vision>",
    description: {
      "en-US":
        "Training modality: text | vision. Only meaningful for models with dynamic train options; sent as modality inside hyper_parameters.",
      "zh-CN":
        "训练模态：text | vision。仅对配置了动态训练选项的模型有意义；作为 hyper_parameters 中的 modality 发送。",
    },
    choices: ["text", "vision"] as const,
  },
  reasoningMode: {
    type: "string",
    valueHint: "<instruct|thinking>",
    description: {
      "en-US":
        "Reasoning mode: instruct (non-thinking) | thinking. Only meaningful for models with dynamic train options; sent as reasoning_mode inside hyper_parameters.",
      "zh-CN":
        "思考模式：instruct（非思考）| thinking（思考）。仅对配置了动态训练选项的模型有意义；作为 hyper_parameters 中的 reasoning_mode 发送。",
    },
    choices: ["instruct", "thinking"] as const,
  },
  lang: {
    type: "string",
    valueHint: "<locale>",
    description: {
      "en-US": "Locale for server-side display text (e.g. en, zh). Omit for the server default.",
      "zh-CN": "服务端展示文案的语言（例如 en、zh）。不传由服务端决定。",
    },
  },
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US":
        "Workspace ID sent as X-DashScope-WorkSpace; omit when your API key is already workspace-bound.",
      "zh-CN": "以 X-DashScope-WorkSpace 头发送的业务空间 ID；API Key 已绑定空间时可省略。",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Query the training hyper-parameter configuration for a base model",
    "zh-CN": "查询基础模型的训练超参配置",
  },
  auth: "apiKey",
  usageArgs:
    "--base-model <model> [--training-type <t>] [--param-type <hyper|resource>] [--mtu-spec-code <code>] [--modality <text|vision>] [--reasoning-mode <instruct|thinking>] [--lang <locale>] [--workspace-id <id>]",
  flags: PARAMS_FLAGS,
  exampleArgs: [
    "--base-model qwen3-8b",
    "--base-model qwen3-8b --training-type sft",
    "--base-model qwen3-8b --training-type dpo-lora --param-type hyper",
    "--base-model qwen3.7-plus-2026-05-26 --modality vision --reasoning-mode thinking",
    "--base-model qwen3-8b --param-type resource --mtu-spec-code MTU2",
    "--base-model qwen3-8b --output json",
    "--base-model qwen3-8b --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Queries GET /api/v1/fine-tunes/fine-tunes-params. Each hyper_params entry keeps server field names verbatim (recommend_value, defaultValue, is_advanced_parameter, ...).",
      "zh-CN":
        "调用 GET /api/v1/fine-tunes/fine-tunes-params。每条 hyper_params 原样保留服务端字段名（recommend_value、defaultValue、is_advanced_parameter 等）。",
    },
    {
      "en-US":
        "--modality / --reasoning-mode travel as one hyper_parameters query parameter (JSON). Supported values and combinations vary per model; invalid combinations are rejected by the server and surfaced as-is. Models without dynamic train options ignore these flags.",
      "zh-CN":
        "--modality / --reasoning-mode 会合并为单个 hyper_parameters query 参数（JSON）发送。各模型支持的取值与组合不同；非法组合由服务端拒绝并原样透传错误。未配置动态训练选项的模型可忽略这两个 flag。",
    },
    {
      "en-US":
        "resume_from_checkpoint in the output reports whether the training type supports resuming training.",
      "zh-CN": "输出中的 resume_from_checkpoint 表示该训练类型是否支持断点续训。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const trainingTypeCli = flags.trainingType || DEFAULT_TRAINING_TYPE;
    if (!isTrainingTypeCli(trainingTypeCli)) {
      throw new BailianError(
        `--training-type "${trainingTypeCli}" is not supported.`,
        ExitCode.USAGE,
        `Supported values: ${TRAINING_TYPES_CLI.join(", ")} (default: ${DEFAULT_TRAINING_TYPE}).`,
      );
    }
    const trainingType = TRAINING_TYPE_MAP[trainingTypeCli].server;
    const trainOptions = buildTrainOptions(flags.modality, flags.reasoningMode);

    if (settings.dryRun) {
      const resultData = {
        action: "finetune.params",
        base_model: flags.baseModel,
        training_type: trainingType,
        ...(flags.paramType ? { param_type: flags.paramType } : {}),
        ...(flags.mtuSpecCode ? { mtu_spec_code: flags.mtuSpecCode } : {}),
        ...(Object.keys(trainOptions).length > 0
          ? { hyper_parameters: JSON.stringify(trainOptions) }
          : {}),
        ...(flags.lang ? { lang: flags.lang } : {}),
        ...(flags.workspaceId ? { workspace_id: flags.workspaceId } : {}),
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    const response = await getFineTuneParams(ctx.client, {
      inputModel: flags.baseModel,
      trainingType,
      mtuSpecCode: flags.mtuSpecCode || undefined,
      paramType: flags.paramType || undefined,
      trainOptions,
      lang: flags.lang || undefined,
      workspaceId: flags.workspaceId || undefined,
    });

    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
