import { describe, expect, test } from "vite-plus/test";
import {
  isConsoleAuthFailure,
  isConsoleE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { TOKEN_PLAN_ROUTES } from "./topic-routes.ts";

describe("e2e: token-plan", () => {
  test("token-plan help shows centralized OpenAPI auth flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(TOKEN_PLAN_ROUTES, [
      "token-plan",
      "list-seats",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--access-key-id/);
    expect(stderr).toMatch(/--access-key-secret/);
  });

  test("token-plan dry-run does not require OpenAPI AK/SK", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      TOKEN_PLAN_ROUTES,
      ["token-plan", "list-seats", "--dry-run", "--output", "json"],
      {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string; query?: Record<string, unknown> }>(stdout);
    expect(data.endpoint).toContain("/tokenplan/subscription/seat-detail");
    expect(data.query).toBeDefined();
  });

  test("token-plan non-dry-run requires OpenAPI AK/SK", async () => {
    const configDir = makeE2eOutputDir("token-plan-missing-openapi");
    const { stderr, exitCode } = await runCommandE2e(
      TOKEN_PLAN_ROUTES,
      ["token-plan", "list-seats"],
      {
        BAILIAN_CONFIG_DIR: configDir,
        ALIBABA_CLOUD_ACCESS_KEY_ID: "",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/OpenAPI AK\/SK|access-key-id|ALIBABA_CLOUD_ACCESS_KEY_ID/);
  });

  test("token-plan partial OpenAPI env reports AK/SK hint without API key onboarding", async () => {
    const configDir = makeE2eOutputDir("token-plan-partial-openapi-env");
    const { stderr, exitCode } = await runCommandE2e(
      TOKEN_PLAN_ROUTES,
      ["token-plan", "list-seats"],
      {
        BAILIAN_CONFIG_DIR: configDir,
        ALIBABA_CLOUD_ACCESS_KEY_ID: "ak-e2e-placeholder",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Incomplete OpenAPI AK\/SK/);
    expect(stderr).toMatch(/ALIBABA_CLOUD_ACCESS_KEY_ID/);
    expect(stderr).not.toMatch(/auth login --api-key/);
  });

  test("token-plan harness-quota help 展示 --type 与 console 鉴权域 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(TOKEN_PLAN_ROUTES, [
      "token-plan",
      "harness-quota",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--type <official_tool\|infrastructure>/);
    expect(stderr).toMatch(/--console-region/);
    expect(stderr).not.toMatch(/--access-key-id/);
  });
});

describe.skipIf(!isConsoleE2EReady())("e2e: token-plan harness-quota（Console）", () => {
  test("harness-quota --dry-run 输出两个网关请求计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(TOKEN_PLAN_ROUTES, [
      "token-plan",
      "harness-quota",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      requests?: Array<{ api?: string; data?: Record<string, unknown> }>;
    }>(stdout);
    expect(data.requests?.[0]?.api).toBe("zeldaEasy.broadscope-bailian.token-plan.detail");
    expect(data.requests?.[1]?.api).toBe(
      "zeldaEasy.bailian-commerce.tokenPlan.queryTokenPlanEquityInfo",
    );
    expect(data.requests?.[0]?.data).toEqual({});
  });

  test("harness-quota --type 透传给 harness 列表接口", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(TOKEN_PLAN_ROUTES, [
      "token-plan",
      "harness-quota",
      "--type",
      "official_tool",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ requests?: Array<{ data?: Record<string, unknown> }> }>(stdout);
    expect(data.requests?.[0]?.data).toEqual({ type: "official_tool" });
  });

  test("harness-quota --output json 返回权益额度条目", async () => {
    const result = await runCommandE2e(TOKEN_PLAN_ROUTES, [
      "token-plan",
      "harness-quota",
      "--output",
      "json",
    ]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{
      generatedAt?: number;
      items?: Array<{
        planCode?: string;
        status?: string;
        totalQuota?: number;
        availableQuota?: number;
        usedQuota?: number;
        usedPercent?: number;
      }>;
    }>(result.stdout);
    expect(Array.isArray(data.items)).toBe(true);
    for (const item of data.items ?? []) {
      expect(item.planCode).toBeTypeOf("string");
      expect(["issued", "issuing"]).toContain(item.status);
      const numbers = [item.totalQuota, item.availableQuota, item.usedQuota, item.usedPercent];
      for (const value of numbers) {
        if (value !== undefined) expect(value).toBeTypeOf("number");
      }
    }
  });

  test("harness-quota 默认渲染额度框或空态文案", async () => {
    const result = await runCommandE2e(TOKEN_PLAN_ROUTES, ["token-plan", "harness-quota"]);
    if (isConsoleAuthFailure(result)) return;
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /Token Plan Harness Quota|No harness with entitlement quota found/,
    );
  });
});
