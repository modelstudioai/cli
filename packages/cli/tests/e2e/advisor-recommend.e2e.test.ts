import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

describe("e2e: advisor recommend", () => {
  test("advisor 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["advisor"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/advisor|recommend/i);
  });

  test("advisor recommend --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["advisor", "recommend", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recommend|--message|dry-run/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: advisor recommend（DashScope）", () => {
  test("advisor recommend 缺少 --message 时打印帮助并退出 (0)", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/--message|Usage:/i);
  });

  test("advisor recommend --dry-run 输出意图分析和候选列表", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "我想做一个能理解图片的客服机器人",
      "--non-interactive",
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
    expect(data.userInput).toBe("我想做一个能理解图片的客服机器人");
    expect(data.intent?.requiredCapabilities).toContain("VU");
    expect(data.intent?.inputModality).toContain("Image");
    expect(data.candidateCount).toBeGreaterThan(0);
    expect(data.candidates?.[0]?.model).toBeDefined();
    expect(data.candidates?.[0]?.score).toBeGreaterThan(0);
  }, 60_000);

  test("advisor recommend 完整推荐流程返回结果", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--message",
      "低成本高并发的在线客服",
      "--non-interactive",
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

  // ---- 模型偏好：正例 ----

  test("scoped 偏好 — 限定系列时 intent 含 modelPreference.mode=scoped", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "deepseek系列中哪个模型最适合用来进行快速推理",
      "--non-interactive",
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

  test("comparison 偏好 — 对比模型时 intent 含 modelPreference.mode=comparison", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "qwen-max和deepseek-v3哪个更适合做代码生成",
      "--non-interactive",
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

  test("excludes 偏好 — 排除模型时 intent 识别出 modelPreference", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "不要qwen，推荐一个适合文本生成的模型",
      "--non-interactive",
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

  // ---- 模型偏好：反例 ----

  test("无偏好 — 普通需求查询时 intent 不含 modelPreference 或 mode=unconstrained", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "advisor",
      "recommend",
      "--dry-run",
      "--message",
      "我要做一个能理解图片的客服机器人",
      "--non-interactive",
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
