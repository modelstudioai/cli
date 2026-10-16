import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { TEXT_CHAT_ROUTES } from "./topic-routes.ts";

let isolatedDirectory: string;

beforeEach(() => {
  isolatedDirectory = mkdtempSync(join(tmpdir(), "bl-text-prime-e2e-"));
  writeFileSync(join(isolatedDirectory, "config.json"), "{}");
});

afterEach(() => {
  rmSync(isolatedDirectory, { recursive: true, force: true });
});

function runIsolatedTextChat(args: string[], envOverrides: NodeJS.ProcessEnv = {}) {
  return runCommandE2e(TEXT_CHAT_ROUTES, args, {
    BAILIAN_CONFIG_DIR: isolatedDirectory,
    HOME: isolatedDirectory,
    USERPROFILE: isolatedDirectory,
    ...envOverrides,
  });
}

const EMPTY_MODEL_ENV = {
  DASHSCOPE_API_KEY: "",
  DASHSCOPE_BASE_URL: "",
  BAILIAN_WORKSPACE_ID: "",
};

/**
 * Text chat：help / 分组不依赖密钥；对话需 DashScope。
 */

describe("e2e: text chat", () => {
  test("text chat --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(TEXT_CHAT_ROUTES, ["text", "chat", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--api\s+<chat\|responses>/i);
    expect(stderr).toMatch(/--prime/i);
    expect(stderr).toMatch(/--workspace-id/i);
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

  test("Prime 模式要求显式 --model", async () => {
    const { stderr, exitCode } = await runIsolatedTextChat(
      ["text", "chat", "--prime", "--message", "hello"],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--prime.*--model/i);
  });

  test("Prime 模式在默认 Base URL 下要求 workspace", async () => {
    const { stderr, exitCode } = await runIsolatedTextChat(
      ["text", "chat", "--prime", "--model", "glm-5.3-prime", "--message", "hello", "--dry-run"],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Workspace ID is required/i);
  });

  test("Prime 模式拒绝 Responses API", async () => {
    const { stderr, exitCode } = await runIsolatedTextChat(
      [
        "text",
        "chat",
        "--prime",
        "--api",
        "responses",
        "--model",
        "glm-5.3-prime",
        "--message",
        "hello",
      ],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--prime.*--api chat/i);
  });

  test("未启用 Prime 时拒绝 --workspace-id", async () => {
    const { stderr, exitCode } = await runIsolatedTextChat(
      ["text", "chat", "--workspace-id", "ws_test", "--message", "hello"],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--workspace-id.*--prime/i);
  });

  test("Prime dry-run 输出 workspace Endpoint 和请求体", async () => {
    const { stdout, stderr, exitCode } = await runIsolatedTextChat(
      [
        "text",
        "chat",
        "--prime",
        "--workspace-id",
        "ws_test",
        "--model",
        "glm-5.3-prime",
        "--message",
        "hello",
        "--dry-run",
        "--output",
        "json",
      ],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string; request?: { model?: string } }>(stdout);
    expect(data.endpoint).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    expect(data.request?.model).toBe("glm-5.3-prime");
  });

  test("Prime dry-run 允许自定义 Base URL 覆盖 workspace Endpoint", async () => {
    const { stdout, stderr, exitCode } = await runIsolatedTextChat(
      [
        "text",
        "chat",
        "--prime",
        "--model",
        "glm-5.3-prime",
        "--message",
        "hello",
        "--base-url",
        "https://example.test",
        "--dry-run",
        "--output",
        "json",
      ],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string }>(stdout);
    expect(data.endpoint).toBe("https://example.test/compatible-mode/v1/chat/completions");
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
