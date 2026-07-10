import { describe, expect, test } from "vite-plus/test";
import { join } from "node:path";
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
 * Speech synthesize：help / 分组不依赖密钥；合成本地需媒体 E2E + DashScope。
 */

describe("e2e: speech synthesize", () => {
  test("speech synthesize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "synthesize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/synthesize|--text|--voice|model/i);
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: speech synthesize（DashScope 媒体）",
  () => {
    test("speech synthesize 缺少 --text 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "synthesize",
        "--model",
        "cosyvoice-v3-flash",
        "--voice",
        "longxiaochun_v3",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--text|Usage:/i);
    });

    test("speech synthesize --dry-run 仅输出 request 且不调 TTS", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "synthesize",
        "--dry-run",
        "--model",
        "cosyvoice-v3-flash",
        "--voice",
        "longxiaochun_v3",
        "--text",
        "干跑",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ request?: { model?: string; input?: { text?: string } } }>(
        stdout,
      );
      expect(data.request?.model).toBe("cosyvoice-v3-flash");
      expect(data.request?.input?.text).toBe("干跑");
    });

    test("【cosyvoice-v3-flash】语音合成", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const outMp3 = join(outDir, "e2e-tts.mp3");
      const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
        "speech",
        "synthesize",
        "--model",
        "cosyvoice-v3-flash",
        "--voice",
        "longxiaochun_v3",
        "--text",
        "端到端语音测试",
        "--out",
        outMp3,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ saved?: string; audio_url?: string }>(stdout);
      expect(data.saved).toBe(outMp3);
      expect(data.audio_url?.length ?? 0).toBeGreaterThan(0);
    }, 180_000);
  },
);
