import {
  defineCommand,
  listPresetDatasets,
  DEFAULT_TRAINING_TYPE,
  TRAINING_TYPE_MAP,
  type FlagsDef,
  type PresetDataset,
} from "bailian-cli-core";
import {
  TRAIN_OPTIONS_PRECHECK_NOTE,
  buildTrainOptions,
  preflightTrainOptions,
  resolveTrainingTypeCli,
  trainOptionFlags,
  trainingTypeFlag,
} from "./train-options-shared.ts";

const PRESET_DATASETS_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Base model to list preset datasets for (e.g. qwen3-8b)",
      "zh-CN": "要查询预置数据集的基础模型（例如 qwen3-8b）",
    },
    required: true,
  },
  trainingType: trainingTypeFlag(DEFAULT_TRAINING_TYPE),
  modelVersion: {
    type: "string",
    valueHint: "<version>",
    description: {
      "en-US":
        "Base-model training-config version. Omit to use the latest applicable config (or, when resuming, the source job's version).",
      "zh-CN": "基模训练配置版本。不传取适用的最新配置；续训时沿用源任务的基模版本。",
    },
  },
  ...trainOptionFlags(),
} satisfies FlagsDef;

/** One dataset per two lines: `code  title`, then the indented description. */
function formatPresetDataset(dataset: PresetDataset): string {
  const heading = [dataset.dataset_code, dataset.dataset_title].filter(Boolean).join("  ");
  return dataset.dataset_desc ? `${heading}\n    ${dataset.dataset_desc}` : heading;
}

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "List the preset datasets that can be mixed into a fine-tuning job",
    "zh-CN": "查询可混入训练的预置数据集",
  },
  auth: "apiKey",
  optionalConsole: true,
  usageArgs:
    "--base-model <model> [--training-type <t>] [--model-version <version>] [--modality <text|vision>] [--reasoning-mode <instruct|thinking>]",
  flags: PRESET_DATASETS_FLAGS,
  exampleArgs: [
    "--base-model qwen3-8b",
    "--base-model qwen3-8b --training-type sft-lora --output json",
    "--base-model qwen3.6-plus-base-2026-04-02 --training-type sft --modality vision --reasoning-mode instruct",
    "--base-model qwen3-8b --training-type dpo",
    "--base-model qwen3-8b --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Queries GET /api/v1/fine-tunes/preset-datasets. Each entry keeps the server field names verbatim (dataset_code, dataset_title, dataset_desc); dataset_code is case-sensitive as returned; finetune text create sends it lowercased as augmentation_types (e.g. mix_V2 -> mix_v2). An empty output (nothing to mix for this model and training type) is a success with exit code 0.",
      "zh-CN":
        "调用 GET /api/v1/fine-tunes/preset-datasets。每条数据原样保留服务端字段名（dataset_code、dataset_title、dataset_desc）；把 dataset_code 传给 finetune text create 的 --augmentation-types 时按小写下发（例如 mix_V2 -> mix_v2）。output 为空（该模型与训练类型下没有可混入的数据集）属于成功，退出码为 0。",
    },
    TRAIN_OPTIONS_PRECHECK_NOTE,
  ],
  async run(ctx) {
    const { settings, flags } = ctx;

    const trainingTypeCli = resolveTrainingTypeCli(flags.trainingType, DEFAULT_TRAINING_TYPE);
    const trainingType = TRAINING_TYPE_MAP[trainingTypeCli].server;
    let trainOptions = buildTrainOptions(flags.modality, flags.reasoningMode);

    if (settings.dryRun) {
      const resultData = {
        action: "finetune.preset-datasets",
        base_model: flags.baseModel,
        training_type: trainingType,
        ...(flags.modelVersion ? { version: flags.modelVersion } : {}),
        ...(Object.keys(trainOptions).length > 0
          ? { hyper_parameters: JSON.stringify(trainOptions) }
          : {}),
        ...(settings.workspaceId ? { workspace_id: settings.workspaceId } : {}),
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    // Same best-effort console precheck as finetune params: rejects option
    // combinations the model does not support. A missing console session
    // degrades to a warning and passes the user options through unchanged.
    const resolved = await preflightTrainOptions(ctx, flags.baseModel, trainingType, trainOptions);
    trainOptions = resolved.context;

    const response = await listPresetDatasets(ctx.client, {
      inputModel: flags.baseModel,
      trainingType,
      version: flags.modelVersion || undefined,
      trainOptions,
      workspaceId: settings.workspaceId,
    });

    const payload = { ...response, precheck: resolved.precheck };
    if (ctx.settings.output === "text") {
      const datasets = response.output ?? [];
      ctx.output.result(payload, {
        text:
          datasets.length > 0
            ? datasets.map((dataset) => formatPresetDataset(dataset)).join("\n")
            : ctx.localize({
                "en-US": `No preset datasets to mix for ${flags.baseModel} (${trainingType}).`,
                "zh-CN": `${flags.baseModel}（${trainingType}）没有可混入的预置数据集。`,
              }),
      });
      return;
    }
    ctx.output.result(payload);
  },
});
