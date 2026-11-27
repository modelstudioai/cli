import {
  defineCommand,
  BailianError,
  ExitCode,
  fetchModelCapability,
  fetchModelTrainOptions,
  MODEL_TRAIN_OPTIONS_API,
  TRAINING_TYPE_MAP,
  type CommandContext,
  type FlagsDef,
  type HttpDeps,
} from "bailian-cli-core";
import { resolveTrainingTypeCli, trainingTypeFlag } from "./train-options-shared.ts";

/** How a result's `training_options` came about. */
export type TrainOptionsStatus = "configured" | "not_configured" | "unverified";

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
  trainingType: trainingTypeFlag("sft"),
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
        "Calls the console gateway model-train-options API and requires a console login session. The result keeps the server field names verbatim (optionKeys, optionDefinitions, defaults, supportedCombinations) and carries a status: configured (options were returned), not_configured (the model is confirmed in the trainable catalog and has no dynamic options, so training_options is null) or unverified (no options were returned and the catalog lookup failed). A model id that is not a trainable base model fails with an error instead of returning null.",
      "zh-CN":
        "调用控制台网关 model-train-options 接口，需要控制台登录态。结果原样保留服务端字段名（optionKeys、optionDefinitions、defaults、supportedCombinations），并带一个 status：configured（返回了选项）、not_configured（模型已在可训练目录中确认存在但没有动态选项，此时 training_options 为 null）、unverified（未返回选项且目录查询失败）。模型 ID 不是可训练基础模型时直接报错，不会返回 null。",
    },
    {
      "en-US":
        "supportedCombinations is the authority for valid option combinations. finetune params, finetune preset-datasets and finetune text create call this same API once as a best-effort precheck when a console session is available: omitted options are completed from defaults and invalid combinations are rejected; without a session the check is skipped with a warning.",
      "zh-CN":
        "supportedCombinations 是选项组合合法性的唯一权威。finetune params、finetune preset-datasets 与 finetune text create 在控制台会话可用时会调用同一接口做一次尽力预检：从 defaults 补齐未传选项并拒绝非法组合；无会话时跳过预检并输出警告。",
    },
    {
      "en-US":
        "Pass the selected options to finetune params / finetune preset-datasets / finetune text create via --modality / --reasoning-mode; they travel as hyper_parameters to the training API.",
      "zh-CN":
        "选定的选项通过 --modality / --reasoning-mode 传给 finetune params / finetune preset-datasets / finetune text create；它们会作为 hyper_parameters 发送给训练接口。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const trainingTypeCli = resolveTrainingTypeCli(flags.trainingType, "sft");
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

    const diagnostics: Pick<HttpDeps, "debug"> = {
      debug: (diagnostic) => ctx.output.debug(diagnostic),
    };
    const options = await fetchModelTrainOptions(
      ctx.client.console.bind(ctx.client),
      flags.baseModel,
      trainingType,
    );
    const status: TrainOptionsStatus = options
      ? "configured"
      : await resolveNullStatus(ctx, flags.baseModel, diagnostics);
    const result = {
      model: flags.baseModel,
      training_type: trainingType,
      status,
      training_options: options,
    };

    if (settings.output === "text") {
      const lines: string[] = [];
      if (!options) {
        lines.push(
          status === "not_configured"
            ? ctx.localize({
                "en-US": `No dynamic train options are configured for ${flags.baseModel} (${trainingType}); the model is a valid trainable base model and needs no --modality / --reasoning-mode.`,
                "zh-CN": `模型 ${flags.baseModel}（${trainingType}）未配置动态训练选项；该模型是有效的可训练基础模型，无需传 --modality / --reasoning-mode。`,
              })
            : ctx.localize({
                "en-US": `No dynamic train options were returned for ${flags.baseModel} (${trainingType}); the model could not be verified in the catalog.`,
                "zh-CN": `接口未返回 ${flags.baseModel}（${trainingType}）的动态训练选项，且无法在模型目录中确认该模型存在。`,
              }),
        );
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

/**
 * Explain a null from the Console API. It is only reported as
 * `not_configured` once the model is confirmed in the trainable catalog, so a
 * mistyped model id fails instead of reading as "no dynamic options". Runs
 * after the Console call on purpose: a model the catalog omits but the Console
 * configures still gets its options through. A failed catalog lookup only
 * warns and leaves the result `unverified`.
 *
 * Only model existence is taken from the catalog. Its training-type capability
 * is known to disagree with the API for some models, so it is never consulted.
 */
async function resolveNullStatus(
  ctx: CommandContext,
  model: string,
  diagnostics: Pick<HttpDeps, "debug">,
): Promise<Exclude<TrainOptionsStatus, "configured">> {
  let capability: Awaited<ReturnType<typeof fetchModelCapability>> | undefined;
  try {
    capability = await fetchModelCapability(ctx.settings, model, diagnostics);
  } catch (error) {
    ctx.output.warning({
      code: "TRAINING_CAPABILITY_LOOKUP_FAILED",
      message: {
        "en-US": "Model catalog lookup failed; whether the model exists could not be verified.",
        "zh-CN": "模型目录查询失败；无法确认该模型是否存在。",
      },
      details: { reason: error instanceof Error ? error.message : undefined },
    });
    return "unverified";
  }
  if (capability) return "not_configured";
  throw new BailianError(
    ctx.localize({
      "en-US": `No trainable base model named "${model}" was found in the model catalog, and it has no dynamic train options.`,
      "zh-CN": `模型目录中未找到名为 "${model}" 的可训练基础模型，且它没有动态训练选项。`,
    }),
    ExitCode.USAGE,
    ctx.localize({
      "en-US": `Check the model id with finetune capability --base-model ${model}.`,
      "zh-CN": `用 finetune capability --base-model ${model} 核对模型 ID。`,
    }),
  );
}
