import { describe, expect, test } from "vite-plus/test";
import { isConsoleE2EReady, isConsoleAuthFailure, parseStdoutJson, runCli } from "./helpers.ts";

describe("e2e: usage free", () => {
  test("usage 分组展示子命令帮助且退出码为 0", async () => {
    const { stdout, stderr, exitCode } = await runCli(["usage"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/usage|free|freetier/i);
  });

  test("usage free --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["usage", "free", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model|quota|free-tier/i);
  });

  test("usage free --help 包含所有示例", async () => {
    const { stderr, exitCode } = await runCli(["usage", "free", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl usage free");
    expect(stderr).toContain("bl usage free --model qwen3-max");
    expect(stderr).toContain("bl usage free --model qwen3-max,qwen-turbo");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: usage free（Console）", () => {
  test("usage free --dry-run --model 输出请求参数不发起调用", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "free",
      "--dry-run",
      "--model",
      "qwen3-max",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { queryFreeTierQuotaRequest?: { models?: string[] } };
    }>(stdout);
    expect(data.api).toContain("queryFreeTierQuota");
    expect(data.data?.queryFreeTierQuotaRequest?.models).toEqual(["qwen3-max"]);
  });

  test("usage free --dry-run --model 逗号分隔多个模型", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "free",
      "--dry-run",
      "--model",
      "qwen3-max,qwen-turbo",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { queryFreeTierQuotaRequest?: { models?: string[] } };
    }>(stdout);
    expect(data.data?.queryFreeTierQuotaRequest?.models).toEqual(["qwen3-max", "qwen-turbo"]);
  });

  test("usage free --dry-run --model 重复模型名自动去重", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "free",
      "--dry-run",
      "--model",
      "qwen3-max,qwen3-max,qwen-turbo",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { queryFreeTierQuotaRequest?: { models?: string[] } };
    }>(stdout);
    expect(data.data?.queryFreeTierQuotaRequest?.models).toEqual(["qwen3-max", "qwen-turbo"]);
  });

  test("usage free --dry-run --model 逗号间有空格也能正确解析", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "usage",
      "free",
      "--dry-run",
      "--model",
      "qwen3-max, qwen-turbo",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { queryFreeTierQuotaRequest?: { models?: string[] } };
    }>(stdout);
    expect(data.data?.queryFreeTierQuotaRequest?.models).toEqual(["qwen3-max", "qwen-turbo"]);
  });

  test("usage free --dry-run 不指定 --model 传全量模型列表", async () => {
    const { stderr, exitCode } = await runCli(["usage", "free", "--dry-run", "--output", "json"]);
    expect(exitCode, stderr).toBe(0);
  });

  test("usage free --model 单模型查询返回 JSON 结果", async () => {
    const result = await runCli(["usage", "free", "--model", "qwen3-max", "--output", "json"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model 单模型文本输出包含表头", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "qwen3-max",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model 文本输出包含模型名", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "qwen3-max",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model 逗号分隔多模型文本输出包含所有模型", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "qwen3-max,qwen-turbo",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model 文本输出包含正确的 Type 列", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "qwen3-max",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model quotaStatus 为 UNKNOWN 时 Auto-Stop 显示 Unsupported", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "wan2.7-image",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model quotaStatus 为 UNKNOWN 时额度显示为 -", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "wan2.7-image",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model 不存在的模型仍返回表格行", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "nonexistent-model-xyz-12345",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model Auto-Stop 显示 ON、OFF 或 Unsupported", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "qwen3-max",
      "--output",
      "text",
      "--no-color",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("usage free --model --console-region cn-beijing 指定区域查询", async () => {
    const result = await runCli([
      "usage",
      "free",
      "--model",
      "qwen3-max",
      "--console-region",
      "cn-beijing",
      "--output",
      "json",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });
});
