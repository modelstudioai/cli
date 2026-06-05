import { Complexities, ContextNeeds, QualityPreferences, ModelCategories } from "./types.ts";
import type { ModelProfile, IntentProfile, IntentSegment, Capability, Modality } from "./types.ts";
import {
  MAX_CANDIDATES,
  MIN_CANDIDATES,
  FALLBACK_THRESHOLD,
  FAMILY_CANDIDATE_CAP,
  SNAPSHOT_DATE_RE,
  GENERATION_CAPS,
  TEXT_CAPS,
  CONTEXT_THRESHOLDS,
} from "./constants/scoring.ts";

export interface ScoredCandidate {
  model: ModelProfile;
  score: number;
}

function hasMultiDomainCapabilities(caps: Capability[]): boolean {
  let hasGen = false;
  let hasText = false;
  for (const cap of caps) {
    if (GENERATION_CAPS.has(cap)) hasGen = true;
    if (TEXT_CAPS.has(cap)) hasText = true;
  }
  return hasGen && hasText;
}

function deduplicateSnapshots(models: ModelProfile[]): ModelProfile[] {
  const mainModels = new Set(models.map(({ model }) => model));
  return models.filter(({ model }) => {
    const base = model.replace(SNAPSHOT_DATE_RE, "");
    if (base === model) return true;
    return !mainModels.has(base);
  });
}

function matchesModality(
  model: ModelProfile,
  inputModality: Modality[],
  outputModality: Modality[],
): boolean {
  const modelInput = model.inferenceMetadata?.request_modality ?? [];
  const modelOutput = model.inferenceMetadata?.response_modality ?? [];

  if (inputModality.length > 0) {
    if (!inputModality.some((mod) => modelInput.includes(mod))) return false;
  }
  if (outputModality.length > 0) {
    if (!outputModality.some((mod) => modelOutput.includes(mod))) return false;
  }
  return true;
}

function matchesUpstream(model: ModelProfile, upstreamOutput: Modality[]): boolean {
  if (upstreamOutput.length === 0) return true;
  const accepts = model.inferenceMetadata?.request_modality ?? [];
  return upstreamOutput.some((mod) => accepts.includes(mod));
}

function scoreModel(model: ModelProfile, intent: IntentProfile): number {
  const { requiredCapabilities, requiredFeatures, contextNeed, qualityPreference } = intent;
  const { capabilities, features, contextWindow, category } = model;
  let score = 0;

  for (const cap of requiredCapabilities) {
    if (capabilities.includes(cap)) score += 10;
  }

  for (const feat of requiredFeatures) {
    if (features.includes(feat)) score += 5;
  }

  const ctxThreshold = CONTEXT_THRESHOLDS[contextNeed];
  if (ctxThreshold > 0 && (contextWindow ?? 0) >= ctxThreshold) {
    score += 8;
  }

  if (qualityPreference === QualityPreferences.Flagship && category === ModelCategories.Flagship) {
    score += 15;
  } else if (
    qualityPreference === QualityPreferences.CostOptimized &&
    category === ModelCategories.CostOptimized
  ) {
    score += 15;
  } else if (qualityPreference === QualityPreferences.Balanced) {
    if (category === ModelCategories.Flagship) score += 5;
  }

  return score;
}

