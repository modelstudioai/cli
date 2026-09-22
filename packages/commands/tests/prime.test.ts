import { describe, expect, test } from "vite-plus/test";
import { resolvePrimeEndpoint, validatePrimeFlags } from "../src/commands/shared/prime.ts";

function createUrlResolver(baseUrl: string, usesDefaultBaseUrl: boolean) {
  return {
    url(path: string, defaultBaseUrl?: () => string): string {
      const resolvedBaseUrl = usesDefaultBaseUrl && defaultBaseUrl ? defaultBaseUrl() : baseUrl;
      return resolvedBaseUrl + path;
    },
  };
}

describe("Prime command helpers", () => {
  test("要求显式 model，且 workspace flag 只能与 Prime 一起使用", () => {
    expect(validatePrimeFlags({ prime: true })).toMatch(/--model/);
    expect(validatePrimeFlags({ prime: false, workspaceId: "ws_test" })).toMatch(/--prime/);
    expect(validatePrimeFlags({ prime: true, model: "prime-model" })).toBeUndefined();
  });

  test("默认 Base URL 下让提交与轮询共用 workspace host", () => {
    const ctx = {
      flags: { workspaceId: "ws_test" },
      settings: {},
      identity: { binName: "bl" },
      client: createUrlResolver("https://dashscope.aliyuncs.com", true),
    };

    expect(
      resolvePrimeEndpoint(ctx, "/api/v1/services/aigc/video-generation/video-synthesis"),
    ).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    );
    expect(resolvePrimeEndpoint(ctx, "/api/v1/tasks/task_test")).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task_test",
    );
  });

  test("显式 Base URL 优先，且不要求 workspace", () => {
    const ctx = {
      flags: {},
      settings: {},
      identity: { binName: "bl" },
      client: createUrlResolver("https://example.test", false),
    };

    expect(resolvePrimeEndpoint(ctx, "/compatible-mode/v1/chat/completions")).toBe(
      "https://example.test/compatible-mode/v1/chat/completions",
    );
  });
});
