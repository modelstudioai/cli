import { describe, expect, it, vi } from "vite-plus/test";
import { analyzeIntent, DEFAULT_INTENT } from "./index.ts";
import type { LLMClient } from "../types.ts";

const llm = (parsed: unknown): LLMClient => ({
  chat: vi.fn(),
  chatJson: vi.fn().mockResolvedValue(parsed),
  chatWithTools: vi.fn(),
});

const base = {
  matchedScenes: [],
  sceneConfidence: 0,
  requiredCapabilities: ["TG"],
};

describe("analyzeIntent 质量偏好默认值", () => {
  it("未表达价格/性能偏好时默认 flagship", async () => {
    const intent = await analyzeIntent(llm({ ...base }), "帮我推荐一个写代码的模型");
    expect(intent.qualityPreference).toBe("flagship");
    expect(intent.budget).toBe("medium");
  });

  it("非法 qualityPreference 值回退 flagship", async () => {
    const intent = await analyzeIntent(llm({ ...base, qualityPreference: "ultra" }), "测试");
    expect(intent.qualityPreference).toBe("flagship");
  });

  it("显式 cost-optimized 与 balanced 透传", async () => {
    const cheap = await analyzeIntent(
      llm({ ...base, qualityPreference: "cost-optimized" }),
      "有没有便宜点的",
    );
    expect(cheap.qualityPreference).toBe("cost-optimized");
    const mid = await analyzeIntent(
      llm({ ...base, qualityPreference: "balanced" }),
      "想要个中档的",
    );
    expect(mid.qualityPreference).toBe("balanced");
  });

  it("DEFAULT_INTENT 默认 flagship", () => {
    expect(DEFAULT_INTENT.qualityPreference).toBe("flagship");
  });
});
