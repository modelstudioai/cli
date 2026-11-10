import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { TEXT_CHAT_ROUTES } from "./topic-routes.ts";

let isolatedDirectory: string;
const servers: Server[] = [];

beforeEach(() => {
  isolatedDirectory = mkdtempSync(join(tmpdir(), "bl-text-prime-e2e-"));
  writeFileSync(join(isolatedDirectory, "config.json"), "{}");
});

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
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

async function startChatServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
  return { origin: `http://127.0.0.1:${address.port}` };
}

/**
 * Text chat：help / 分组不依赖密钥；对话需 DashScope。
 */

describe("e2e: text chat", () => {
  test("text chat --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(TEXT_CHAT_ROUTES, ["text", "chat", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--api\s+<chat\|responses>/i);
    expect(stderr).toMatch(/--enable-search/i);
    expect(stderr).toMatch(/--enable-thinking\s+\[true\|false\]/i);
    expect(stderr).toMatch(/bare flag means true|裸参数表示 true/i);
    expect(stderr).toMatch(/--enable-thinking false/i);
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

  test("text chat 在 Responses 模式拒绝 --enable-search", async () => {
    const { stderr, exitCode } = await runCommandInProcess(TEXT_CHAT_ROUTES, [
      "text",
      "chat",
      "--api",
      "responses",
      "--message",
      "hello",
      "--enable-search",
      "true",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/enable-search.*Responses/i);
  });

  test("text chat --dry-run 透传 --enable-search true/false 到请求体", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--dry-run",
        "--enable-search",
        "true",
        "--message",
        "hello",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "" },
    );
    expect(exitCode, stderr).toBe(0);
    const enabled = parseStdoutJson<{ request?: { enable_search?: boolean } }>(stdout);
    expect(enabled.request?.enable_search).toBe(true);

    const {
      stdout: disabledStdout,
      stderr: disabledStderr,
      exitCode: disabledExit,
    } = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--dry-run",
        "--enable-search",
        "false",
        "--message",
        "hello",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "" },
    );
    expect(disabledExit, disabledStderr).toBe(0);
    const disabled = parseStdoutJson<{ request?: { enable_search?: boolean } }>(disabledStdout);
    expect(disabled.request?.enable_search).toBe(false);
  });

  test.each([
    { name: "omitted", thinkingArgs: [], expected: undefined, expectedBudget: undefined },
    { name: "bare", thinkingArgs: ["--enable-thinking"], expected: true, expectedBudget: 32 },
    {
      name: "explicit true",
      thinkingArgs: ["--enable-thinking=true"],
      expected: true,
      expectedBudget: 32,
    },
    {
      name: "explicit false",
      thinkingArgs: ["--enable-thinking", "false"],
      expected: false,
      expectedBudget: undefined,
    },
  ])(
    "text chat --dry-run keeps enable_thinking tri-state: $name",
    async ({ thinkingArgs, expected, expectedBudget }) => {
      const { stdout, stderr, exitCode } = await runCommandInProcess(
        TEXT_CHAT_ROUTES,
        [
          "text",
          "chat",
          "--dry-run",
          "--model",
          "qwen-plus",
          "--message",
          "hello",
          ...thinkingArgs,
          "--thinking-budget",
          "32",
          "--output",
          "json",
        ],
        { DASHSCOPE_API_KEY: "" },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        request?: { enable_thinking?: boolean; thinking_budget?: number };
      }>(stdout);
      expect(data.request?.enable_thinking).toBe(expected);
      expect(data.request?.thinking_budget).toBe(expectedBudget);
    },
  );

  test("text chat actual local request preserves thinking tri-state", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const { origin } = await startChatServer((request, response) => {
      let rawBody = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        rawBody += chunk;
      });
      request.on("end", () => {
        requestBodies.push(JSON.parse(rawBody) as Record<string, unknown>);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
      });
    });

    for (const thinkingArgs of [[], ["--enable-thinking"], ["--enable-thinking=false"]]) {
      const result = await runCommandInProcess(
        TEXT_CHAT_ROUTES,
        [
          "text",
          "chat",
          "--base-url",
          origin,
          "--api-key",
          "sk-local-test",
          "--model",
          "fixture-model",
          "--message",
          "hello",
          ...thinkingArgs,
          "--thinking-budget",
          "32",
          "--output",
          "json",
        ],
        {},
      );
      expect(result.exitCode, result.stderr).toBe(0);
    }

    expect(requestBodies).toHaveLength(3);
    expect(requestBodies[0]).not.toHaveProperty("enable_thinking");
    expect(requestBodies[0]).not.toHaveProperty("thinking_budget");
    expect(requestBodies[1]).toMatchObject({ enable_thinking: true, thinking_budget: 32 });
    expect(requestBodies[2]).toMatchObject({ enable_thinking: false });
    expect(requestBodies[2]).not.toHaveProperty("thinking_budget");
  });

  test("text chat leaves unsupported-model thinking errors unchanged", async () => {
    const { origin } = await startChatServer((request, response) => {
      request.resume();
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          code: "InvalidParameter",
          message: "fixture model does not support thinking",
          request_id: "request-thinking-test",
        }),
      );
    });
    const result = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--base-url",
        origin,
        "--api-key",
        "sk-local-test",
        "--model",
        "fixture-model",
        "--message",
        "hello",
        "--enable-thinking",
        "--output",
        "json",
      ],
      {},
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("fixture model does not support thinking");
    expect(result.stderr).toContain("InvalidParameter");
    expect(result.stderr).toContain("request-thinking-test");
  });

  test("text chat --dry-run 未传 --enable-search 时请求体不含 enable_search", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--dry-run",
        "--model",
        "qwen-max",
        "--message",
        "hello",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: Record<string, unknown> }>(stdout);
    expect(data.request).not.toHaveProperty("enable_search");
  });

  test("text chat --dry-run 白名单模型 qwen3.8-max 默认开启 enable_search", async () => {
    // 未显式传 --model 时兼容默认模型也是 qwen3.8-max，同样命中白名单。
    const { stdout, stderr, exitCode } = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--dry-run",
        "--model",
        "qwen3.8-max",
        "--message",
        "hello",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { enable_search?: boolean } }>(stdout);
    expect(data.request?.enable_search).toBe(true);

    const { stdout: implicitStdout, exitCode: implicitExit } = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      ["text", "chat", "--dry-run", "--message", "hello", "--output", "json"],
      { DASHSCOPE_API_KEY: "" },
    );
    expect(implicitExit).toBe(0);
    const implicit = parseStdoutJson<{ request?: { enable_search?: boolean } }>(implicitStdout);
    expect(implicit.request?.enable_search).toBe(true);
  });

  test("text chat --dry-run 白名单模型可用 --enable-search false 显式关闭", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--dry-run",
        "--model",
        "qwen3.8-max",
        "--enable-search",
        "false",
        "--message",
        "hello",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { enable_search?: boolean } }>(stdout);
    expect(data.request?.enable_search).toBe(false);
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
