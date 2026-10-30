import type {
  ExplainStrategy,
  RankedCandidate,
  Recommendation,
  RecommendContext,
} from "../types.ts";
import { extractJson } from "../llm/json.ts";
import { throwIfCancelled, toDegradation, toLLMError } from "../llm/errors.ts";
import { formatIntentContext } from "../intent/context.ts";
import { buildModelSpecs } from "../specs.ts";

// ---- Prompts ----

const GENERATE_SYSTEM_PROMPT = `You are a model recommendation advisor for Alibaba Cloud Model Studio. The candidates below are ALREADY ranked — do not reorder them. Write a recommendation reason for each.

The candidates occupy distinct quality-tier slots. Write each reason from its slot's perspective:
- primary (Best Pick): why this model is the best fit for the user's budget and quality preference
- runner-up (Runner-Up): a worthy alternative from a different quality tier — explain the tradeoff vs the best pick
- exploration (Alternative): a third-perspective choice — explain the scenario difference

Rules:
- reason and highlights MUST be in Simplified Chinese (简体中文)
- Each reason must explain how the model solves a specific aspect of the user's task — no generic praise ("性能强大", "效果好")
- The three reasons must take distinct angles
- If the intent is a pipeline (Complexity: pipeline), name the step each model serves (e.g. "用于第3步图生视频")
- Respond with ONLY JSON:
{"items":[{"model":"<id>","reason":"...","highlights":["...","..."]}]}`;

const COMPARE_SYSTEM_PROMPT = `You are a model comparison advisor for Alibaba Cloud Model Studio. Analyze the given models against the user's use case comparatively.

Rules:
- reason and highlights MUST be in Simplified Chinese (简体中文)
- Each reason must be comparative: strengths/weaknesses relative to the other models, and "choose this if ..."
- highlights emphasize differentiators
- Respond with ONLY JSON:
{"items":[{"model":"<id>","reason":"...","highlights":["...","..."]}]}`;

// ---- Context builders ----

function candidateContext(cand: RankedCandidate): string {
  const model = cand.model;
  const profile = model.profile;
  const parts = [
    `ID: ${model.model}`,
    `Name: ${model.name}`,
    `Slot: ${cand.slot}`,
    profile?.oneLinePositioning
      ? `Positioning: ${profile.oneLinePositioning}`
      : `Description: ${model.description.slice(0, 120)}`,
    profile?.scenes?.length ? `Scenes: ${profile.scenes.join(", ")}` : "",
    profile?.familyTier ? `Tier: ${profile.familyTier}` : "",
    model.contextWindow ? `Context: ${model.contextWindow}` : "",
    model.prices?.length ? `Price: ${model.prices[0].price}/${model.prices[0].unit}` : "",
    profile?.notSuitableFor?.length ? `NotSuitableFor: ${profile.notSuitableFor.join(", ")}` : "",
  ];
  return parts.filter(Boolean).join(" | ");
}

// ---- Strategies ----

function confidenceFor(cand: RankedCandidate): Recommendation["confidence"] {
  if (cand.model.profile?.profileCompleteness === "structured-only") return "low";
  if (cand.slot === "exploration" || cand.slot === "alternative") return "medium";
  return "high";
}

/** template-text: assemble reason from precompiled profile fields, zero LLM. */
export function templateExplain(ranked: RankedCandidate[]): Recommendation[] {
  return ranked.map((cand) => {
    const profile = cand.model.profile;
    const highlights: string[] = [];
    if (profile?.familyTier) highlights.push(profile.familyTier);
    if (cand.model.prices?.length) {
      highlights.push(`${cand.model.prices[0].price}/${cand.model.prices[0].unit}`);
    }
    if (profile?.styleKeywords?.length) highlights.push(...profile.styleKeywords.slice(0, 2));
    return {
      model: cand.model.model,
      name: cand.model.name,
      reason: profile?.oneLinePositioning ?? cand.model.description.slice(0, 80),
      highlights,
      confidence: confidenceFor(cand),
      slot: cand.slot,
      docUrl: cand.model.docUrl,
      specs: buildModelSpecs(cand.model),
    };
  });
}

/** catalog: terse listing for browse mode, zero LLM. */
export function catalogExplain(ranked: RankedCandidate[]): Recommendation[] {
  return ranked.map((cand) => ({
    model: cand.model.model,
    name: cand.model.name,
    reason: cand.model.profile?.oneLinePositioning ?? "",
    highlights: cand.model.profile?.familyTier ? [cand.model.profile.familyTier] : [],
    confidence: confidenceFor(cand),
    slot: cand.slot,
    docUrl: cand.model.docUrl,
    specs: buildModelSpecs(cand.model),
  }));
}

async function llmExplain(
  systemPrompt: string,
  ranked: RankedCandidate[],
  ctx: RecommendContext,
): Promise<Recommendation[]> {
  ctx.trace.performance.llmCalls++; // count attempts, including failed ones
  const content = await ctx.llm.chat(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `User request: ${ctx.input}\n\nIntent:\n${formatIntentContext(ctx.intent)}\n\nRanked candidates:\n${ranked.map(candidateContext).join("\n")}`,
      },
    ],
    { maxTokens: 2048, stage: "explain", signal: ctx.signal },
  );

  const parsed = extractJson(content) as {
    items?: { model: string; reason?: string; highlights?: string[] }[];
  };
  const byModel = new Map((parsed.items ?? []).map((item) => [item.model, item]));

  return ranked.map((cand) => {
    const item = byModel.get(cand.model.model);
    return {
      model: cand.model.model,
      name: cand.model.name,
      reason: item?.reason ?? cand.model.profile?.oneLinePositioning ?? "",
      highlights: item?.highlights ?? [],
      confidence: confidenceFor(cand),
      slot: cand.slot,
      docUrl: cand.model.docUrl,
      specs: buildModelSpecs(cand.model),
    };
  });
}

/** Explain dispatch with degradation to template-text on LLM failure. */
export async function explain(
  strategy: ExplainStrategy,
  ranked: RankedCandidate[],
  ctx: RecommendContext,
): Promise<Recommendation[]> {
  switch (strategy) {
    case "template-text":
      return templateExplain(ranked);
    case "catalog":
      return catalogExplain(ranked);
    case "llm-compare":
      try {
        return await llmExplain(COMPARE_SYSTEM_PROMPT, ranked, ctx);
      } catch (err) {
        throwIfCancelled(ctx.signal);
        if (toLLMError(err, "explain").kind === "cancelled") throw err;
        ctx.trace.degradations.push(
          toDegradation("explain", "llm-compare→template-text", toLLMError(err, "explain")),
        );
        return templateExplain(ranked);
      }
    case "llm-generate":
    default:
      try {
        return await llmExplain(GENERATE_SYSTEM_PROMPT, ranked, ctx);
      } catch (err) {
        throwIfCancelled(ctx.signal);
        if (toLLMError(err, "explain").kind === "cancelled") throw err;
        ctx.trace.degradations.push(
          toDegradation("explain", "llm-generate→template-text", toLLMError(err, "explain")),
        );
        return templateExplain(ranked);
      }
  }
}
