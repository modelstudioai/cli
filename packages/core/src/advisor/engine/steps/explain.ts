import type { RankedCandidate, Recommendation, RecommendContext } from "../types.ts";
import type { PlanStep } from "./segments.ts";
import { extractJson } from "../llm/json.ts";
import { formatIntentContext } from "../intent/context.ts";
import { throwIfCancelled, toDegradation, toLLMError } from "../llm/errors.ts";
import { templateExplain } from "../explain/index.ts";

export interface RankedStep {
  step: PlanStep;
  /** primary first, then alternative */
  candidates: RankedCandidate[];
}

const STEP_EXPLAIN_SYSTEM_PROMPT = `You are a model recommendation advisor for Alibaba Cloud Model Studio. The user's task is a multi-step pipeline. For EACH step, the candidates are ALREADY selected — do not reorder, add or drop models. Write a recommendation reason for each candidate.

Rules:
- reason and highlights MUST be in Simplified Chinese (简体中文)
- primary: why this model fits THIS step of the user's task, and what it hands to / takes from the adjacent steps when relevant
- alternative: frame it positively — the concrete situation in which the user should pick it instead of the primary (e.g. 预算更紧/追求更高画质/需要更长时长/已有参考视频). Never argue against it or call it unsuitable; it was selected as a valid option
- Each reason at most 80 Chinese characters; be specific to the user's task; no generic praise ("性能强大", "效果好")
- highlights: 2-3 short phrases
- Respond with ONLY JSON:
{"steps":[{"index":1,"items":[{"model":"<id>","reason":"...","highlights":["...","..."]}]}]}`;

function candidateBrief(cand: RankedCandidate): string {
  const model = cand.model;
  const profile = model.profile;
  const roles = (profile?.pipelineRole ?? [])
    .map((role) => `${role.from}→${role.to}: ${role.role}`)
    .slice(0, 3);
  return [
    `    - ID: ${model.model}`,
    `Slot: ${cand.slot}`,
    profile?.oneLinePositioning
      ? `Positioning: ${profile.oneLinePositioning}`
      : `Description: ${model.description.slice(0, 120)}`,
    profile?.familyTier ? `Tier: ${profile.familyTier}` : "",
    model.prices?.length ? `Price: ${model.prices[0].price}/${model.prices[0].unit}` : "",
    roles.length ? `Roles: ${roles.join("; ")}` : "",
    profile?.notSuitableFor?.length
      ? `NotSuitableFor: ${profile.notSuitableFor.slice(0, 3).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function stepBlock({ step, candidates }: RankedStep): string {
  const io = `${step.inputModality.join("/") || "?"} → ${step.outputModality.join("/") || "?"}`;
  return [
    `Step ${step.index}: ${step.label} (${io}, ${step.capabilities.join("+")})`,
    ...candidates.map(candidateBrief),
  ].join("\n");
}

function templateStep(ranked: RankedStep): Recommendation[] {
  return templateExplain(ranked.candidates).map((rec) => ({ ...rec, step: ranked.step.index }));
}

/**
 * One LLM call covering every step (instead of one per step) to keep the
 * call count flat regardless of pipeline length. Missing items fall back to
 * the model's precompiled positioning; a failed call degrades the whole plan
 * to template text and records why.
 */
export async function explainSteps(
  steps: RankedStep[],
  ctx: RecommendContext,
): Promise<Recommendation[][]> {
  if (steps.every((ranked) => ranked.candidates.length === 0)) return steps.map(() => []);

  let parsed: {
    steps?: {
      index?: number;
      items?: { model: string; reason?: string; highlights?: string[] }[];
    }[];
  };
  try {
    ctx.trace.performance.llmCalls++; // count attempts, including failed ones
    const content = await ctx.llm.chat(
      [
        { role: "system", content: STEP_EXPLAIN_SYSTEM_PROMPT },
        {
          role: "user",
          content: `User request: ${ctx.input}\n\nParsed intent:\n${formatIntentContext(ctx.intent)}\n\nSelected candidates per step:\n${steps.map(stepBlock).join("\n\n")}`,
        },
      ],
      { maxTokens: 2048, stage: "step-explain", signal: ctx.signal },
    );
    parsed = extractJson(content) as typeof parsed;
  } catch (err) {
    throwIfCancelled(ctx.signal);
    if (toLLMError(err, "explain").kind === "cancelled") throw err;
    ctx.trace.degradations.push(
      toDegradation("explain", "step-explain→template-text", toLLMError(err, "explain")),
    );
    return steps.map(templateStep);
  }

  const byStep = new Map<number, Map<string, { reason?: string; highlights?: string[] }>>();
  for (const entry of parsed.steps ?? []) {
    if (typeof entry.index !== "number") continue;
    byStep.set(entry.index, new Map((entry.items ?? []).map((item) => [item.model, item])));
  }

  return steps.map((ranked) => {
    const fallback = templateStep(ranked);
    const items = byStep.get(ranked.step.index);
    return fallback.map((rec) => {
      const item = items?.get(rec.model);
      if (!item?.reason) return rec;
      return {
        ...rec,
        reason: item.reason,
        highlights: item.highlights?.length ? item.highlights : rec.highlights,
      };
    });
  });
}
