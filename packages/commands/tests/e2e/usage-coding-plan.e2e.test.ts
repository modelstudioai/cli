import { describe, expect, test } from "vite-plus/test";
import {
  isConsoleAuthFailure,
  isConsoleE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { USAGE_ROUTES } from "./topic-routes.ts";

describe("e2e: usage coding-plan", () => {
  test("usage coding-plan --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(USAGE_ROUTES, [
      "usage",
      "coding-plan",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/Coding Plan|quota/i);
  });

  test("usage coding-plan --help 包含 --output json 示例", async () => {
    const { stderr, exitCode } = await runCommandHelp(USAGE_ROUTES, [
      "usage",
      "coding-plan",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("bl usage coding-plan --output json");
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: usage coding-plan（Console）", () => {
  test("usage coding-plan --dry-run 输出网关请求计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "coding-plan",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { queryCodingPlanInstanceInfoRequest?: Record<string, unknown> };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2");
    expect(data.data?.queryCodingPlanInstanceInfoRequest).toEqual({
      commodityCode: "sfm_codingplan_public_cn",
      onlyLatestOne: true,
    });
  });

  test("usage coding-plan --output json 返回窗口结构", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, ["usage", "coding-plan", "--output", "json"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{
      per5Hour?: { percentage?: number };
      perWeek?: { percentage?: number };
      perBillMonth?: { percentage?: number };
    }>(result.stdout);
    // 无有效订阅返回 {}；有订阅时三个窗口必须存在
    if (Object.keys(data).length > 0) {
      expect(data.per5Hour).toBeTypeOf("object");
      expect(data.perWeek).toBeTypeOf("object");
      expect(data.perBillMonth).toBeTypeOf("object");
    }
  });

  test("usage coding-plan 默认渲染生成时间与额度窗口或无订阅提示", async () => {
    const result = await runCommandE2e(USAGE_ROUTES, ["usage", "coding-plan"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    if (result.stdout.includes("No active Coding Plan subscription found.")) return;
    expect(result.stdout).toContain("Generated at:");
    expect(result.stdout).toContain("5-hour quota");
    expect(result.stdout).toContain("1-week quota");
    expect(result.stdout).toContain("Monthly quota");
  });
});