function scoreAndRank(
  models: ModelProfile[],
  intent: IntentProfile,
  limit: number,
): ScoredCandidate[] {
  return models
    .map((model) => ({ model, score: scoreModel(model, intent) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function candidateIds(candidates: ScoredCandidate[]): Set<string> {
  return new Set(candidates.map(({ model }) => model.model));
}

function capByFamily(candidates: ScoredCandidate[], cap: number): ScoredCandidate[] {
  const counts = new Map<string, number>();
  const kept: ScoredCandidate[] = [];
  const overflow: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const family = candidate.model.family;
    if (!family) {
      kept.push(candidate);
      continue;
    }
    const cur = counts.get(family) ?? 0;
    if (cur < cap) {
      kept.push(candidate);
      counts.set(family, cur + 1);
    } else {
      overflow.push(candidate);
    }
  }
  if (kept.length >= MIN_CANDIDATES) return kept;
  return [...kept, ...overflow.slice(0, MIN_CANDIDATES - kept.length)];
}

function deduplicateCandidates(
  candidates: ScoredCandidate[],
  excludeIds: ReadonlySet<string>,
): ScoredCandidate[] {
  const seen = new Set(excludeIds);
  return candidates.filter((candidate) => {
    if (seen.has(candidate.model.model)) return false;
    seen.add(candidate.model.model);
    return true;
  });
}

function computeRemaining(
  models: ModelProfile[],
  intent: IntentProfile,
  excludeIds: ReadonlySet<string>,
): ScoredCandidate[] {
  if (excludeIds.size >= MIN_CANDIDATES) return [];
  return scoreAndRank(
    models.filter(({ model }) => !excludeIds.has(model)),
    intent,
    MIN_CANDIDATES - excludeIds.size,
  );
}

function recallForSegment(
  models: ModelProfile[],
  segment: IntentSegment,
  upstreamOutput: Modality[],
  budget: IntentProfile["budget"],
  qualityPreference: IntentProfile["qualityPreference"],
): ScoredCandidate[] {
  const { inputModality, outputModality, requiredCapabilities } = segment;
  const segmentIntent: IntentProfile = {
    complexity: Complexities.Single,
    taskSummary: "",
    scenarioHints: [],
    inputModality,
    outputModality,
    requiredCapabilities,
    requiredFeatures: [],
    budget,
    contextNeed: ContextNeeds.Standard,
    qualityPreference,
    confidence: 1,
  };

  let candidates = models.filter(
    (profile) =>
      matchesModality(profile, inputModality, outputModality) &&
      matchesUpstream(profile, upstreamOutput),
  );

  if (candidates.length < FALLBACK_THRESHOLD) {
    candidates = models.filter((profile) =>
      matchesModality(profile, inputModality, outputModality),
    );
  }

  if (candidates.length < FALLBACK_THRESHOLD) {
    candidates = models;
  }

  return scoreAndRank(candidates, segmentIntent, 5);
}

export function recallCandidates(models: ModelProfile[], intent: IntentProfile): ScoredCandidate[] {
  models = deduplicateSnapshots(models);

  let result: ScoredCandidate[];

  if (intent.complexity === Complexities.Pipeline && intent.segments?.length) {
    let results: ScoredCandidate[] = [];

    for (const [segIdx, segment] of intent.segments.entries()) {
      const upstreamOutput = segIdx === 0 ? [] : intent.segments[segIdx - 1].outputModality;
      const segCandidates = recallForSegment(
        models,
        segment,
        upstreamOutput,
        intent.budget,
        intent.qualityPreference,
      );
      const unique = deduplicateCandidates(segCandidates, candidateIds(results));
      results = [...results, ...unique];
    }

    const remaining = computeRemaining(models, intent, candidateIds(results));
    result = [...results, ...remaining];
  } else if (hasMultiDomainCapabilities(intent.requiredCapabilities)) {
    result = recallCrossDomain(models, intent);
  } else {
    let hardFiltered = models.filter((profile) =>
      matchesModality(profile, intent.inputModality, intent.outputModality),
    );

    if (hardFiltered.length < FALLBACK_THRESHOLD) {
      hardFiltered = models;
    }

    result = scoreAndRank(hardFiltered, intent, MAX_CANDIDATES);
  }

  return capByFamily(result, FAMILY_CANDIDATE_CAP);
}

function recallCrossDomain(models: ModelProfile[], intent: IntentProfile): ScoredCandidate[] {
  const perDomain = Math.ceil(MAX_CANDIDATES / 2);

  const genCaps = intent.requiredCapabilities.filter((cap) => GENERATION_CAPS.has(cap));
  const textCaps = intent.requiredCapabilities.filter((cap) => TEXT_CAPS.has(cap));

  let results: ScoredCandidate[] = [];

  if (genCaps.length > 0) {
    const genModels = models.filter((profile) =>
      genCaps.some((cap) => profile.capabilities.includes(cap)),
    );
    results = scoreAndRank(genModels, intent, perDomain);
  }

  if (textCaps.length > 0) {
    const excludeIds = candidateIds(results);
    const textIntent: IntentProfile = { ...intent, requiredCapabilities: textCaps };
    const textModels = models.filter(
      (profile) =>
        !excludeIds.has(profile.model) &&
        textCaps.some((cap) => profile.capabilities.includes(cap)),
    );
    results = [...results, ...scoreAndRank(textModels, textIntent, perDomain)];
  }

  const remaining = computeRemaining(models, intent, candidateIds(results));
  return [...results, ...remaining];
}
