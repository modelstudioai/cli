import { describe, expect, test } from "vite-plus/test";
import {
  type EngineRecommendation,
  type EngineRecommendSuccess,
  type EngineIntentProfile,
} from "bailian-cli-core";
import { adaptCommandOutput } from "../src/commands/advisor/recommend-adapter.ts";

describe("advisor recommend JSON contract (legacy shape preserved)", () => {
  const intent = {
    taskSummary: "summarize long documents",
    scenarioHints: ["document processing"],
    complexity: "single",
    inputModality: ["Text"],
    outputModality: ["Text"],
    requiredCapabilities: ["TG"],
    budget: "medium",
    qualityPreference: "balanced",
    modelPreference: { mode: "unconstrained" },
    segments: undefined,
  } as unknown as EngineIntentProfile;

  const baseRec = {
    model: "qwen-max",
    name: "Qwen Max",
    reason: "strong general reasoning",
    highlights: ["1M context", "flagship quality"],
    confidence: "high",
    slot: "primary",
    docUrl: "https://example.com/qwen-max",
    specs: {
      contextWindow: 1_000_000,
      maxOutputTokens: 32_768,
      features: ["long context"],
      prices: [],
    },
  } as unknown as EngineRecommendation;

  test("single result maps to legacy {type:single, recommendations}", () => {
    const success: EngineRecommendSuccess = {
      type: "result",
      recommendations: [baseRec],
      confidence: "high",
      routingReason: "optimize-single",
      candidatePool: 42,
      intent,
      degradations: [],
    };
    const adapted = adaptCommandOutput(success);
    expect(adapted.result.type).toBe("single");
    const recs = (
      adapted.result as unknown as {
        recommendations: Array<Record<string, unknown>>;
      }
    ).recommendations;
    expect(recs[0].model).toBe("qwen-max");
    expect(recs[0].name).toBe("Qwen Max");
    expect(recs[0].reason).toBeDefined();
    expect(recs[0].highlights).toEqual(["1M context", "flagship quality"]);
    // specs fields flattened into the legacy slots
    expect(recs[0].contextWindow).toBe(1_000_000);
    expect(recs[0].maxOutputTokens).toBe(32_768);
    expect(recs[0].docUrl).toBe("https://example.com/qwen-max");
    // engine-only signals must not leak into stdout JSON
    expect(recs[0].slot).toBeUndefined();
    expect(recs[0].confidence).toBeUndefined();
    expect(recs[0].specs).toBeUndefined();
    expect(adapted.intent.taskSummary).toBe("summarize long documents");
    expect(adapted.candidates).toBe(42);
  });

  test("multi-step result maps to legacy {type:pipeline, summary, steps}", () => {
    const stepRec = { ...baseRec, model: "wan-video", step: 2 };
    const success: EngineRecommendSuccess = {
      type: "result",
      recommendations: [baseRec, stepRec],
      confidence: "medium",
      routingReason: "pipeline-steps",
      candidatePool: 20,
      intent,
      degradations: [],
      steps: [
        {
          index: 1,
          step: "剧本创作",
          inputModality: ["Text"],
          outputModality: ["Text"],
          capabilities: ["TG"],
          confidence: "medium",
          candidatePool: 8,
          gate: "strict",
          recommendations: [baseRec],
        },
        {
          index: 2,
          step: "视频生成",
          inputModality: ["Text"],
          outputModality: ["Video"],
          capabilities: ["VG"],
          confidence: "medium",
          candidatePool: 5,
          gate: "strict",
          recommendations: [stepRec],
        },
      ],
      warnings: ["step 2 output Video not accepted by step 3"],
    };
    const adapted = adaptCommandOutput(success);
    expect(adapted.result.type).toBe("pipeline");
    const pipeline = adapted.result as unknown as {
      summary: string;
      steps: Array<{ step: string; recommendations: Array<Record<string, unknown>> }>;
      warnings?: string[];
    };
    expect(pipeline.summary).toContain("剧本创作");
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps[0].recommendations[0].model).toBe("qwen-max");
    expect(pipeline.steps[1].recommendations[0].model).toBe("wan-video");
    expect(pipeline.warnings).toHaveLength(1);
  });

  test("unconstrained modelPreference is dropped from the intent projection", () => {
    const success: EngineRecommendSuccess = {
      type: "result",
      recommendations: [baseRec],
      confidence: "high",
      routingReason: "structured-normal",
      candidatePool: 10,
      intent,
      degradations: [],
    };
    const adapted = adaptCommandOutput(success);
    expect(adapted.intent.modelPreference).toBeUndefined();
  });
});
