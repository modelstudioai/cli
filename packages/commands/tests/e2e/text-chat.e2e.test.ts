import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { TEXT_CHAT_ROUTES } from "./topic-routes.ts";

/**
 * Text chat：help / 分组不依赖密钥；对话需 DashScope。
 */

describe("e2e: text chat", () => {
  test("text chat --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(TEXT_CHAT_ROUTES, ["text", "chat", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--api\s+<chat\|responses>/i);
    expect(stderr).toMatch(/chat|--message|model|stream/i);
  });

  test("text chat 拒绝未知的 --api 值", async () => {
    const { stderr, exitCode } = await runCommandE2e(TEXT_CHAT_ROUTES, [
      "text",
      "chat",
      "--api",
      "legacy",
      "--message",
      "hello",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--api|chat.*responses/i);
  });

  test("text chat 在 Responses 模式拒绝 --thinking-budget", async () => {
    const { stderr, exitCode } = await runCommandE2e(TEXT_CHAT_ROUTES, [
      "text",
      "chat",
      "--api",
      "responses",
      "--message",
      "hello",
      "--thinking-budget",
      "8",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/thinking-budget.*Responses/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: text chat（DashScope）", () => {
  test("text chat 缺少 --message 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(TEXT_CHAT_ROUTES, [
      "text",
      "chat",
      "--model",
      "qwen3.8-max",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--message|Usage:/i);
  });

  test("text chat --dry-run 仅输出 request 且不调对话接口", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(TEXT_CHAT_ROUTES, [
      "text",
      "chat",
      "--dry-run",
      "--model",
      "qwen3.8-max",
      "--message",
      "干跑",
      "--max-tokens",
      "8",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: { model?: string; messages?: Array<{ content?: string }> };
    }>(stdout);
    expect(data.request?.model).toBe("qwen3.8-max");
    expect(data.request?.messages?.some((message) => message.content === "干跑")).toBe(true);
  });

  test("text chat --api responses --dry-run 生成 Responses 请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(TEXT_CHAT_ROUTES, [
      "text",
      "chat",
      "--dry-run",
      "--api",
      "responses",
      "--model",
      "qwen3.8-max",
      "--system",
      "system",
      "--message",
      "hello",
      "--max-tokens",
      "8",
      "--tool",
      '{"type":"web_search"}',
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: Record<string, unknown> }>(stdout);
    expect(data.request).toMatchObject({
      model: "qwen3.8-max",
      input: [
        { role: "system", content: "system" },
        { role: "user", content: "hello" },
      ],
      max_output_tokens: 8,
      tools: [{ type: "web_search" }],
    });
    expect(data.request).not.toHaveProperty("messages");
    expect(data.request).not.toHaveProperty("max_tokens");
  });

  test("【qwen3.8-max】文本对话", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(TEXT_CHAT_ROUTES, [
      "text",
      "chat",
      "--model",
      "qwen3.8-max",
      "--message",
      "只回复一个字：好",
      "--max-tokens",
      "32",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ choices?: Array<{ message?: { content?: string } }> }>(stdout);
    const text = data.choices?.[0]?.message?.content ?? "";
    expect(text.length).toBeGreaterThan(0);
  }, 120_000);
});
