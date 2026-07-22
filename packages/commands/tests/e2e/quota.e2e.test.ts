import { describe, expect, test } from "vite-plus/test";
import {
  isConsoleE2EReady,
  isConsoleAuthFailure,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import { QUOTA_ROUTES } from "./topic-routes.ts";

describe("e2e: quota", () => {
  test("quota list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, ["quota", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
  });

  test("quota list --help 包含所有示例", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, ["quota", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl quota list");
    expect(stderr).toContain("bl quota list --model qwen3.6-plus");
  });

  test("quota request --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, ["quota", "request", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--tpm");
  });

  test("quota history --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, ["quota", "history", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--page");
    expect(stderr).toContain("--model");
  });

  test("quota check --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, ["quota", "check", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--period");
    expect(stderr).toContain("bl quota check");
  });

  test("quota check --period 0 报错最小值", async () => {
    const { stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--period",
      "0.5",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("at least 1 minute");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: quota（Console）", () => {
  test("quota list --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      apis?: (string | { api: string; note?: string })[];
      modelListInput?: {
        input?: { queryQpmInfo?: boolean; supports?: { selfServiceLimitIncrease?: boolean } };
      };
    }>(stdout);
    expect(data.apis?.[0]).toContain("listFoundationModels");
    expect(data.modelListInput?.input?.queryQpmInfo).toBe(true);
    expect(data.modelListInput?.input?.supports?.selfServiceLimitIncrease).toBe(true);
  });

  test("quota list 文本输出包含英文表头", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, ["quota", "list", "--output", "text"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota list --model 指定模型返回结果", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota list --model 不存在的模型报错", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "list",
      "--model",
      "nonexistent-model-xyz-99999",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no matching models found");
  });

  test("quota list JSON 输出包含 model/rpm/tpm/maxTPM", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, ["quota", "list", "--output", "json"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota request --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "request",
      "--model",
      "qwen3.6-plus",
      "--tpm",
      "6000000",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { input?: { model?: string; limit?: { usage_limit?: number } } };
    }>(stdout);
    expect(data.api).toContain("updateFoundationModelLimits");
    expect(data.data?.input?.model).toBe("qwen3.6-plus");
    expect(data.data?.input?.limit?.usage_limit).toBeTypeOf("number");
  });

  test("quota request TPM 超范围报错", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "request",
      "--model",
      "qwen3.6-plus",
      "--tpm",
      "999",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("out of range");
    expect(result.stderr).toContain("Current");
    expect(result.stderr).toContain("Range");
  });

  test("quota request 不支持提额的模型报错", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "request",
      "--model",
      "nonexistent-model-xyz-99999",
      "--tpm",
      "100000",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not found");
  });

  test("quota history --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "history",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { input?: { pageNo?: number; pageSize?: number } };
    }>(stdout);
    expect(data.api).toContain("listModelLimitApplications");
    expect(data.data?.input?.pageNo).toBe(1);
    expect(data.data?.input?.pageSize).toBe(10);
  });

  test("quota check --dry-run 输出 API 信息", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ apis?: string[]; consoleRegion?: string }>(stdout);
    expect(data.apis).toContain(
      "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels",
    );
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.monitor.getMonitorData");
    expect(data.consoleRegion).toBe("cn-beijing");
  });

  test("quota check --dry-run --console-region 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--dry-run",
      "--output",
      "json",
      "--console-region",
      "cn-hangzhou",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ consoleRegion?: string }>(stdout);
    expect(data.consoleRegion).toBe("cn-hangzhou");
  });

  test("quota check 文本输出包含英文表头", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, ["quota", "check", "--output", "text"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota check --model 指定单模型", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota check --model 逗号分隔多模型", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--model",
      "qwen3.6-plus,qwen-plus",
      "--output",
      "text",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota check JSON 输出包含用量和限额字段", async () => {
    const result = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "check",
      "--model",
      "qwen3.6-plus",
      "--output",
      "json",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
  });

  test("quota history --dry-run --page 2 --page-size 20", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(QUOTA_ROUTES, [
      "quota",
      "history",
      "--page",
      "2",
      "--page-size",
      "20",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { input?: { pageNo?: number; pageSize?: number } };
    }>(stdout);
    expect(data.data?.input?.pageNo).toBe(2);
    expect(data.data?.input?.pageSize).toBe(20);
  });
});
