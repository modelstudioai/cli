import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

describe("e2e: advisor recommend", () => {
  test("advisor shows subcommand groups and exits successfully", async () => {
    const { stdout, stderr, exitCode } = await runCli(["advisor"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/advisor|recommend/i);
  });

  test("advisor recommend --help exits successfully", async () => {
    const { stderr, exitCode } = await runCli(["advisor", "recommend", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recommend|--message|dry-run/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: advisor recommend (DashScope)", () => {
  test("advisor recommend without --message errors as usage error (2)", async () => {
    const { stdout, stderr, exitCode } = await runCli(["advisor", "recommend", "--quiet"]);
    expect(exitCode).toBe(2);
    expect(`${stdout}\n${stderr}`).toMatch(/--message|Usage:/i);
  });

  test("advisor recommend --dry-run outputs intent analysis and candidates", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "I want to build a customer service bot that understands images",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      userInput?: string;
      intent?: { requiredCapabilities?: string[]; inputModality?: string[] };
      candidateCount?: number;
      candidates?: Array<{ model?: string; score?: number }>;
    }>(stdout);
    expect(data.userInput).toBe("I want to build a customer service bot that understands images");
    expect(data.intent?.requiredCapabilities).toContain("VU");
    expect(data.intent?.inputModality).toContain("Image");
    expect(data.candidateCount).toBeGreaterThan(0);
    expect(data.candidates?.[0]?.model).toBeDefined();
    expect(data.candidates?.[0]?.score).toBeGreaterThan(0);
  }, 60_000);

  test("advisor recommend full flow returns results", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--message",
      "low-cost high-concurrency online customer service",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { taskSummary?: string };
      result?: {
        type?: string;
        recommendations?: Array<{
          model?: string;
          name?: string;
          reason?: string;
        }>;
      };
      candidates?: number;
    }>(stdout);
    expect(data.result?.type).toBe("single");
    expect(data.result?.recommendations?.length).toBeGreaterThan(0);
    expect(data.result?.recommendations?.[0]?.model).toBeDefined();
    expect(data.result?.recommendations?.[0]?.reason).toBeDefined();
  }, 120_000);

  // ---- Model preference: positive cases ----

  test("scoped preference — intent contains modelPreference.mode=scoped when family is specified", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "Which model in the deepseek family is best for fast reasoning?",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { modelPreference?: { mode?: string; targets?: string[] } };
    }>(stdout);
    expect(data.intent?.modelPreference?.mode).toBe("scoped");
    expect(data.intent?.modelPreference?.targets?.length).toBeGreaterThan(0);
    expect(
      data.intent?.modelPreference?.targets?.some((target) =>
        target.toLowerCase().includes("deepseek"),
      ),
    ).toBe(true);
  }, 60_000);

  test("comparison preference — intent contains modelPreference.mode=comparison when comparing models", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "Which is better for code generation, qwen-max or deepseek-v3?",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { modelPreference?: { mode?: string; targets?: string[] } };
    }>(stdout);
    expect(data.intent?.modelPreference?.mode).toBe("comparison");
    expect(data.intent?.modelPreference?.targets?.length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  test("excludes preference — intent detects modelPreference when excluding models", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "Not qwen, recommend a model suitable for text generation",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: {
        modelPreference?: { mode?: string; excludes?: string[]; targets?: string[] };
      };
    }>(stdout);
    const pref = data.intent?.modelPreference;
    expect(pref).toBeDefined();
    const hasExcludes =
      (pref?.excludes?.length ?? 0) > 0 ||
      (pref?.mode !== "unconstrained" && pref?.mode !== undefined);
    expect(hasExcludes).toBe(true);
  }, 60_000);

  // ---- Model preference: negative cases ----

  test("no preference — intent has no modelPreference or mode=unconstrained for generic queries", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "I want to build a customer service bot that understands images",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { modelPreference?: { mode?: string } };
    }>(stdout);
    const mode = data.intent?.modelPreference?.mode;
    expect(mode === undefined || mode === "unconstrained").toBe(true);
  }, 60_000);
});
