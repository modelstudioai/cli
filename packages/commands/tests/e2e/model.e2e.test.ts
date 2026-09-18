import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { MODEL_ROUTES } from "./topic-routes.ts";

// 只覆盖 help / 参数校验 / dry-run；真实目录调用依赖公开模型目录接口的可用性。
describe("e2e: model", () => {
  test("model list --help 包含新增的模态与生命周期参数", async () => {
    const { stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, ["model", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--input-modality");
    expect(stderr).toContain("--output-modality");
    expect(stderr).toContain("--include-deprecated");
  });

  test("model search --help 包含关键词与过滤参数", async () => {
    const { stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, ["model", "search", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--keyword");
    expect(stderr).toContain("--limit");
    expect(stderr).toContain("--input-modality");
    expect(stderr).toContain("--include-deprecated");
  });

  test("model code --help 包含 SDK 选择参数", async () => {
    const { stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, ["model", "code", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--sdk");
    expect(stderr).toContain("--api");
    expect(stderr).toContain("--lang");
  });

  test("model search 缺少 --keyword 报错", async () => {
    // 无任何 flag 时框架走 help 分支，需带上其它 flag 才触发必填校验
    const { stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, [
      "model",
      "search",
      "--limit",
      "5",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--keyword");
  });

  test("model code 缺少 --model 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, [
      "model",
      "code",
      "--lang",
      "python",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--model");
  });

  test("model search --limit 非正数报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, [
      "model",
      "search",
      "--keyword",
      "qwen",
      "--limit",
      "0",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--limit must be a positive number.");
  });

  test("model search --input-modality 非法取值报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, [
      "model",
      "search",
      "--keyword",
      "qwen",
      "--input-modality",
      "Hologram",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("input-modality");
  });

  test("model list --dry-run 输出解析后的过滤参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, [
      "model",
      "list",
      "--capability",
      "TG",
      "--page-size",
      "5",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      pageSize?: number;
      capabilities?: string[];
      includeDeprecated?: boolean;
    }>(stdout);
    expect(data.action).toBe("model.list");
    expect(data.pageSize).toBe(5);
    expect(data.capabilities).toEqual(["TG"]);
    // 已下线模型默认隐藏
    expect(data.includeDeprecated).toBe(false);
  });

  test("model search --dry-run 输出关键词与默认 limit", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, [
      "model",
      "search",
      "--keyword",
      "qwen",
      "--output-modality",
      "Text",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      keyword?: string;
      limit?: number;
      includeDeprecated?: boolean;
    }>(stdout);
    expect(data.action).toBe("model.search");
    expect(data.keyword).toBe("qwen");
    expect(data.limit).toBe(20);
    expect(data.includeDeprecated).toBe(false);
  });

  test("model code --dry-run 输出目标模型与 SDK 选择", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MODEL_ROUTES, [
      "model",
      "code",
      "--model",
      "qwen-max",
      "--sdk",
      "dashscope",
      "--lang",
      "java",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action?: string;
      model?: string;
      sdk?: string;
      lang?: string;
    }>(stdout);
    expect(data.action).toBe("model.code");
    expect(data.model).toBe("qwen-max");
    expect(data.sdk).toBe("dashscope");
    expect(data.lang).toBe("java");
  });
});
