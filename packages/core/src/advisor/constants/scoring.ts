import { Capabilities } from "../types.ts";
import type { Capability, ContextNeed } from "../types.ts";

export const MAX_CANDIDATES = 50;
export const SEMANTIC_TOP_K = 20;
export const MIN_CANDIDATES = 10;
export const FALLBACK_THRESHOLD = 5;
export const FAMILY_CANDIDATE_CAP = 3;
export const SNAPSHOT_DATE_RE = /-\d{4}-\d{2}-\d{2}$/;

/**
 * Minimum cosine similarity for a candidate to be kept after semantic recall.
 * Below this, hits are considered too loosely related. When applying the
 * threshold would leave fewer than MIN_CANDIDATES, it is relaxed (top by
 * similarity) so recall never collapses for cold/niche queries.
 */
export const MIN_SIMILARITY = 0.3;

export const GENERATION_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  Capabilities.IG,
  Capabilities.VG,
  Capabilities.TTS,
  Capabilities.RealtimeTTS,
  Capabilities.ThreeDGeneration,
]);

export const TEXT_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  Capabilities.TG,
  Capabilities.Reasoning,
  Capabilities.ASR,
  Capabilities.RealtimeASR,
  Capabilities.RealtimeAudioTranslate,
  Capabilities.TR,
  Capabilities.ME,
]);

export const CONTEXT_THRESHOLDS: Record<ContextNeed, number> = {
  standard: 0,
  large: 32000,
  "extra-large": 128000,
};

/**
 * Fusion weights for the dual-track recall: combined = HARD·hardScore + SOFT·softScore.
 * Soft (semantic similarity) is weighted higher than hard (preference satisfaction)
 * because the hard gate already removed directionally-wrong models; within the gated
 * pool, semantic relevance is the stronger ranking signal. Tunable once an eval set exists.
 */
export const FUSION_HARD_WEIGHT = 0.4;
export const FUSION_SOFT_WEIGHT = 0.6;

/**
 * Sub-weights inside hardScore (must sum to 1): capability coverage is the primary
 * signal, with feature/context/quality-tier alignment as secondary.
 */
export const HARD_WEIGHT_CAPABILITY = 0.4;
export const HARD_WEIGHT_FEATURE = 0.2;
export const HARD_WEIGHT_CONTEXT = 0.2;
export const HARD_WEIGHT_QUALITY = 0.2;

// Invariants: fusion weights must sum to 1 (combined score stays in [0,1]), and
// hardScore sub-weights must sum to 1 (the weighted average is well-defined).
// Tuning these constants without re-pairing would silently distort the score,
// so assert at module load.
console.assert(
  Math.abs(FUSION_HARD_WEIGHT + FUSION_SOFT_WEIGHT - 1) < 1e-9,
  "FUSION_HARD_WEIGHT + FUSION_SOFT_WEIGHT must sum to 1",
);
console.assert(
  Math.abs(
    HARD_WEIGHT_CAPABILITY + HARD_WEIGHT_FEATURE + HARD_WEIGHT_CONTEXT + HARD_WEIGHT_QUALITY - 1,
  ) < 1e-9,
  "HARD_WEIGHT_* sub-weights must sum to 1",
);
