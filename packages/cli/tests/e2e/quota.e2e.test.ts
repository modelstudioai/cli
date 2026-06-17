import { describe, expect, test } from "vite-plus/test";
import { isBailianE2EEnabled, parseStdoutJson, runCli } from "./helpers.ts";
import { readConfigFile } from "bailian-cli-core";

function isConsoleE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  if (process.env.DASHSCOPE_ACCESS_TOKEN?.trim()) return true;
  try {
    const config = readConfigFile();
    return typeof config.access_token === "string" && config.access_token.length > 0;
  } catch {
    return false;
  }
}

describe("e2e: quota", () => {
  test("quota list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["quota", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--all");
  });

  test("quota list --help 包含所有示例", async () => {
    const { stderr, exitCode } = await runCli(["quota", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl quota list");
    expect(stderr).toContain("bl quota list --model qwen3.6-plus");
    expect(stderr).toContain("bl quota list --all");
  });

  test("quota request --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["quota", "request", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--tpm");
    expect(stderr).toContain("--yes");
  });

  test("quota history --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["quota", "history", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--page");
    expect(stderr).toContain("--model");
  });

  test("quota check --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["quota", "check", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--period");
    expect(stderr).toContain("bl quota check");
  });

  test("quota check --period 0 报错最小值", async () => {
    const { stderr, exitCode } = await runCli(["quota", "check", "--period", "0.5"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("at least 1 minute");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: quota（Console）", () => {
  test("quota list --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "list",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: {
        input?: { queryQpmInfo?: boolean; supports?: { selfServiceLimitIncrease?: boolean } };
      };
    }>(stdout);
    expect(data.api).toContain("listFoundationModels");
    expect(data.data?.input?.queryQpmInfo).toBe(true);
    expect(data.data?.input?.supports?.selfServiceLimitIncrease).toBe(true);
  });

  test("quota list --dry-run --all 不传 supports 过滤", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "list",
      "--all",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      data?: { input?: { supports?: unknown } };
    }>(stdout);
    expect(data.data?.input?.supports).toBeUndefined();
  });

  test("quota list 文本输出包含英文表头", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "list",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Model");
    expect(stdout).toContain("Req/min");
    expect(stdout).toContain("Token/min");
    expect(stdout).toContain("Max TPM");
  });

  test("quota list --model 指定模型返回结果", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "list",
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("qwen3.6-plus");
    expect(stdout).toMatch(/Total: 1 models/);
  });

  test("quota list --model 不存在的模型报错", async () => {
    const { stderr, exitCode } = await runCli([
      "quota",
      "list",
      "--model",
      "nonexistent-model-xyz-99999",
      "--output",
      "text",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("no matching models found");
  });

  test("quota list JSON 输出包含 qpmInfo", async () => {
    const { stdout, stderr, exitCode } = await runCli(["quota", "list", "--output", "json"]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<Array<{ model?: string; qpmInfo?: unknown }>>(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].model).toBeTypeOf("string");
    expect(data[0].qpmInfo).toBeDefined();
  });

  test("quota request --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCli([
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
    const { stderr, exitCode } = await runCli([
      "quota",
      "request",
      "--model",
      "qwen3.6-plus",
      "--tpm",
      "999",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("out of range");
    expect(stderr).toContain("Current");
    expect(stderr).toContain("Range");
  });

  test("quota request 不支持提额的模型报错", async () => {
    const { stderr, exitCode } = await runCli([
      "quota",
      "request",
      "--model",
      "nonexistent-model-xyz-99999",
      "--tpm",
      "100000",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not found");
  });

  test("quota history --dry-run 输出请求参数", async () => {
    const { stdout, stderr, exitCode } = await runCli([
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
    const { stdout, stderr, exitCode } = await runCli([
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
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "check",
      "--dry-run",
      "--non-interactive",
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
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "check",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Model");
    expect(stdout).toContain("RPM Usage/Limit");
    expect(stdout).toContain("TPM Usage/Limit");
    expect(stdout).toContain("Status");
  });

  test("quota check --model 指定单模型", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "check",
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("qwen3.6-plus");
    expect(stdout).toMatch(/Total: 1 models/);
  });

  test("quota check --model 逗号分隔多模型", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "check",
      "--model",
      "qwen3.6-plus,qwen-plus",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("qwen3.6-plus");
    expect(stdout).toContain("qwen-plus");
    expect(stdout).toMatch(/Total: 2 models/);
  });

  test("quota check JSON 输出包含用量和限额字段", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "check",
      "--model",
      "qwen3.6-plus",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<
      Array<{
        model?: string;
        rpmUsage?: number;
        rpmLimit?: number;
        tpmUsage?: number;
        tpmLimit?: number;
      }>
    >(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].model).toBe("qwen3.6-plus");
    expect(data[0].rpmUsage).toBeTypeOf("number");
    expect(data[0].rpmLimit).toBeTypeOf("number");
    expect(data[0].tpmUsage).toBeTypeOf("number");
    expect(data[0].tpmLimit).toBeTypeOf("number");
  });

  test("quota check 状态列显示 Normal/Near limit/Rate Limited 之一", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "check",
      "--model",
      "qwen3.6-plus",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    const hasStatus =
      stdout.includes("Normal") || stdout.includes("Near limit") || stdout.includes("Rate Limited");
    expect(hasStatus).toBe(true);
  });

  test("quota history --dry-run --page 2 --page-size 20", async () => {
    const { stdout, stderr, exitCode } = await runCli([
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
