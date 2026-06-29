import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

/**
 * Text chat：help / 分组不依赖密钥；对话需 DashScope。
 */

describe("e2e: text chat", () => {
  test("text 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["text"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/text|chat/i);
  });

  test("text chat --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["text", "chat", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/chat|--message|model|stream/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: text chat（DashScope）", () => {
  test("text chat 缺少 --message 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "text",
      "chat",
      "--model",
      "qwen3.7-max",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--message|Usage:/i);
  });

  test("text chat --dry-run 仅输出 request 且不调对话接口", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "text",
      "chat",
      "--dry-run",
      "--model",
      "qwen3.7-max",
      "--message",
      "干跑",
      "--max-tokens",
      "8",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: { model?: string; messages?: Array<{ content?: string }> };
    }>(stdout);
    expect(data.request?.model).toBe("qwen3.7-max");
    expect(data.request?.messages?.some((m) => m.content === "干跑")).toBe(true);
  });

  test("【qwen3.7-max】文本对话", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "text",
      "chat",
      "--model",
      "qwen3.7-max",
      "--message",
      "只回复一个字：好",
      "--max-tokens",
      "32",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ choices?: Array<{ message?: { content?: string } }> }>(stdout);
    const text = data.choices?.[0]?.message?.content ?? "";
    expect(text.length).toBeGreaterThan(0);
  }, 120_000);
});
