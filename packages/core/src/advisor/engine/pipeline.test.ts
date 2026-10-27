import { describe, expect, it, vi } from "vite-plus/test";
import { recommend } from "./pipeline.ts";
import { DEFAULT_INTENT } from "./intent/index.ts";
import { score } from "./score/index.ts";
import { explain } from "./explain/index.ts";
import { explainSteps } from "./steps/explain.ts";
import { LLMError } from "./llm/errors.ts";
import type { LLMClient, RankedCandidate, RecommendContext } from "./types.ts";

const candidate: RankedCandidate = {
  model: {
    model: "test",
    name: "测试模型",
    description: "测试",
    provider: "test",
    capabilities: ["TG"],
    features: [],
  },
  rank: 1,
  slot: "primary",
  hardScore: 1,
  finalScore: 1,
};

function context(llm: LLMClient, signal: AbortSignal): RecommendContext {
  return {
    input: "测试",
    intent: DEFAULT_INTENT,
    models: [candidate.model],
    topN: 1,
    llm,
    signal,
    plan: {
      recall: "holistic-pool",
      score: "holistic",
      rank: "score-sort",
      explain: "llm-generate",
      fairness: false,
      topN: 1,
      routingReason: "test",
    },
    trace: { timestamp: "test", input: "测试", performance: { llmCalls: 0 }, degradations: [] },
  };
}

describe("引擎取消传播", () => {
  it("目录加载后已取消，不再进行意图请求", async () => {
    const controller = new AbortController();
    const chatJson = vi.fn();
    await expect(
      recommend("测试", {
        signal: controller.signal,
        llm: { chat: vi.fn(), chatJson, chatWithTools: vi.fn() },
        catalog: async () => {
          controller.abort();
          return [candidate.model];
        },
      }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(chatJson).not.toHaveBeenCalled();
  });

  it.each(["score", "explain", "compare", "steps"])(
    "%s 收到取消后不得转模板或公式",
    async (stage) => {
      const controller = new AbortController();
      const chat = vi.fn<LLMClient["chat"]>().mockImplementation(async (_messages, opts) => {
        expect(opts?.signal).toBe(controller.signal);
        controller.abort();
        throw new LLMError("cancelled", "测试取消");
      });
      const ctx = context({ chat, chatJson: vi.fn(), chatWithTools: vi.fn() }, controller.signal);
      const run =
        stage === "score"
          ? score("holistic", [candidate], ctx, "match")
          : stage === "steps"
            ? explainSteps(
                [
                  {
                    step: {
                      index: 1,
                      label: "写作",
                      inputModality: ["Text"],
                      outputModality: ["Text"],
                      capabilities: ["TG"],
                      primaryCapability: "TG",
                    },
                    candidates: [candidate],
                  },
                ],
                ctx,
              )
            : explain(stage === "compare" ? "llm-compare" : "llm-generate", [candidate], ctx);
      await expect(run).rejects.toMatchObject({ kind: "cancelled" });
      expect(ctx.trace.degradations).toEqual([]);
      expect(chat).toHaveBeenCalledOnce();
    },
  );
});
