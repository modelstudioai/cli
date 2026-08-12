import { readFileSync } from "node:fs";
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
  runCommandE2e,
} from "./helpers.ts";
import { SPEECH_ROUTES } from "./topic-routes.ts";

/**
 * Speech recognize：help / 分组不依赖密钥；识别流程需媒体 E2E + DashScope。
 */

describe("e2e: speech recognize", () => {
  test("speech recognize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "recognize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recognize|--url|model|audio/i);
  });

  test.each(["fun-asr-flash-2026-06-15", "qwen-audio-3.0-asr-flash"])(
    "%s dry-run uses the synchronous multimodal endpoint",
    async (model) => {
      const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "recognize",
        "--model",
        model,
        "--url",
        "https://example.com/sample.mp3",
        "--language",
        "en",
        "--dry-run",
        "--output",
        "json",
      ]);

      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        mode?: string;
        path?: string;
        request?: {
          input?: {
            messages?: Array<{
              content?: Array<{ input_audio?: { data?: string } }>;
            }>;
          };
          parameters?: { format?: string; language_hints?: string[] };
        };
      }>(stdout);
      expect(data.mode).toBe("sync");
      expect(data.path).toBe("/api/v1/services/aigc/multimodal-generation/generation");
      expect(data.request?.input?.messages?.[0]?.content?.[0]?.input_audio?.data).toBe(
        "https://example.com/sample.mp3",
      );
      expect(data.request?.parameters).toMatchObject({ format: "mp3", language_hints: ["en"] });
    },
  );

  test("fun-asr dry-run keeps the asynchronous transcription endpoint", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "recognize",
      "--model",
      "fun-asr",
      "--url",
      "https://example.com/sample.mp3",
      "--dry-run",
      "--output",
      "json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ mode?: string; path?: string }>(stdout);
    expect(data.mode).toBe("async");
    expect(data.path).toBe("/api/v1/services/audio/asr/transcription");
  });

  test("flash recognition posts to the sync endpoint and saves the complete response", async () => {
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

  test("flash recognition rejects multiple files before making a request", async () => {
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
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("accepts exactly one audio file per request");
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
