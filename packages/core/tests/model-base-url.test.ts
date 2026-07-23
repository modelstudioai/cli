import { expect, test } from "vite-plus/test";
import { BailianError } from "../src/errors/base.ts";
import { normalizeModelBaseUrl } from "../src/config/model-base-url.ts";

test("normalizeModelBaseUrl keeps only the URL origin", () => {
  expect(normalizeModelBaseUrl(" https://dashscope.aliyuncs.com/?region=cn#docs ")).toBe(
    "https://dashscope.aliyuncs.com",
  );
  expect(
    normalizeModelBaseUrl(
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    ),
  ).toBe("https://token-plan.cn-beijing.maas.aliyuncs.com");
  expect(normalizeModelBaseUrl("https://example.com/api/v1/agentstudio")).toBe(
    "https://example.com",
  );
  expect(
    normalizeModelBaseUrl(
      "https://example.com/api/v1/services/aigc/image-generation/generation?model=qwen#docs",
    ),
  ).toBe("https://example.com");
});

test("normalizeModelBaseUrl preserves explicit ports while removing paths", () => {
  expect(normalizeModelBaseUrl("http://localhost:8080/bailian/")).toBe("http://localhost:8080");
});

test("normalizeModelBaseUrl rejects non-http and malformed URLs", () => {
  expect(() => normalizeModelBaseUrl("not a url")).toThrow(BailianError);
  expect(() => normalizeModelBaseUrl("ftp://example.com/path")).toThrow(/Invalid model base URL/);
});
