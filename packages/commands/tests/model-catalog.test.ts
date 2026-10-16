import { describe, expect, test } from "vite-plus/test";
import type { ModelGroupItem, ModelSampleCodeV2 } from "bailian-cli-core";
import {
  filterModelsLocally,
  formatOfflineMarker,
  matchesModality,
  modelLifecycle,
  normalizeModelKey,
  pickTrunkItems,
} from "../src/commands/model/shared.ts";
import { resolveSample } from "../src/commands/model/code.ts";
import { scoreModelMatch } from "../src/commands/model/search.ts";

function modelItem(overrides: Partial<ModelGroupItem> = {}): ModelGroupItem {
  return { model: "qwen-max", name: "Qwen-Max", ...overrides };
}

const NOW = Date.parse("2026-08-30T00:00:00Z");

describe("normalizeModelKey", () => {
  test("drops the snapshot suffix so a snapshot compares equal to its trunk", () => {
    expect(normalizeModelKey("qwen-max-2024-09-19")).toBe("qwenmax");
    expect(normalizeModelKey("qwen-max")).toBe("qwenmax");
  });

  test("collapses separators so spaced keywords match dashed ids", () => {
    expect(normalizeModelKey("Qwen Max")).toBe(normalizeModelKey("qwen-max"));
  });
});

describe("scoreModelMatch", () => {
  test("ranks an exact id above a prefix above a substring", () => {
    const exact = scoreModelMatch(modelItem(), "qwen-max");
    const prefix = scoreModelMatch(modelItem({ model: "qwen-max-latest" }), "qwen-max");
    const substring = scoreModelMatch(
      modelItem({ model: "aliyun-qwen-max", name: "Aliyun" }),
      "qwen",
    );

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });

  test("ranks a trunk model above its own snapshot", () => {
    const trunk = scoreModelMatch(modelItem(), "qwen-max");
    const snapshot = scoreModelMatch(modelItem({ model: "qwen-max-2024-09-19" }), "qwen-max");

    expect(trunk).toBeGreaterThan(snapshot);
  });

  test("matches CJK prose in the description, which id normalization cannot", () => {
    const item = modelItem({ description: "支持超长上下文的旗舰模型" });

    expect(scoreModelMatch(item, "超长上下文")).toBeGreaterThan(0);
    expect(scoreModelMatch(modelItem(), "超长上下文")).toBe(0);
  });

  test("matches a spaced keyword against a dashed feature", () => {
    const item = modelItem({ features: ["function-calling"] });

    expect(scoreModelMatch(item, "function calling")).toBeGreaterThan(0);
  });

  test("scores a model with no matching field as zero", () => {
    expect(
      scoreModelMatch(modelItem({ description: "nothing relevant" }), "zzz-no-such-model"),
    ).toBe(0);
  });

  test("sinks retiring and offline models below an identical healthy one", () => {
    const healthy = modelItem({ model: "qwen3-8b" });
    const retiring = modelItem({
      model: "qwen3-8b",
      offlineInfo: { inference: { offlineTime: "2099-01-01 00:00:00" } },
    });
    const retired = modelItem({ model: "qwen3-8b", offlineAt: "2020-01-01T00:00:00.000+00:00" });

    const healthyScore = scoreModelMatch(healthy, "qwen3-8b");
    const retiringScore = scoreModelMatch(retiring, "qwen3-8b");

    expect(retiringScore).toBeLessThan(healthyScore);
    expect(scoreModelMatch(retired, "qwen3-8b")).toBeLessThan(retiringScore);
  });
});

describe("modelLifecycle", () => {
  test("treats a past offlineAt as offline", () => {
    const lifecycle = modelLifecycle(
      modelItem({ offlineAt: "2026-07-13T15:59:59.000+00:00" }),
      NOW,
    );

    expect(lifecycle.offline).toBe(true);
    expect(formatOfflineMarker(lifecycle)).toBe("OFFLINE");
  });

  test("treats a future offlineAt as still live", () => {
    expect(
      modelLifecycle(modelItem({ offlineAt: "2027-01-01T00:00:00.000+00:00" }), NOW).offline,
    ).toBe(false);
  });

  test("surfaces an announced retirement that has not taken effect yet", () => {
    const lifecycle = modelLifecycle(
      modelItem({
        offlineInfo: {
          inference: {
            announceUrl: "https://example.com/notice",
            offlineTime: "2026-10-10 00:00:00",
          },
        },
      }),
      NOW,
    );

    expect(lifecycle.offline).toBe(false);
    expect(lifecycle.upcomingOfflineAt).toBe("2026-10-10 00:00:00");
    expect(lifecycle.announceUrl).toBe("https://example.com/notice");
    expect(formatOfflineMarker(lifecycle)).toBe("OFFLINE 2026-10-10");
  });

  test("reports nothing for a live model with an empty notice", () => {
    const lifecycle = modelLifecycle(modelItem({ offlineInfo: { inference: {} } }), NOW);

    expect(lifecycle.offline).toBe(false);
    expect(formatOfflineMarker(lifecycle)).toBe("");
  });
});

