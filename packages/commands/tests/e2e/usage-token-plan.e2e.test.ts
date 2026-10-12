import { describe, expect, test } from "vite-plus/test";
import {
  isConsoleAuthFailure,
  isConsoleE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { USAGE_ROUTES } from "./topic-routes.ts";

describe("e2e: usage token-plan", () => {
  test("usage token-plan --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(USAGE_ROUTES, [
      "usage",
      "token-plan",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/Token Plan|quota/i);
  });

  test("usage token-plan --help 包含 --output json 示例", async () => {
    const { stderr, exitCode } = await runCommandHelp(USAGE_ROUTES, [
      "usage",
      "token-plan",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl usage token-plan --output json");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: usage token-plan（Console）", () => {
  test("usage token-plan --dry-run 输出网关请求计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "token-plan",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ api?: string; data?: Record<string, unknown> }>(stdout);
    expect(data.api).toBe("zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage");
    expect(data.data).toEqual({});
  });

  test("usage token-plan --output json 返回可用的额度字段", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, ["usage", "token-plan", "--output", "json"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{
      per1MonthPercentage?: number;
      per1MonthResetTime?: number;
    }>(result.stdout);
    const fields = [data.per1MonthPercentage, data.per1MonthResetTime];
    for (const field of fields) {
      if (field !== undefined) expect(field).toBeTypeOf("number");
    }
  });

  test("usage token-plan 默认渲染生成时间与月额度窗口", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, ["usage", "token-plan"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Generated at:");
    expect(result.stdout).toContain("Monthly quota");
  });
});
