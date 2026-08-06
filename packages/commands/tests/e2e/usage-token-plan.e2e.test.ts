import { describe, expect, test } from "vite-plus/test";
import {
  isConsoleAuthFailure,
  isConsoleE2EReady,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import { USAGE_ROUTES } from "./topic-routes.ts";

describe("e2e: usage token-plan", () => {
  test("usage token-plan --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "token-plan",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--json|--view|Token Plan/i);
  });

  test("usage token-plan 未选择输出形式时退出为用法错误", async () => {
    const { stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "token-plan",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Choose exactly one of --json or --view.");
  });

  test("usage token-plan 同时选择两种输出形式时退出为用法错误", async () => {
    const { stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "token-plan",
      "--json",
      "--view",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Choose exactly one of --json or --view.");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: usage token-plan（Console）", () => {
  test("usage token-plan --json --dry-run 输出网关请求计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "token-plan",
      "--json",
      "--dry-run",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ api?: string; data?: Record<string, unknown> }>(stdout);
    expect(data.api).toBe("zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage");
    expect(data.data).toEqual({});
  });

  test("usage token-plan --json 返回可用的额度字段", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, ["usage", "token-plan", "--json"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{
      per5HourPercentage?: number;
      per5HourResetTime?: number;
      per1WeekPercentage?: number;
      per1WeekResetTime?: number;
    }>(result.stdout);
    const quotas = [
      [data.per5HourPercentage, data.per5HourResetTime],
      [data.per1WeekPercentage, data.per1WeekResetTime],
    ];
    for (const [percentage, resetTime] of quotas) {
      if (percentage === undefined) expect(resetTime).toBeUndefined();
      else if (percentage === 0) expect(resetTime).toBeUndefined();
      else {
        expect(percentage).toBeTypeOf("number");
        expect(resetTime).toBeTypeOf("number");
      }
    }
  });

  test("usage token-plan --view 渲染生成时间与两个额度窗口", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, ["usage", "token-plan", "--view"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Generated at:");
    expect(result.stdout).toContain("5-hour quota");
    expect(result.stdout).toContain("1-week quota");
  });
});
