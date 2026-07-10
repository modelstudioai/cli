import { readFileSync } from "node:fs";
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
