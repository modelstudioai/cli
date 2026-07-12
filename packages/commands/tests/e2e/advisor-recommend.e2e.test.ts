import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { ADVISOR_ROUTES } from "./topic-routes.ts";

describe("e2e: advisor recommend", () => {
  test("advisor recommend --help exits successfully", async () => {
    const { stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recommend|--message|dry-run/i);
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

  test("advisor recommend --dry-run outputs intent analysis and candidates", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
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
      intent?: {
        requiredCapabilities?: string[];
        inputModality?: string[];
        semanticQuery?: string;
      };
      candidateCount?: number;
      candidates?: Array<{
        model?: string;
        score?: number;
        hardScore?: number;
        softScore?: number;
      }>;
    }>(stdout);
    expect(data.userInput).toBe("I want to build a customer service bot that understands images");
    // Intent should produce some capabilities (model decides which are most relevant)
    expect(data.intent?.requiredCapabilities?.length).toBeGreaterThan(0);
    expect(data.candidateCount).toBeGreaterThan(0);
    expect(data.candidates?.[0]?.model).toBeDefined();
    expect(data.candidates?.[0]?.score).toBeGreaterThan(0);
    // Dual-track fusion: hardScore and softScore should be present and in [0, 1]
    const first = data.candidates?.[0];
    expect(first?.hardScore).toBeGreaterThanOrEqual(0);
    expect(first?.hardScore).toBeLessThanOrEqual(1);
    expect(first?.softScore).toBeGreaterThanOrEqual(0);
    expect(first?.softScore).toBeLessThanOrEqual(1);
  }, 60_000);

  test("advisor recommend full flow returns results", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--message",
      "low-cost high-concurrency online customer service",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { taskSummary?: string; semanticQuery?: string };
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
    expect(data.result?.type).toBe("single");
    expect(data.result?.recommendations?.length).toBeGreaterThan(0);
    expect(data.result?.recommendations?.[0]?.model).toBeDefined();
    expect(data.result?.recommendations?.[0]?.reason).toBeDefined();
    // Enriched output should include highlights
    expect(data.result?.recommendations?.[0]?.highlights?.length).toBeGreaterThan(0);
  }, 120_000);

  // ---- Mode coverage: all 4 modes ----

  test("mode: scoped — family-scoped query sets mode=scoped with targets", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
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
    const pref = data.intent?.modelPreference;
    expect(pref?.mode).toBe("scoped");
    expect(pref?.targets?.length).toBeGreaterThan(0);
    // Should contain "deepseek" (case-insensitive substring)
    expect(pref?.targets?.some((t) => t.toLowerCase().includes("deepseek"))).toBe(true);
  }, 60_000);

  test("mode: comparison — comparing two models sets mode=comparison with both targets", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "Compare qwen-max and deepseek-v3 for legal contract review, high precision required",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { modelPreference?: { mode?: string; targets?: string[] } };
    }>(stdout);
    const pref = data.intent?.modelPreference;
    expect(pref?.mode).toBe("comparison");
    expect(pref?.targets?.length).toBeGreaterThanOrEqual(2);
    const targetsLower = pref?.targets?.map((t) => t.toLowerCase()) ?? [];
    expect(targetsLower.some((t) => t.includes("qwen"))).toBe(true);
    expect(targetsLower.some((t) => t.includes("deepseek"))).toBe(true);
  }, 60_000);

  test("mode: alternative — reference model query sets mode=alternative with target", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "Something like qwen-max but cheaper, for text summarization",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: { modelPreference?: { mode?: string; targets?: string[] } };
    }>(stdout);
    const pref = data.intent?.modelPreference;
    expect(pref?.mode).toBe("alternative");
    expect(pref?.targets?.length).toBeGreaterThan(0);
    expect(pref?.targets?.some((t) => t.toLowerCase().includes("qwen"))).toBe(true);
  }, 60_000);

  test("mode: excludes — excluding a family populates excludes array", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "Recommend a model for text generation, but not qwen",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      intent?: {
        modelPreference?: {
          mode?: string;
          excludes?: string[];
        };
      };
    }>(stdout);
    const pref = data.intent?.modelPreference;
    expect(pref?.excludes?.length).toBeGreaterThan(0);
    expect(pref?.excludes?.some((e) => e.toLowerCase().includes("qwen"))).toBe(true);
  }, 60_000);

  test("mode: unconstrained — generic query has no modelPreference", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(ADVISOR_ROUTES, [
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
