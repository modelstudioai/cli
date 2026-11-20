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
import { TEXT_CHAT_ROUTES, TEXT_TRANSLATE_ROUTES } from "./topic-routes.ts";

let isolatedDirectory: string;
const servers: Server[] = [];

beforeEach(() => {
  isolatedDirectory = mkdtempSync(join(tmpdir(), "bl-text-mt-e2e-"));
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

describe("e2e: text translate (Qwen-MT)", () => {
  test("help lists translation flags bilingually", async () => {
    const { stderr, exitCode } = await runCommandHelp(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--source-lang/);
    expect(stderr).toMatch(/--target-lang/);
    expect(stderr).toMatch(/Translation target language|翻译目标语言/);
    expect(stderr).toMatch(/--term/);
    expect(stderr).toMatch(/--domain-hint/);
    expect(stderr).toMatch(/qwen-mt-flash/);
  });

  test("text chat help points to text translate and has no MT flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(TEXT_CHAT_ROUTES, ["text", "chat", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/text translate/);
    expect(stderr).not.toMatch(/--source-lang/);
    expect(stderr).not.toMatch(/--target-lang/);
  });

  test("unsupported models → 2 (generic, image/uni, turbo)", async () => {
    for (const model of ["qwen3.8-max", "qwen-mt-image", "qwen-mt-uni", "qwen-mt-turbo"]) {
      const { stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
        "text",
        "translate",
        "--model",
        model,
        "--message",
        "hello",
        "--target-lang",
        "English",
        "--dry-run",
        "--quiet",
      ]);
      expect(exitCode, `${model}: ${stderr}`).toBe(2);
      expect(stderr).toMatch(/Unsupported model|不支持的模型/i);
    }
  });

  test("dated flash/plus suffixes are accepted in dry-run", async () => {
    const flash = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--model",
      "qwen-mt-flash-2025-01-01",
      "--message",
      "hello",
      "--target-lang",
      "English",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(flash.exitCode, flash.stderr).toBe(0);
    expect(parseStdoutJson<{ request?: { model?: string } }>(flash.stdout).request?.model).toBe(
      "qwen-mt-flash-2025-01-01",
    );

    const plus = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--model",
      "qwen-mt-plus-2025-01-01",
      "--message",
      "hello",
      "--target-lang",
      "English",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(plus.exitCode, plus.stderr).toBe(0);
    expect(parseStdoutJson<{ request?: { model?: string } }>(plus.stdout).request?.model).toBe(
      "qwen-mt-plus-2025-01-01",
    );
  });

  test("missing target-lang → 2", async () => {
    const { stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--message",
      "hello",
      "--dry-run",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/target-lang/i);
  });

  test("rejects blank target, auto target, bad term", async () => {
    const blankTarget = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--message",
      "hello",
      "--target-lang",
      "",
      "--dry-run",
      "--quiet",
    ]);
    expect(blankTarget.exitCode).toBe(2);

    const autoTarget = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--message",
      "hello",
      "--target-lang",
      "auto",
      "--dry-run",
      "--quiet",
    ]);
    expect(autoTarget.exitCode).toBe(2);
    expect(autoTarget.stderr).toMatch(/auto/i);

    const badTerm = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--message",
      "hello",
      "--target-lang",
      "English",
      "--term",
      "=Bailian",
      "--dry-run",
      "--quiet",
    ]);
    expect(badTerm.exitCode).toBe(2);
    expect(badTerm.stderr).toMatch(/--term/i);
  });

  test("rejects system/assistant roles", async () => {
    const withSystem = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--message",
      "system:You are a translator",
      "--message",
      "hello",
      "--target-lang",
      "English",
      "--dry-run",
      "--quiet",
    ]);
    expect(withSystem.exitCode).toBe(2);
    expect(withSystem.stderr).toMatch(/user|system/i);
  });

  test("rejects empty messages-file and empty message content → 2", async () => {
    const emptyFile = join(isolatedDirectory, "empty-messages.json");
    writeFileSync(emptyFile, "[]");

    const emptyArray = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--messages-file",
      emptyFile,
      "--target-lang",
      "English",
      "--dry-run",
      "--quiet",
    ]);
    expect(emptyArray.exitCode).toBe(2);
    expect(emptyArray.stderr).toMatch(/at least one|至少需要一条/i);

    const emptyContent = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--message",
      "",
      "--target-lang",
      "English",
      "--dry-run",
      "--quiet",
    ]);
    expect(emptyContent.exitCode).toBe(2);
    expect(emptyContent.stderr).toMatch(/non-empty|非空/i);
  });

  test("dry-run injects top-level translation_options without extra_body", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--model",
      "qwen-mt-flash",
      "--message",
      "欢迎使用百炼。",
      "--source-lang",
      "Chinese",
      "--target-lang",
      "English",
      "--term",
      "百炼=Bailian",
      "--term",
      "模型=model",
      "--domain-hint",
      "product documentation",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        model?: string;
        translation_options?: {
          source_lang?: string;
          target_lang?: string;
          terms?: Array<{ source: string; target: string }>;
          domains?: string;
        };
        extra_body?: unknown;
        enable_search?: boolean;
      };
    }>(stdout);
    expect(body.request?.model).toBe("qwen-mt-flash");
    expect(body.request?.translation_options).toEqual({
      source_lang: "Chinese",
      target_lang: "English",
      terms: [
        { source: "百炼", target: "Bailian" },
        { source: "模型", target: "model" },
      ],
      domains: "product documentation",
    });
    expect(body.request?.extra_body).toBeUndefined();
    expect(body.request?.enable_search).toBeUndefined();
  });

  test("default model is qwen-mt-flash and source-lang defaults to auto", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--message",
      "hello",
      "--target-lang",
      "Chinese",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: { model?: string; translation_options?: { source_lang?: string } };
    }>(stdout);
    expect(body.request?.model).toBe("qwen-mt-flash");
    expect(body.request?.translation_options?.source_lang).toBe("auto");
  });

  test("ordinary chat without translation flags stays unchanged", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      ["text", "chat", "--message", "hello", "--dry-run", "--output", "json"],
      { DASHSCOPE_API_KEY: "" },
    );
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ request?: Record<string, unknown> }>(stdout);
    expect(body.request?.translation_options).toBeUndefined();
  });

  test("loopback non-stream returns translation text", async () => {
    const { origin } = await startChatServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "chatcmpl-mt",
          object: "chat.completion",
          created: 1,
          model: "qwen-mt-flash",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Welcome to Bailian." },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });

    const { stdout, stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--message",
      "欢迎使用百炼。",
      "--target-lang",
      "English",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      choices?: Array<{ message?: { content?: string } }>;
    }>(stdout);
    expect(body.choices?.[0]?.message?.content).toBe("Welcome to Bailian.");
  });

  test("loopback SSE snapshot mode for qwen-mt-plus family does not duplicate", async () => {
    for (const model of ["qwen-mt-plus", "qwen-mt-plus-2025-01-01"]) {
      const { origin } = await startChatServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        const frames = ["H", "Hello", "Hello world"];
        for (const content of frames) {
          response.write(
            `data: ${JSON.stringify({
              choices: [{ delta: { content }, finish_reason: null }],
            })}\n\n`,
          );
        }
        response.write(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: "stop" }],
          })}\n\n`,
        );
        response.write("data: [DONE]\n\n");
        response.end();
      });

      const { stdout, stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
        "text",
        "translate",
        "--base-url",
        origin,
        "--api-key",
        "sk-test",
        "--model",
        model,
        "--message",
        "欢迎使用百炼。",
        "--target-lang",
        "English",
        "--stream",
        "--output",
        "json",
      ]);
      expect(exitCode, `${model}: ${stderr}`).toBe(0);
      const body = parseStdoutJson<{ content?: string }>(stdout);
      expect(body.content, model).toBe("Hello world");
    }
  });

  test("loopback SSE delta mode for flash/lite appends fragments once", async () => {
    for (const model of ["qwen-mt-flash", "qwen-mt-lite", "qwen-mt-flash-2025-01-01"]) {
      const { origin } = await startChatServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        const frames = ["H", "ello", " world"];
        for (const content of frames) {
          response.write(
            `data: ${JSON.stringify({
              choices: [{ delta: { content }, finish_reason: null }],
            })}\n\n`,
          );
        }
        response.write(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: "stop" }],
          })}\n\n`,
        );
        response.write("data: [DONE]\n\n");
        response.end();
      });

      const { stdout, stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
        "text",
        "translate",
        "--base-url",
        origin,
        "--api-key",
        "sk-test",
        "--model",
        model,
        "--message",
        "欢迎使用百炼。",
        "--target-lang",
        "English",
        "--stream",
        "--output",
        "json",
      ]);
      expect(exitCode, `${model}: ${stderr}`).toBe(0);
      const body = parseStdoutJson<{ content?: string }>(stdout);
      expect(body.content, model).toBe("Hello world");
    }
  });

  test("loopback SSE snapshot in text mode writes each suffix once", async () => {
    const { origin } = await startChatServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const frames = ["H", "Hello", "Hello world"];
      for (const content of frames) {
        response.write(
          `data: ${JSON.stringify({
            choices: [{ delta: { content }, finish_reason: null }],
          })}\n\n`,
        );
      }
      response.write(
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }],
        })}\n\n`,
      );
      response.write("data: [DONE]\n\n");
      response.end();
    });

    const { stdout, stderr, exitCode } = await runCommandInProcess(TEXT_TRANSLATE_ROUTES, [
      "text",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--model",
      "qwen-mt-plus",
      "--message",
      "欢迎使用百炼。",
      "--target-lang",
      "English",
      "--stream",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
    // Streaming writes suffixes; final result uses empty text so only a trailing newline is added.
    expect(stdout).toBe("Hello world\n");
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: text translate live", () => {
  test("qwen-mt-flash with term returns non-empty translation", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      TEXT_TRANSLATE_ROUTES,
      [
        "text",
        "translate",
        "--message",
        "欢迎使用百炼。",
        "--source-lang",
        "Chinese",
        "--target-lang",
        "English",
        "--term",
        "百炼=Bailian",
        "--output",
        "json",
      ],
      {
        BAILIAN_CONFIG_DIR: isolatedDirectory,
        HOME: isolatedDirectory,
        USERPROFILE: isolatedDirectory,
      },
    );
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      choices?: Array<{ message?: { content?: string | null } }>;
    }>(stdout);
    const content = body.choices?.[0]?.message?.content ?? "";
    expect(content.length).toBeGreaterThan(0);
  }, 120_000);
});
