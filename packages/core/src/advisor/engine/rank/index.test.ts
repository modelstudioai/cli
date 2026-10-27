import { describe, expect, it } from "vite-plus/test";
import { rank } from "./index.ts";
import { DEFAULT_INTENT } from "../intent/index.ts";
import type { IntentProfile, ModelProfile, ScoredCandidate } from "../types.ts";

function candidate(
  model: string,
  provider: string,
  family: string,
  familyTier: "flagship" | "balanced" | "lightweight",
  price: string,
): ScoredCandidate {
  const profile: ModelProfile = {
    model,
    name: model,
    description: "",
    provider,
    capabilities: ["TG"],
    features: [],
    family,
    prices: [{ type: "input_token", unit: "每百万tokens", price }],
    profile: { profileCompleteness: "full", familyTier },
  };
  return { model: profile, hardScore: 1, finalScore: 1 };
}

const slate: ScoredCandidate[] = [
  candidate("mimo", "xiaomi", "mimo", "flagship", "30"),
  candidate("kimi-k3", "moonshot-ai", "Kimi-K2", "flagship", "20"),
  candidate("kimi-market-k3", "moonshot-ai", "kimi-market", "flagship", "20"),
  candidate("glm-5.3-prime", "zhipu-ai", "glm", "flagship", "16"),
  candidate("kimi-k2.6", "moonshot-ai", "Kimi-K2", "balanced", "6.5"),
  candidate("glm-5.1", "zhipu-ai", "glm", "lightweight", "8"),
];

const ids = (result: ReturnType<typeof rank>) => result.map((entry) => entry.model.model);

describe("rank 档位选择", () => {
  it("未识别到价格意图时每家厂商只取一个旗舰，不再强凑均衡/轻量档位", () => {
    const intent: IntentProfile = { ...DEFAULT_INTENT };
    expect(ids(rank("template-order", slate, 3, false, intent))).toEqual([
      "mimo",
      "kimi-k3",
      "glm-5.3-prime",
    ]);
  });

  it("明确的低价意图仍按轻量优先的档位组合", () => {
    const intent: IntentProfile = { ...DEFAULT_INTENT, qualityPreference: "cost-optimized" };
    expect(ids(rank("template-order", slate, 3, false, intent))).toEqual([
      "glm-5.1",
      "kimi-k2.6",
      "mimo",
    ]);
  });

  it("预算低时同样走轻量优先组合", () => {
    const intent: IntentProfile = { ...DEFAULT_INTENT, budget: "low" };
    expect(ids(rank("template-order", slate, 3, false, intent))).toEqual([
      "glm-5.1",
      "kimi-k2.6",
      "mimo",
    ]);
  });

  it("旗舰不足三家时按入参顺序回填", () => {
    const small = [slate[0], slate[4], slate[5]];
    const intent: IntentProfile = { ...DEFAULT_INTENT };
    expect(ids(rank("template-order", small, 3, false, intent))).toEqual([
      "mimo",
      "kimi-k2.6",
      "glm-5.1",
    ]);
  });

  it("forced-order 保持用户点名顺序", () => {
    const intent: IntentProfile = { ...DEFAULT_INTENT };
    expect(ids(rank("forced-order", slate, 3, false, intent))).toEqual([
      "mimo",
      "kimi-k3",
      "kimi-market-k3",
    ]);
  });
});
