import {
  defineCommand,
  getFineTuneParams,
  DEFAULT_TRAINING_TYPE,
  TRAINING_TYPE_MAP,
  type FlagsDef,
} from "bailian-cli-core";
import {
  TRAIN_OPTIONS_PRECHECK_NOTE,
  buildTrainOptions,
  preflightTrainOptions,
  resolveTrainingTypeCli,
  trainOptionFlags,
  trainingTypeFlag,
} from "./train-options-shared.ts";

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
  trainingType: trainingTypeFlag(DEFAULT_TRAINING_TYPE),
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
  ...trainOptionFlags(),
  lang: {
    type: "string",
    valueHint: "<locale>",
    description: {
      "en-US": "Locale for server-side display text (e.g. en, zh). Omit for the server default.",
      "zh-CN": "服务端展示文案的语言（例如 en、zh）。不传由服务端决定。",
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
  optionalConsole: true,
  usageArgs:
    "--base-model <model> [--training-type <t>] [--param-type <hyper|resource>] [--mtu-spec-code <code>] [--modality <text|vision>] [--reasoning-mode <instruct|thinking>] [--lang <locale>]",
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
    TRAIN_OPTIONS_PRECHECK_NOTE,
    {
      "en-US":
        "resume_from_checkpoint in the output reports whether the training type supports resuming training.",
      "zh-CN": "输出中的 resume_from_checkpoint 表示该训练类型是否支持断点续训。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const trainingTypeCli = resolveTrainingTypeCli(flags.trainingType, DEFAULT_TRAINING_TYPE);
    const trainingType = TRAINING_TYPE_MAP[trainingTypeCli].server;
    let trainOptions = buildTrainOptions(flags.modality, flags.reasoningMode);

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
        ...(settings.workspaceId ? { workspace_id: settings.workspaceId } : {}),
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    // Best-effort console precheck: validate the combination against the
    // model's supportedCombinations and complete omitted options from its
    // defaults. Skipped offline in dry-run; a missing console session degrades
    // to a warning and passes the user options through unchanged.
    const resolved = await preflightTrainOptions(ctx, flags.baseModel, trainingType, trainOptions);
    trainOptions = resolved.context;

    const response = await getFineTuneParams(ctx.client, {
      inputModel: flags.baseModel,
      trainingType,
      mtuSpecCode: flags.mtuSpecCode || undefined,
      paramType: flags.paramType || undefined,
      trainOptions,
      lang: flags.lang || undefined,
      workspaceId: settings.workspaceId,
    });

    const payload = { ...response, precheck: resolved.precheck };
    ctx.output.result(
      payload,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
