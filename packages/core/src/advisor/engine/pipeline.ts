import type {
  ConfidenceLevel,
  IntentProfile,
  RecommendContext,
  RecommendDeps,
  RecommendResult,
  RecommendTrace,
  ScoredCandidate,
} from "./types.ts";
import { analyzeIntent } from "./intent/index.ts";
import { route, detectUserIntent } from "./router/index.ts";
import { recall } from "./recall/index.ts";
import { score } from "./score/index.ts";
import { rank } from "./rank/index.ts";
import { explain } from "./explain/index.ts";
import { formatDegradation, throwIfCancelled, toLLMError } from "./llm/errors.ts";
import { runStepwise } from "./steps/index.ts";

function computeConfidence(ctx: RecommendContext, candidates: ScoredCandidate[]): ConfidenceLevel {
  const { plan, intent } = ctx;

  // template recall + precise scene hit → high
  if (plan.recall === "template" && intent.sceneConfidence >= 0.8) return "high";

  // pool too small → low
  if (candidates.length < 5 && plan.recall !== "forced") return "low";

  // clear score gap between top-1 and top-2 → high
  const sorted = [...candidates].sort((left, right) => right.finalScore - left.finalScore);
  const gap = sorted[0] ? sorted[0].finalScore - (sorted[1]?.finalScore ?? 0) : 0;
  if (gap > 0.2 && (sorted[0]?.finalScore ?? 0) > 0.6) return "high";

  // user-named targets are inherently confident
  if (plan.recall === "forced") return "high";

  return "medium";
}

function emitTrace(trace: RecommendTrace, verbose: boolean): void {
  if (verbose) {
    process.stderr.write(`[recommend:trace] ${JSON.stringify(trace)}\n`);
    return;
  }
  const parts = [
    trace.failure ? `failed at ${trace.failure.stage}` : (trace.routingReason ?? "?"),
    `${trace.performance.totalMs}ms`,
    `llm=${trace.performance.llmCalls}`,
  ];
  if (trace.failure) {
    const { status, kind } = trace.failure;
    parts.push(`error=${status ? `${status} ${kind}` : kind}`);
  }
  if (trace.degradations.length) {
    parts.push(`degraded=${trace.degradations.map(formatDegradation).join(",")}`);
  }
  process.stderr.write(`[recommend] ${parts.join(", ")}\n`);
}

/**
 * Deterministic recommendation pipeline:
 *   intent → route (with ambiguity short-circuit) → recall → score →
 *   rank (+fairness) → explain
 * Multi-step tasks (route "pipeline-steps") run recall/score/select per
 * intent segment instead and return `steps`.
 * Exactly the engine; no user interaction. The agent layer wraps this.
 */
export async function recommend(
  input: string,
  deps: RecommendDeps,
  presetIntent?: IntentProfile,
): Promise<RecommendResult> {
  throwIfCancelled(deps.signal);
  const t0 = Date.now();
  const trace: RecommendTrace = {
    timestamp: new Date().toISOString(),
    input,
    performance: { llmCalls: 0 },
    degradations: [],
  };

  const models = await deps.catalog();
  throwIfCancelled(deps.signal);
  const decisionLog = deps.decisionLog ?? [];

  // 1. intent analysis (skippable when the agent layer passes a refined intent)
  // Failure here aborts the run: every later stage depends on the intent.
  const tIntent = Date.now();
  let intent: IntentProfile;
  if (presetIntent) {
    intent = presetIntent;
  } else {
    trace.performance.llmCalls++;
    try {
      intent = await analyzeIntent(deps.llm, input, deps.signal);
      throwIfCancelled(deps.signal);
    } catch (err) {
      const llmErr = toLLMError(err, "intent");
      trace.performance.intentMs = Date.now() - tIntent;
      trace.performance.totalMs = Date.now() - t0;
      trace.failure = {
        stage: "intent",
        kind: llmErr.kind,
        status: llmErr.status,
        code: llmErr.code,
        requestId: llmErr.requestId,
        message: llmErr.message,
      };
      emitTrace(trace, deps.verbose ?? false);
      throw llmErr;
    }
  }
  trace.performance.intentMs = Date.now() - tIntent;
  trace.matchedScenes = intent.matchedScenes;
  trace.sceneConfidence = intent.sceneConfidence;
  decisionLog.push(
    `[intent] complexity=${intent.complexity} scenes=[${intent.matchedScenes.join(",")}] conf=${intent.sceneConfidence} caps=[${intent.requiredCapabilities.join(",")}] budget=${intent.budget} quality=${intent.qualityPreference}`,
  );

  // 2. route (Step 0 inside: ambiguity short-circuit)
  const plan = route(intent, models, deps.topN);
  trace.routingReason = plan.routingReason;
  decisionLog.push(`[route] ${plan.routingReason}${plan.clarify ? " → clarify" : ""}`);

  if (plan.clarify) {
    trace.performance.totalMs = Date.now() - t0;
    emitTrace(trace, deps.verbose ?? false);
    return { type: "need_clarify", ...plan.clarify, intent };
  }

  const ctx: RecommendContext = {
    input,
    intent,
    models,
    plan,
    topN: plan.topN,
    llm: deps.llm,
    signal: deps.signal,
    trace,
    decisionLog,
  };

  // Multi-step task: per-step recall/score/select + one batched explanation
  if (plan.stepwise) {
    const stepwise = await runStepwise(ctx);
    throwIfCancelled(deps.signal);
    trace.performance.totalMs = Date.now() - t0;
    emitTrace(trace, deps.verbose ?? false);
    return {
      type: "result",
      recommendations: stepwise.steps.flatMap((step) => step.recommendations),
      confidence: stepwise.confidence,
      routingReason: plan.routingReason,
      candidatePool: stepwise.candidatePool,
      intent,
      degradations: [...trace.degradations],
      steps: stepwise.steps,
      warnings: stepwise.warnings,
    };
  }

  const userIntent = detectUserIntent(intent);

  // 3. recall
  const tRecall = Date.now();
  const candidates = recall(plan.recall, intent, models, plan.topN);
  trace.performance.recallMs = Date.now() - tRecall;
  decisionLog.push(`[recall] strategy=${plan.recall} pool=${candidates.length}`);

  // 4. score (holistic degrades to formula on LLM failure)
  const tScore = Date.now();
  const scored = await score(plan.score, candidates, ctx, userIntent);
  throwIfCancelled(deps.signal);
  trace.performance.scoreMs = Date.now() - tScore;
  decisionLog.push(
    `[score] strategy=${plan.score} top=${scored
      .slice(0, 3)
      .map((c) => `${c.model.model}(${c.finalScore.toFixed(2)})`)
      .join(", ")}`,
  );

  // 5. rank + fairness
  const tRank = Date.now();
  const ranked = rank(plan.rank, scored, plan.topN, plan.fairness, intent);
  trace.performance.rankMs = Date.now() - tRank;
  decisionLog.push(`[rank] ${ranked.map((r) => `${r.model.model}/${r.slot}`).join(", ")}`);

  // 6. explain (LLM strategies degrade to template-text on failure)
  const tExplain = Date.now();
  const recommendations = await explain(plan.explain, ranked, ctx);
  throwIfCancelled(deps.signal);
  trace.performance.explainMs = Date.now() - tExplain;

  trace.performance.totalMs = Date.now() - t0;
  emitTrace(trace, deps.verbose ?? false);

  return {
    type: "result",
    recommendations,
    confidence: computeConfidence(ctx, scored),
    routingReason: plan.routingReason,
    candidatePool: candidates.length,
    intent,
    degradations: [...trace.degradations],
  };
}
