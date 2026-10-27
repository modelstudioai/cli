import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { ADVISOR_ROUTES } from "./topic-routes.ts";

describe("e2e: advisor recommend", () => {
  test("advisor recommend --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandHelp(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recommend|--message/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: advisor recommend (DashScope)", () => {
  test("advisor recommend without --message errors as usage error (2)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(`${stdout}\n${stderr}`).toMatch(/--message|Usage:/i);
  });

  test("advisor recommend full flow returns results in the legacy JSON contract", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--message",
      "low-cost high-concurrency online customer service",
      "--output",
      "json",
      "--no-agent",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { taskSummary?: string; requiredCapabilities?: string[] };
      result?: {
        type?: string;
        recommendations?: Array<{
          model?: string;
          name?: string;
          reason?: string;
          highlights?: string[];
        }>;
      };
      candidates?: number;
    }>(stdout);
    // Legacy contract: top-level { intent, result, candidates }
    expect(data.intent?.taskSummary).toBeDefined();
    expect(data.result?.type).toBe("single");
    expect(data.result?.recommendations?.length).toBeGreaterThan(0);
    expect(data.result?.recommendations?.[0]?.model).toBeDefined();
    expect(data.result?.recommendations?.[0]?.reason).toBeDefined();
    expect(data.result?.recommendations?.[0]?.highlights?.length).toBeGreaterThan(0);
    expect(typeof data.candidates).toBe("number");
  }, 120_000);

  test("advisor recommend model comparison query returns recommendations", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--message",
      "qwen-max 和 deepseek-v3 哪个好",
      "--output",
      "json",
      "--no-agent",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      result?: {
        type?: string;
        recommendations?: Array<{ model?: string; reason?: string }>;
      };
    }>(stdout);
    expect(data.result?.recommendations?.length).toBeGreaterThan(0);
    expect(data.result?.recommendations?.[0]?.model).toBeDefined();
  }, 120_000);

  test("advisor recommend --top limits single-result recommendations", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--message",
      "general text generation",
      "--output",
      "json",
      "--no-agent",
      "--top",
      "2",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      result?: { recommendations?: unknown[] };
    }>(stdout);
    expect(data.result?.recommendations?.length).toBeLessThanOrEqual(2);
  }, 120_000);
});
