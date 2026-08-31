import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  e2eLabelFromMetaUrl,
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { SPEECH_ROUTES } from "./topic-routes.ts";

/**
 * Speech recognize：help / 分组不依赖密钥；识别流程需媒体 E2E + DashScope。
 */

describe("e2e: speech recognize", () => {
  async function runRecognizeDryRun(args: string[]) {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "recognize",
      ...args,
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    return parseStdoutJson<{
      mode?: string;
      path?: string;
      request?: {
        model?: string;
        parameters?: {
          format?: string;
          language_hints?: string[];
          language?: string;
          vocabulary_id?: string;
        };
        input?: {
          file_url?: string;
          file_urls?: string[];
          messages?: Array<{ content?: Array<{ type?: string }> }>;
        };
      };
    }>(stdout);
  }

  test("speech recognize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_ROUTES, [
      "speech",
      "recognize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recognize|--url|model|audio/i);
  });

  test("Token Plan 未显式传 model 时默认使用 qwen-audio ASR", async () => {
    const configDir = makeE2eOutputDir("speech-recognize-token-plan-default");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        "token-plan": {
          api_key: "sk-sp-e2e-placeholder",
          base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
          default_speech_recognition_model: "qwen-audio-3.0-asr-flash",
        },
      }),
    );

    const { stdout, stderr, exitCode } = await runCommandE2e(
      SPEECH_ROUTES,
      [
        "speech",
        "recognize",
        "--config",
        "token-plan",
        "--url",
        "https://example.com/audio.wav",
        "--dry-run",
        "--output",
        "json",
        "--quiet",
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { model?: string }; mode?: string }>(stdout);
    expect(data.request?.model).toBe("qwen-audio-3.0-asr-flash");
    expect(data.mode).toBe("sync");
  });

  test("speech recognize sync-flash dry-run 走 multimodal-generation", async () => {
    const body = await runRecognizeDryRun([
      "--model",
      "qwen-audio-3.0-asr-flash",
      "--url",
      "https://dashscope.oss-cn-beijing.aliyuncs.com/samples/audio/paraformer/hello_world_female2.wav",
      "--language",
      "en",
      "--vocabulary-id",
      "vocab-e2e",
    ]);
    expect(body.mode).toBe("sync");
    expect(body.path).toBe("/api/v1/services/aigc/multimodal-generation/generation");
    expect(body.request?.model).toBe("qwen-audio-3.0-asr-flash");
    expect(body.request?.parameters?.format).toBe("wav");
    expect(body.request?.parameters?.language_hints).toEqual(["en"]);
    expect(body.request?.parameters?.vocabulary_id).toBe("vocab-e2e");
    expect(body.request?.input?.messages?.[0]?.content?.[0]?.type).toBe("input_audio");
  });

  test("speech recognize qwen3 filetrans dry-run 使用 file_url 与 language", async () => {
    const body = await runRecognizeDryRun([
      "--model",
      "qwen3-asr-flash-filetrans",
      "--url",
      "https://dashscope.oss-cn-beijing.aliyuncs.com/samples/audio/paraformer/hello_world_female2.wav",
      "--language",
      "zh",
    ]);
    expect(body.mode).toBe("async");
    expect(body.path).toBe("/api/v1/services/audio/asr/transcription");
    expect(body.request?.input?.file_url?.startsWith("https://")).toBe(true);
    expect(body.request?.input?.file_urls).toBeUndefined();
    expect(body.request?.parameters?.language).toBe("zh");
    expect(body.request?.parameters?.language_hints).toBeUndefined();
  });

  test("speech recognize realtime 模型报用法错误", async () => {
    // Use --dry-run to skip auth so CI without API keys still hits USAGE(2)
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "recognize",
      "--model",
      "qwen3-asr-flash-realtime",
      "--url",
      "https://example.com/a.wav",
      "--dry-run",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/realtime|WebSocket|unsupported/i);
  });

  test("speech recognize flash 真实请求走 sync endpoint 并落盘 --out", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    let sseHeader: string | undefined;
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requestPath = request.url ?? "";
        requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        sseHeader = request.headers["x-dashscope-sse"] as string | undefined;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            output: { text: "flash recognition works" },
            request_id: "request-146",
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const outDir = makeE2eOutputDir("speech-recognize-flash-sync");
    const outPath = join(outDir, "result.json");

    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "recognize",
        "--model",
        "fun-asr-flash-2026-06-15",
        "--url",
        "https://example.com/sample.wav",
        "--api-key",
        "sk-e2e-placeholder",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--out",
        outPath,
        "--quiet",
      ]);

      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain("flash recognition works");
      expect(requestPath).toBe("/api/v1/services/aigc/multimodal-generation/generation");
      expect(sseHeader).toBe("disable");
      expect(requestBody).toMatchObject({
        model: "fun-asr-flash-2026-06-15",
        parameters: { format: "wav" },
      });
      expect(JSON.parse(readFileSync(outPath, "utf8"))).toMatchObject({
        output: { text: "flash recognition works" },
        request_id: "request-146",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("speech recognize flash 多 --url 在发请求前报用法错误", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "recognize",
      "--model",
      "qwen-audio-3.0-asr-flash",
      "--url",
      "https://example.com/a.wav",
      "--url",
      "https://example.com/b.wav",
      "--dry-run",
      "--quiet",
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/exactly one --url|sync Flash/i);
  });

  test("speech recognize qwen3-filetrans 轮询成功后下载 result.transcription_url", async () => {
    const server = http.createServer((request, response) => {
      const url = request.url ?? "";
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "application/json" });
        if (url.startsWith("/api/v1/services/audio/asr/transcription")) {
          response.end(
            JSON.stringify({
              output: { task_id: "task-qwen3", task_status: "PENDING" },
              request_id: "req-submit",
            }),
          );
          return;
        }
        if (url.startsWith("/api/v1/tasks/")) {
          const address = server.address() as AddressInfo;
          response.end(
            JSON.stringify({
              output: {
                task_id: "task-qwen3",
                task_status: "SUCCEEDED",
                result: {
                  transcription_url: `http://127.0.0.1:${address.port}/transcription.json`,
                },
              },
              request_id: "req-poll",
            }),
          );
          return;
        }
        if (url.startsWith("/transcription.json")) {
          response.end(
            JSON.stringify({
              file_url: "https://example.com/a.wav",
              transcripts: [{ text: "你好世界", sentences: [{ text: "你好世界" }] }],
            }),
          );
          return;
        }
        response.writeHead(404);
        response.end(JSON.stringify({ message: `unexpected path: ${url}` }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const outDir = makeE2eOutputDir("speech-recognize-qwen3-filetrans");
    const outPath = join(outDir, "result.json");

    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "recognize",
        "--model",
        "qwen3-asr-flash-filetrans",
        "--url",
        "https://example.com/a.wav",
        "--language",
        "zh",
        "--api-key",
        "sk-e2e-placeholder",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--poll-interval",
        "1",
        "--out",
        outPath,
        "--quiet",
      ]);

      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain("你好世界");
      expect(JSON.parse(readFileSync(outPath, "utf8"))).toMatchObject({
        transcripts: [{ text: "你好世界" }],
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: speech recognize（DashScope 媒体）",
  () => {
    test("speech recognize 缺少 --url 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "recognize",
        "--quiet",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--url|Usage:/i);
    });

    test("【fun-asr】语音识别", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const outMp3 = join(outDir, "e2e-tts.mp3");
      const syn = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "synthesize",
        "--model",
        "cosyvoice-v3-flash",
        "--voice",
        "longxiaochun_v3",
        "--text",
        "端到端语音识别",
        "--out",
        outMp3,
        "--output",
        "json",
      ]);
      expect(syn.exitCode, syn.stderr).toBe(0);
      const synBody = parseStdoutJson<{ audio_url?: string }>(syn.stdout);
      const audioUrl = synBody.audio_url;
      expect(audioUrl?.startsWith("http")).toBe(true);

      const asrJson = join(outDir, "e2e-asr.json");
      const rec = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "recognize",
        "--model",
        "fun-asr",
        "--url",
        audioUrl!,
        "--language",
        "zh",
        "--out",
        asrJson,
        "--output",
        "json",
      ]);
      expect(rec.exitCode, rec.stderr).toBe(0);
      const raw = readFileSync(asrJson, "utf8");
      expect(raw.length).toBeGreaterThan(2);
    }, 300_000);
  },
);
