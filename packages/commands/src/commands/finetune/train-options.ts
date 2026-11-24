import {
  defineCommand,
  fetchModelTrainOptions,
  MODEL_TRAIN_OPTIONS_API,
  isTrainingTypeCli,
  TRAINING_TYPES_CLI,
  TRAINING_TYPE_MAP,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";

const TRAIN_OPTIONS_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Base model to query dynamic train options for (e.g. qwen3.6-plus-base-2026-04-02)",
      "zh-CN": "要查询动态训练选项的基础模型（例如 qwen3.6-plus-base-2026-04-02）",
    },
    required: true,
  },
  trainingType: {
    type: "string",
    valueHint: "<t>",
    description: {
      "en-US": `Training type: ${TRAINING_TYPES_CLI.join(" | ")} (default: sft). Mapped to the server's training_type (e.g. sft-lora -> efficient_sft).`,
      "zh-CN": `训练类型：${TRAINING_TYPES_CLI.join(" | ")}（默认：sft）。会映射为服务端 training_type（例如 sft-lora -> efficient_sft）。`,
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Query a base model's dynamic train options (modality / reasoning-mode combinations)",
    "zh-CN": "查询基础模型的动态训练选项（modality / reasoning-mode 合法组合）",
  },
  auth: "console",
  usageArgs: "--base-model <model> [--training-type <t>]",
  flags: TRAIN_OPTIONS_FLAGS,
  exampleArgs: [
    "--base-model qwen3.6-plus-base-2026-04-02",
    "--base-model qwen3.6-plus-base-2026-04-02 --training-type cpt",
    "--base-model qwen3-8b",
    "--base-model qwen3-8b --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Calls the console gateway model-train-options API and requires a console login session. The result keeps the server field names verbatim (optionKeys, optionDefinitions, defaults, supportedCombinations). Models without dynamic train options return training_options: null.",
      "zh-CN":
        "调用控制台网关 model-train-options 接口，需要控制台登录态。结果原样保留服务端字段名（optionKeys、optionDefinitions、defaults、supportedCombinations）。未配置动态训练选项的模型返回 training_options: null。",
    },
    {
      "en-US":
        "supportedCombinations is the authority for valid option combinations. finetune params and finetune text create call this same API once as a best-effort precheck when a console session is available: omitted options are completed from defaults and invalid combinations are rejected; without a session the check is skipped with a warning.",
      "zh-CN":
        "supportedCombinations 是选项组合合法性的唯一权威。finetune params 与 finetune text create 在控制台会话可用时会调用同一接口做一次尽力预检：从 defaults 补齐未传选项并拒绝非法组合；无会话时跳过预检并输出警告。",
    },
    {
      "en-US":
        "Pass the selected options to finetune params / finetune text create via --modality / --reasoning-mode; they travel as hyper_parameters to the training API.",
      "zh-CN":
        "选定的选项通过 --modality / --reasoning-mode 传给 finetune params / finetune text create；它们会作为 hyper_parameters 发送给训练接口。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const trainingTypeCli = flags.trainingType || "sft";
    if (!isTrainingTypeCli(trainingTypeCli)) {
      throw new BailianError(
        `--training-type "${trainingTypeCli}" is not supported.`,
        ExitCode.USAGE,
        `Supported values: ${TRAINING_TYPES_CLI.join(", ")} (default: sft).`,
      );
    }
    const trainingType = TRAINING_TYPE_MAP[trainingTypeCli].server;

    if (settings.dryRun) {
      const resultData = {
        action: "finetune.train-options",
        api: MODEL_TRAIN_OPTIONS_API,
        input: { models: [flags.baseModel], trainingType },
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    const options = await fetchModelTrainOptions(
      ctx.client.console.bind(ctx.client),
      flags.baseModel,
      trainingType,
    );
    const result = {
      model: flags.baseModel,
      training_type: trainingType,
      training_options: options,
    };

    if (settings.output === "text") {
      const lines: string[] = [];
      if (!options) {
        lines.push(`No dynamic train options configured for ${flags.baseModel} (${trainingType}).`);
      } else {
        for (const definition of options.optionDefinitions ?? []) {
          const values = (definition.supportValues ?? []).join(" | ");
          const required = definition.required ? ", required" : "";
          const recommended = definition.recommendValue
            ? `, recommend=${definition.recommendValue}`
            : "";
          lines.push(`${definition.name}: ${values}${required}${recommended}`);
        }
        const defaults = Object.entries(options.defaults ?? {})
          .map(([key, value]) => `${key}=${value}`)
          .join(", ");
        if (defaults) lines.push(`defaults: ${defaults}`);
        const combinations = (options.supportedCombinations ?? [])
          .map((combination) =>
            Object.entries(combination)
              .map(([key, value]) => `${key}=${value}`)
              .join("+"),
          )
          .join("; ");
        if (combinations) lines.push(`supported combinations: ${combinations}`);
      }
      ctx.output.result(result, { text: lines.join("\n") });
      return;
    }

    ctx.output.result(result);
  },
});
