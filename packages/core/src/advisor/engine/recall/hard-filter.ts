import type { IntentProfile, Modality, ModelProfile } from "../types.ts";

/** Exclude models that are offline or otherwise unavailable. */
export function isAvailable(model: ModelProfile): boolean {
  if ((model as unknown as Record<string, unknown>).offlineInfo) return false;
  return true;
}

/**
 * Hard gate: a model passes when its input/output modality and capability
 * set each intersect the (possibly empty) required sets. Empty required
 * fields are non-constraining — and so are empty model fields, since
 * upstream ships records with no response modality (embedding / detect
 * models) and unknown must not be treated as a mismatch.
 */
export function matchesModalityCap(
  model: ModelProfile,
  inputModality: Modality[],
  outputModality: Modality[],
  requiredCapabilities: string[],
): boolean {
  const modelIn = model.inferenceMetadata?.request_modality ?? [];
  const modelOut = model.inferenceMetadata?.response_modality ?? [];

  if (
    inputModality.length > 0 &&
    modelIn.length > 0 &&
    !inputModality.some((mod) => modelIn.includes(mod))
  ) {
    return false;
  }
  if (
    outputModality.length > 0 &&
    modelOut.length > 0 &&
    !outputModality.some((mod) => modelOut.includes(mod))
  ) {
    return false;
  }
  if (
    requiredCapabilities.length > 0 &&
    !requiredCapabilities.some((cap) => model.capabilities.includes(cap))
  ) {
    return false;
  }
  return true;
}

export function matchesIntentHard(model: ModelProfile, intent: IntentProfile): boolean {
  return matchesModalityCap(
    model,
    intent.inputModality,
    intent.outputModality,
    intent.requiredCapabilities,
  );
}

/**
 * Deterministic exclusion: drop candidates whose notSuitableFor list
 * intersects the user's matched scenes. Uses keyword containment against
 * scenes + task summary (no LLM needed).
 */
export function applyDisqualification(
  models: ModelProfile[],
  intent: IntentProfile,
): ModelProfile[] {
  const signals = [...intent.matchedScenes, ...intent.scenarioHints].filter(Boolean);
  if (signals.length === 0) return models;

  return models.filter((model) => {
    const negatives = model.profile?.notSuitableFor;
    if (!negatives?.length) return true;
    return !negatives.some((neg) => signals.some((sig) => neg.includes(sig)));
  });
}

/**
 * Apply the hard gate with fallback: when the gate leaves too few
 * candidates, relax back to the pool so recall never collapses.
 */
/**
 * Hard gate with progressive fallback. When the full gate leaves too few
 * candidates, relax modality constraints first; only fall back to the entire
 * pool when NO model matches the capability constraint at all. Capability is
 * the user's core requirement and must never be silently dropped.
 */
export function filterWithFallback(
  pool: ModelProfile[],
  intent: IntentProfile,
  minCandidates = 5,
): ModelProfile[] {
  const filtered = pool.filter((model) => matchesIntentHard(model, intent));
  if (filtered.length >= minCandidates) return filtered;

  // Relax: keep capability constraint, drop modality constraints
  if (intent.requiredCapabilities.length > 0) {
    const capOnly = pool.filter((model) =>
      intent.requiredCapabilities.some((cap) => model.capabilities.includes(cap)),
    );
    if (capOnly.length > 0) return capOnly;
  }

  return pool;
}
