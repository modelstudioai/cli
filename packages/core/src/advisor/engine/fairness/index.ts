import type { ScoredCandidate } from "../types.ts";

/** Max recommendations from the same family within the final slate. */
const FAMILY_SLOT_CAP = 2;

/**
 * Fairness adjustment on the ordered candidate list:
 *   1. family soft cap — at most 2 slots per family; overflow candidates
 *      are pushed behind the next family's best
 *   2. exploration slot — when the slate would be a single family, promote
 *      the best candidate from a different family into the last slot
 * Missing-dimension normalization is handled at scoring time (missing = 1,
 * no penalty), so nothing to do here.
 */
export function applyFairness(ordered: ScoredCandidate[], topN: number): ScoredCandidate[] {
  if (ordered.length <= 1) return ordered;

  // 1. family soft cap
  const familyCounts = new Map<string, number>();
  const kept: ScoredCandidate[] = [];
  const overflow: ScoredCandidate[] = [];

  for (const cand of ordered) {
    const family = cand.model.family;
    if (!family) {
      kept.push(cand);
      continue;
    }
    const count = familyCounts.get(family) ?? 0;
    if (count < FAMILY_SLOT_CAP) {
      kept.push(cand);
      familyCounts.set(family, count + 1);
    } else {
      overflow.push(cand);
    }
  }

  let result = [...kept, ...overflow];

  // 2. exploration slot: avoid a single-family slate in the visible topN
  const visible = result.slice(0, topN);
  const families = new Set(visible.map((candidate) => candidate.model.family).filter(Boolean));
  if (topN >= 3 && families.size === 1 && result.length > topN) {
    const firstFamily = visible[0].model.family;
    const altIdx = result.findIndex(
      (candidate, index) => index >= topN && candidate.model.family !== firstFamily,
    );
    if (altIdx >= 0) {
      const [alternative] = result.splice(altIdx, 1);
      result.splice(topN - 1, 0, alternative);
    }
  }

  return result;
}
