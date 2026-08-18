import {
  defineCommand,
  fetchTrainingModelPrice,
  estimateSftDpoTokens,
  estimateCptTokens,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const PRICE_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Base model to fine-tune (e.g. qwen3-8b; not the output model name)",
      "zh-CN": "待微调的基座模型（例如 qwen3-8b；不是输出模型名称）",
    },
    required: true,
  },
  datasets: {
    type: "string",
    valueHint: "<ids>",
    description: {
      "en-US": "Training dataset file IDs, comma-separated (required)",
      "zh-CN": "训练数据集文件 ID，多个以逗号分隔（必填）",
    },
    required: true,
  },
  trainingType: {
    type: "string",
    valueHint: "<type>",
    description: {
      "en-US": "Training type: sft | dpo | cpt (default: sft)",
      "zh-CN": "训练类型：sft | dpo | cpt（默认：sft）",
    },
  },
  nEpochs: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Number of training epochs (default: 3)",
      "zh-CN": "训练轮数（默认：3）",
    },
  },
} satisfies FlagsDef;

const SUPPORTED_TRAINING_TYPES = ["sft", "dpo", "cpt"];

// Fixed hyper-parameters used for estimation. Only n_epochs materially affects
// the estimate; the rest are held at representative defaults (not exposed as
// flags to keep the command surface minimal).
const ESTIMATE_BATCH_SIZE = 16;
const ESTIMATE_MAX_LENGTH = 8192;
const DEFAULT_N_EPOCHS = 3;

export default defineCommand({
  description: {
    "en-US": "Estimate the training cost for a fine-tune job (token billing)",
    "zh-CN": "估算微调任务的训练费用（按 Token 计费）",
  },
  auth: "console",
  usageArgs: "--base-model <model> --datasets <ids> [--training-type <type>] [--n-epochs <n>]",
  flags: PRICE_FLAGS,
  exampleArgs: [
    "--base-model qwen3-8b --datasets file-ft-xxx",
    "--base-model qwen3-8b --datasets file-ft-xxx,file-ft-yyy --n-epochs 2",
    "--base-model qwen3-8b --datasets file-ft-xxx --training-type cpt",
  ],
  notes: [
    {
      "en-US":
        "Estimate only — the server computes token usage from the datasets; final cost is subject to the bill.",
      "zh-CN": "该结果仅为估算值——服务端根据数据集计算 Token 用量，最终费用以账单为准。",
    },
    {
      "en-US":
        "Covers token billing for sft / dpo / cpt. Training-unit (MTU) billing is not supported by this command.",
      "zh-CN": "支持估算 sft / dpo / cpt 的 Token 计费；此命令不支持训练单元（MTU）计费估算。",
    },
    {
      "en-US":
        "Hyper-parameters other than --n-epochs are fixed at representative defaults for estimation.",
      "zh-CN": "除 --n-epochs 外，其他超参数会使用具有代表性的固定默认值进行估算。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const model = flags.baseModel;
    const datasetIds = flags.datasets
      .split(",")
      .map((datasetId) => datasetId.trim())
      .filter(Boolean);
    const trainingType = (flags.trainingType ?? "sft").toLowerCase();
    const nEpochs = flags.nEpochs ?? DEFAULT_N_EPOCHS;

    if (!SUPPORTED_TRAINING_TYPES.includes(trainingType)) {
      throw new BailianError(
        `Unsupported training type "${trainingType}". Supported: ${SUPPORTED_TRAINING_TYPES.join(", ")}.`,
        ExitCode.USAGE,
      );
    }
    if (datasetIds.length === 0) {
      throw new BailianError("--datasets must contain at least one file ID.", ExitCode.USAGE);
    }

    if (settings.dryRun) {
      emitResult(
        { action: "finetune.price", model, datasets: datasetIds, trainingType, nEpochs },
        "json",
      );
      return;
    }

    // Unit price (yuan per 千Token).
    const priceInfo = await fetchTrainingModelPrice(ctx.client, model);
    const unitPrice = Number(priceInfo.price);
    if (!Number.isFinite(unitPrice)) {
      throw new BailianError(
        `No training price found for model "${model}".`,
        ExitCode.GENERAL,
        undefined,
        { rawResponse: JSON.stringify(priceInfo) },
      );
    }

    // Per-epoch token estimate (min/max range).
    const estimate =
      trainingType === "cpt"
        ? await estimateCptTokens(ctx.client, model, datasetIds.join(","), nEpochs)
        : await estimateSftDpoTokens(ctx.client, datasetIds, {
            nEpochs,
            batchSize: ESTIMATE_BATCH_SIZE,
            maxLength: ESTIMATE_MAX_LENGTH,
          });

    const minPerEpoch = estimate.estimatedDatasetConsumedTokensMinPerEpoch ?? 0;
    const maxPerEpoch = estimate.estimatedDatasetConsumedTokensMaxPerEpoch ?? 0;
    const mixedMinPerEpoch = estimate.estimatedMixedConsumedTokensMinPerEpoch ?? 0;
    const mixedMaxPerEpoch = estimate.estimatedMixedConsumedTokensMaxPerEpoch ?? 0;

    const minTokens = (minPerEpoch + mixedMinPerEpoch) * nEpochs;
    const maxTokens = (maxPerEpoch + mixedMaxPerEpoch) * nEpochs;
    // price is yuan per 1000 tokens.
    const minFee = (minTokens / 1000) * unitPrice;
    const maxFee = (maxTokens / 1000) * unitPrice;

    emitResult(
      {
        model,
        training_type: trainingType,
        n_epochs: nEpochs,
        unit_price: unitPrice,
        price_unit: priceInfo.priceUnit ?? "千Token",
        estimated_tokens: { min: minTokens, max: maxTokens },
        estimated_fee_yuan: {
          min: Number(minFee.toFixed(4)),
          max: Number(maxFee.toFixed(4)),
        },
        disclaimer: "Server-side estimate; final cost is subject to the bill.",
      },
      "json",
    );
  },
});
