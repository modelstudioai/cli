import { expect, test } from "vite-plus/test";
import { BailianError } from "../src/errors/base.ts";
import { normalizeModelBaseUrl } from "../src/config/model-base-url.ts";

test("normalizeModelBaseUrl removes URL noise and known API base suffixes", () => {
  expect(normalizeModelBaseUrl(" https://dashscope.aliyuncs.com/?region=cn#docs ")).toBe(
    "https://dashscope.aliyuncs.com",
  );
  expect(
    normalizeModelBaseUrl("https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/"),
  ).toBe("https://token-plan.cn-beijing.maas.aliyuncs.com");
  expect(
    normalizeModelBaseUrl("https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic"),
  ).toBe("https://token-plan.cn-beijing.maas.aliyuncs.com");
});

test("normalizeModelBaseUrl preserves ports and custom gateway prefixes", () => {
  expect(normalizeModelBaseUrl("http://localhost:8080/bailian/")).toBe(
    "http://localhost:8080/bailian",
  );
  expect(
    normalizeModelBaseUrl("https://proxy.example.com/bailian/compatible-mode/v1?tenant=one"),
  ).toBe("https://proxy.example.com/bailian");
  expect(normalizeModelBaseUrl("https://proxy.example.com/custom/apps/anthropic#section")).toBe(
    "https://proxy.example.com/custom",
  );
});

test("normalizeModelBaseUrl rejects non-http and malformed URLs", () => {
  expect(() => normalizeModelBaseUrl("not a url")).toThrow(BailianError);
  expect(() => normalizeModelBaseUrl("ftp://example.com/path")).toThrow(/Invalid model base URL/);
});
