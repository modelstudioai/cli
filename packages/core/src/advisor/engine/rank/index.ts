import type {
  IntentProfile,
  RankedCandidate,
  RankStrategy,
  ScoredCandidate,
  Slot,
} from "../types.ts";
import { applyFairness } from "../fairness/index.ts";

function firstPrice(cand: ScoredCandidate): number {
  const raw = cand.model.prices?.[0]?.price;
  const num = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
}

function tierOf(cand: ScoredCandidate): string {
  return cand.model.profile?.familyTier ?? "unknown";
}

function assignSlots(candidates: ScoredCandidate[], topN: number): RankedCandidate[] {
  const slots: Slot[] = ["primary", "runner-up", "exploration"];
  return candidates.slice(0, topN).map((cand, idx) => ({
    ...cand,
    rank: idx + 1,
    slot: slots[Math.min(idx, slots.length - 1)],
  }));
}

/**
 * Slot assignment for non-forced orders.
 *
 * Default (no explicit price preference): surface each vendor's flagship —
 * one flagship per provider, best first — instead of forcing one balanced
 * and one lightweight slot. Marketplace duplicates share a provider, so the
 * provider-level dedup keeps genuinely different vendors in the slate.
 *
 * Explicit cost preference (budget "low" or qualityPreference
 * "cost-optimized"): tier-diverse slate mirroring the CLI advisor's 3-tier
 * recommendation (lightweight-led), backfilled by score order.
 */
function assignTierSlots(
  candidates: ScoredCandidate[],
  topN: number,
  intent: IntentProfile,
): RankedCandidate[] {
  if (topN < 3 || candidates.length < 3) return assignSlots(candidates, topN);

  const picked: ScoredCandidate[] = [];
  const used = new Set<string>();
  // backfill by the incoming (score-sorted) order when a mode cannot fill 3 slots
  const backfill = () => {
    for (const cand of candidates) {
      if (picked.length >= 3) break;
      if (used.has(cand.model.model)) continue;
      picked.push(cand);
      used.add(cand.model.model);
    }
  };

  if (intent.budget === "low" || intent.qualityPreference === "cost-optimized") {
    // group by tier; candidates are already score-sorted
    const groups = new Map<string, ScoredCandidate[]>();
    for (const cand of candidates) {
      const tier = tierOf(cand);
      const list = groups.get(tier) ?? [];
      list.push(cand);
      groups.set(tier, list);
    }
    // tier visit order follows the user's quality preference
    const tierOrder = ["lightweight", "balanced", "flagship"];
    for (const tier of tierOrder) {
      const cand = groups.get(tier)?.[0];
      if (cand && !used.has(cand.model.model)) {
        picked.push(cand);
        used.add(cand.model.model);
      }
      if (picked.length >= 3) break;
    }
    backfill();
    return assignSlots(picked, topN);
  }

  // Default: one flagship per provider, best first
  const providers = new Set<string>();
  for (const cand of candidates) {
    if (picked.length >= 3) break;
    if (tierOf(cand) !== "flagship") continue;
    if (providers.has(cand.model.provider)) continue;
    providers.add(cand.model.provider);
    picked.push(cand);
    used.add(cand.model.model);
  }
  backfill();
  return assignSlots(picked, topN);
}

/**
 * Rank dispatch: order candidates, optionally apply fairness, truncate to
 * topN, and assign slot semantics.
 */
export function rank(
  strategy: RankStrategy,
  candidates: ScoredCandidate[],
  topN: number,
  fairness: boolean,
  intent: IntentProfile,
): RankedCandidate[] {
  let ordered: ScoredCandidate[];

  switch (strategy) {
    case "template-order":
    case "forced-order":
      // recall already produced the desired order
      ordered = candidates;
      break;
    case "score-sort":
    default:
      ordered = [...candidates].sort((left, right) => {
        const diff = right.finalScore - left.finalScore;
        if (Math.abs(diff) > 1e-9) return diff;
        return firstPrice(left) - firstPrice(right); // tie → cheaper first
      });
      break;
  }

  if (fairness) {
    ordered = applyFairness(ordered, topN);
  }

  // forced order preserves user-named ordering; everything else gets tier-aware slots
  if (strategy === "forced-order") {
    return assignSlots(ordered, topN);
  }
  return assignTierSlots(ordered, topN, intent);
}
