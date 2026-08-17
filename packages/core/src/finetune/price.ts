/**
 * Training price estimation via the **console gateway**.
 *
 * These are console-domain APIs (`zeldaEasy.broadscope-platform.*`); commands
 * using them must declare `auth: "console"`. Two different argument wrappers
 * exist: `getModelPrice` takes a top-level `query`, while the token-estimation
 * APIs take a top-level `input`.
 */
import type { Client } from "../client/client.ts";
import { unwrapResponse } from "../console/models.ts";

// ---------------------------------------------------------------------------
// API names
// ---------------------------------------------------------------------------

export const TRAINING_MODEL_PRICE_API = "zeldaEasy.broadscope-platform.modelCenter.getModelPrice";
export const CALC_DATASETS_TOKENS_API =
  "zeldaEasy.broadscope-platform.modelInstance.calculateDatasetsTotalTokens";
export const ESTIMATE_FINETUNE_TOKENS_API =
  "zeldaEasy.broadscope-platform.modelInstance.estimateFinetuneTokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainingModelPrice {
  price?: string;
  priceUnit?: string;
  modelId?: string;
  [key: string]: unknown;
}

export interface TokenEstimate {
  estimatedDatasetConsumedTokensMinPerEpoch?: number;
  estimatedDatasetConsumedTokensMaxPerEpoch?: number;
  estimatedMixedConsumedTokensMinPerEpoch?: number;
  estimatedMixedConsumedTokensMaxPerEpoch?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// API wrappers
// ---------------------------------------------------------------------------

/**
 * Training unit price for a model. `price` is denominated in `priceUnit`
 * (typically "千Token" — yuan per 1000 tokens).
 */
export async function fetchTrainingModelPrice(
  client: Client,
  modelId: string,
): Promise<TrainingModelPrice> {
  const raw = await client.console<Record<string, unknown>>(TRAINING_MODEL_PRICE_API, {
    query: { type: 0, modelId },
  });
  return unwrapResponse(raw) as TrainingModelPrice;
}

/**
 * Estimate training tokens for SFT / DPO jobs.
 * Returns a per-epoch min/max range; multiply by `n_epochs` for the total.
 */
export async function estimateSftDpoTokens(
  client: Client,
  datasetIds: string[],
  hyperParams: { nEpochs: number; batchSize: number; maxLength: number },
): Promise<TokenEstimate> {
  const raw = await client.console<Record<string, unknown>>(CALC_DATASETS_TOKENS_API, {
    input: { trainDatasetIds: datasetIds, hyperParams },
  });
  return unwrapResponse(raw) as TokenEstimate;
}

/**
 * Estimate training tokens for CPT jobs.
 *
 * The console API requires `hyperParams` as a **JSON string** with a full
 * `userDefinedObj` payload (captured from the console frontend), plus several
 * top-level fields (`algorithmType`, `bizType`, `priority`, …). Only
 * `n_epochs` / `max_length` materially affect the estimate; the remaining
 * hyper-parameters are fixed defaults.
 */
export async function estimateCptTokens(
  client: Client,
  model: string,
  datasetIdsCsv: string,
  nEpochs: number,
): Promise<TokenEstimate> {
  const userDefinedObj = {
    batch_size: 16,
    eval_steps: 50,
    learning_rate: "7e-6",
    lr_scheduler_type: "linear",
    max_length: 8192,
    n_epochs: nEpochs,
    split: 0.9,
    save_total_limit: "3",
    resume_from_checkpoint: false,
    save_strategy: "epoch",
  };
  const hyperParams = JSON.stringify({
    useDefault: false,
    userDefinedObj,
    useQwenMixedStrategy: false,
  });
  const raw = await client.console<Record<string, unknown>>(ESTIMATE_FINETUNE_TOKENS_API, {
    input: {
      trainingType: "cpt",
      instanceName: `${model}_cli_estimate`,
      algorithmType: 100,
      bizType: 100,
      trainDatasetIds: datasetIdsCsv,
      hyperParams,
      bailianTrainModel: model,
      validationDatasetIds: "",
      jobName: `${model}_cli_estimate`,
      priority: "L0",
    },
  });
  return unwrapResponse(raw) as TokenEstimate;
}
