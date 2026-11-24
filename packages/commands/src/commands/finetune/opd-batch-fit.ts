import type { FineTuneHyperParameters } from "bailian-cli-core";

function numericField(hyperParameters: FineTuneHyperParameters, key: string): number | undefined {
  const raw = hyperParameters[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export interface OpdBatchFit {
  batchSize?: number;
  nEpochs?: number;
  recordCount?: number;
  /** floor(recordCount * nEpochs / batchSize); undefined when not computable. */
  steps?: number;
  /** Minimum raw samples for at least one step: ceil(batchSize / nEpochs). */
  requiredSamples?: number;
}

/**
 * OPD consumes batch_size prompts per training step (the published docs define
 * batch_size as "每步样本数"; server logs show ppo_mini_batch_size ×
 * require_batches = batch_size). total_training_steps = floor(samples ×
 * n_epochs / batch_size); zero steps trips the DLC assertion lr_decay_steps > 0
 * AFTER the job is created and billed. The raw local count is an upper bound on
 * the post-preprocessing count, so "locally too few" is a sound hard reject.
 */
export function computeOpdBatchFit(
  hyperParameters: FineTuneHyperParameters,
  recordCount?: number,
): OpdBatchFit {
  const batchSize = numericField(hyperParameters, "batch_size");
  const nEpochs = numericField(hyperParameters, "n_epochs");
  const fit: OpdBatchFit = { batchSize, nEpochs, recordCount };
  if (batchSize !== undefined && batchSize > 0 && nEpochs !== undefined && nEpochs >= 1) {
    fit.requiredSamples = Math.ceil(batchSize / nEpochs);
    if (recordCount !== undefined) {
      fit.steps = Math.floor((recordCount * nEpochs) / batchSize);
    }
  }
  return fit;
}

/**
 * Published constraint: ppo_mini_batch_size ≤ batch_size × n_rollouts.
 * Returns the values only when all three fields are explicit.
 */
export function opdMiniBatchLimit(
  hyperParameters: FineTuneHyperParameters,
): { miniBatchSize: number; limit: number } | undefined {
  const miniBatchSize = numericField(hyperParameters, "ppo_mini_batch_size");
  const batchSize = numericField(hyperParameters, "batch_size");
  const nRollouts = numericField(hyperParameters, "n_rollouts");
  if (miniBatchSize === undefined || batchSize === undefined || nRollouts === undefined) {
    return undefined;
  }
  return { miniBatchSize, limit: batchSize * nRollouts };
}
