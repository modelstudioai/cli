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

describe("e2e: omni", () => {
  test("omni --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(["omni", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/omni|--message|--audio|text-only/i);
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: omni（DashScope 媒体）",
  () => {
    test("omni --list-voices 输出音色列表并退出", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(["omni", "--list-voices"]);
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toMatch(/Omni output voices:/);
      expect(stdout).toMatch(/Tina/);
      expect(stdout).toMatch(/Dylan/);
      expect(stdout).toMatch(/Total: 13 voices/);
    });

    test("omni 缺少 --message 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(["omni", "--model", "qwen3.5-omni-flash"]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--message|Usage:/i);
    });

    test("omni --audio 无法识别扩展名时退出为用法错误 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e([
        "omni",
        "--model",
        "qwen3.5-omni-flash",
        "--audio",
        "https://example.com/sample.flac",
        "--text-only",
        "--message",
        "这段音频在说什么？",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/Unsupported audio extension|Cannot infer audio format/i);
    });

    test("omni --dry-run --audio 构造 input_audio 而非 audio_url", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e([
        "omni",
        "--dry-run",
        "--model",
        "qwen3.5-omni-flash",
        "--audio",
        "https://example.com/sample.wav",
        "--text-only",
        "--message",
        "这段音频在说什么？",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        request?: {
          messages?: Array<{
            content?: Array<{
              type?: string;
              audio_url?: unknown;
              input_audio?: { data?: string; format?: string };
            }>;
          }>;
        };
      }>(stdout);
      const parts = data.request?.messages?.flatMap((m) =>
        Array.isArray(m.content) ? m.content : [],
      );
      const audioPart = parts?.find((p) => p.type === "input_audio" || p.type === "audio_url");
      expect(audioPart?.type).toBe("input_audio");
      expect(audioPart?.audio_url).toBeUndefined();
      expect(audioPart?.input_audio?.data).toBe("https://example.com/sample.wav");
      expect(audioPart?.input_audio?.format).toBe("wav");
    });

    test("【qwen3.5-omni-flash】本地音频理解", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const clipText = "端到端Omni音频测试";
      const clipWav = join(outDir, "e2e-omni-input.wav");

      const syn = await runCommandE2e([
        "speech",
        "synthesize",
        "--model",
        "cosyvoice-v3-flash",
        "--voice",
        "longxiaochun_v3",
        "--text",
        clipText,
        "--format",
        "wav",
        "--out",
        clipWav,
        "--output",
        "json",
      ]);
      expect(syn.exitCode, syn.stderr).toBe(0);

      const omni = await runCommandE2e([
        "omni",
        "--model",
        "qwen3.5-omni-flash",
        "--audio",
        clipWav,
        "--text-only",
        "--system",
        "请逐字转写用户提供的音频内容，不要添加解释。",
        "--message",
        "请转写这段音频。",
        "--output",
        "json",
      ]);
      expect(omni.exitCode, omni.stderr).toBe(0);
      const body = parseStdoutJson<{ content?: string }>(omni.stdout);
      expect(body.content?.replace(/\s/g, "")).toMatch(/端到端Omni音频测试/);
    }, 180_000);
  },
);
