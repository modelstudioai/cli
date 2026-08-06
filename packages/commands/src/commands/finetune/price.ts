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
    description: "Base model to fine-tune (e.g. qwen3-8b; not the output model name)",
    required: true,
  },
  datasets: {
    type: "string",
    valueHint: "<ids>",
    description: "Training dataset file IDs, comma-separated (required)",
    required: true,
  },
  trainingType: {
    type: "string",
    valueHint: "<type>",
    description: "Training type: sft | dpo | cpt (default: sft)",
  },
  nEpochs: {
    type: "number",
    valueHint: "<n>",
    description: "Number of training epochs (default: 3)",
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
  description: "Estimate the training cost for a fine-tune job (token billing)",
  auth: "console",
  usageArgs: "--base-model <model> --datasets <ids> [--training-type <type>] [--n-epochs <n>]",
  flags: PRICE_FLAGS,
  exampleArgs: [
    "--base-model qwen3-8b --datasets file-ft-xxx",
    "--base-model qwen3-8b --datasets file-ft-xxx,file-ft-yyy --n-epochs 2",
    "--base-model qwen3-8b --datasets file-ft-xxx --training-type cpt",
  ],
  notes: [
    "Estimate only — the server computes token usage from the datasets; final cost is subject to the bill.",
    "Covers token billing for sft / dpo / cpt. Training-unit (MTU) billing is not supported by this command.",
    "Hyper-parameters other than --n-epochs are fixed at representative defaults for estimation.",
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