describe("matchesModality", () => {
  const imageToText = modelItem({
    inferenceMetadata: { request_modality: ["Image", "Text"], response_modality: ["Text"] },
  });

  test("gates each direction independently", () => {
    expect(matchesModality(imageToText, ["Image"], ["Text"])).toBe(true);
    expect(matchesModality(imageToText, ["Image"], ["Image"])).toBe(false);
    expect(matchesModality(imageToText, ["Video"], ["Text"])).toBe(false);
  });

  test("treats an empty filter as unconstrained", () => {
    expect(matchesModality(imageToText, [], [])).toBe(true);
    expect(matchesModality(modelItem(), [], [])).toBe(true);
  });
});

describe("filterModelsLocally", () => {
  const live = modelItem({ model: "qwen-max" });
  const retired = modelItem({ model: "qwen-turbo", offlineAt: "2026-07-13T15:59:59.000+00:00" });

  test("hides offline models by default", () => {
    expect(filterModelsLocally([live, retired], {}, NOW)).toEqual([live]);
  });

  test("keeps offline models with --include-deprecated", () => {
    expect(filterModelsLocally([live, retired], { includeDeprecated: true }, NOW)).toEqual([
      live,
      retired,
    ]);
  });

  test("combines the lifecycle and modality filters", () => {
    const audio = modelItem({
      model: "cosyvoice",
      inferenceMetadata: { request_modality: ["Text"], response_modality: ["Audio"] },
    });

    expect(filterModelsLocally([live, retired, audio], { outputModality: ["Audio"] }, NOW)).toEqual(
      [audio],
    );
  });
});

describe("pickTrunkItems", () => {
  test("drops snapshots but keeps the latest one when a family has nothing else", () => {
    const trunk = modelItem({ model: "qwen-max" });
    const older = modelItem({ model: "qwen-max-2024-01-01" });
    const newer = modelItem({ model: "qwen-max-2024-09-19" });

    expect(pickTrunkItems([trunk, older, newer])).toEqual([trunk]);
    expect(pickTrunkItems([older, newer])).toEqual([newer]);
  });
});

describe("resolveSample", () => {
  const sampleCode: ModelSampleCodeV2 = {
    openai: {
      completionsAPI: {
        python: { code: "py-completions" },
        curl: { code: "curl-completions" },
      },
      responsesAPI: { node: { code: "node-responses" } },
    },
    dashscope: { default: { java: { code: "java-default" } } },
  };

  test("defaults to openai / completions / python", () => {
    expect(resolveSample(sampleCode, {})).toEqual({
      sdk: "openai",
      apiStyle: "completionsAPI",
      lang: "python",
      code: "py-completions",
    });
  });

  test("honours an explicit language and API style", () => {
    expect(resolveSample(sampleCode, { lang: "curl" }).code).toBe("curl-completions");
    expect(resolveSample(sampleCode, { api: "responses", lang: "node" }).code).toBe(
      "node-responses",
    );
  });

  test("falls back to the only API style an SDK publishes", () => {
    expect(resolveSample(sampleCode, { sdk: "dashscope" })).toEqual({
      sdk: "dashscope",
      apiStyle: "default",
      lang: "java",
      code: "java-default",
    });
  });

  test("accepts either node spelling regardless of which one the model publishes", () => {
    const publishesNodejs: ModelSampleCodeV2 = {
      openai: { completionsAPI: { nodejs: { code: "nodejs-snippet" } } },
    };
    const publishesNode: ModelSampleCodeV2 = {
      openai: { completionsAPI: { node: { code: "node-snippet" } } },
    };

    expect(resolveSample(publishesNodejs, { lang: "node" }).code).toBe("nodejs-snippet");
    expect(resolveSample(publishesNode, { lang: "nodejs" }).code).toBe("node-snippet");
  });

  test("reports what is available instead of silently substituting", () => {
    expect(() => resolveSample(sampleCode, { lang: "java" })).toThrow(/Available:.*openai/s);
    expect(() => resolveSample(sampleCode, { sdk: "langchain" })).toThrow(/Available:/);
  });
});
