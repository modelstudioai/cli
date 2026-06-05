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
      type?: string;
      recommendations?: Array<{
        model?: string;
        name?: string;
        reason?: string;
      }>;
    }>(stdout);
    expect(data.type).toBe("single");
    expect(data.recommendations?.length).toBeGreaterThan(0);
    expect(data.recommendations?.[0]?.model).toBeDefined();
    expect(data.recommendations?.[0]?.reason).toBeDefined();
  }, 120_000);
});
