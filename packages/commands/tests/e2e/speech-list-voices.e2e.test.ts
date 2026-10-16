import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, makeE2eOutputDir, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { SPEECH_ROUTES } from "./topic-routes.ts";

/**
 * Speech list-voices E2E
 */

describe("e2e: speech list-voices", () => {
  test("speech synthesize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_ROUTES, [
      "speech",
      "synthesize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/synthesize|--text|--voice|list-voices|model/i);
  });

  test("speech recognize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_ROUTES, [
      "speech",
      "recognize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recognize|--url|audio|model/i);
  });

  // --list-voices 只读本地目录，但 auth: apiKey 在 run() 前仍要求凭证
  test("【qwen-audio-3.0-tts-plus】获取音色列表", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "synthesize",
      "--list-voices",
      "--model",
      "qwen-audio-3.0-tts-plus",
      "--api-key",
      "sk-e2e-placeholder",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("longanlingxin");
    expect(stdout).toContain("longanlufeng");
  });

  test("【qwen-audio-3.0-tts-flash】获取音色列表", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "synthesize",
      "--list-voices",
      "--model",
      "qwen-audio-3.0-tts-flash",
      "--api-key",
      "sk-e2e-placeholder",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("longanfengyue");
    expect(stdout).toContain("loongjohn");
  });

  // 激活 token-plan 后不传 --model，应打出默认 qwen-audio plus 音色
  test("Token Plan 未显式传 --model 时 --list-voices 使用默认 qwen-audio TTS", async () => {
    const configDir = makeE2eOutputDir("speech-list-voices-token-plan-default");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        "token-plan": {
          api_key: "sk-sp-e2e-placeholder",
          base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
          default_speech_model: "qwen-audio-3.0-tts-plus",
        },
      }),
    );

    const { stdout, stderr, exitCode } = await runCommandE2e(
      SPEECH_ROUTES,
      ["speech", "synthesize", "--config", "token-plan", "--list-voices"],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("longanlingxin");
    expect(stdout).toContain("longanlufeng");
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: speech list-voices", () => {
  test("speech synthesize 缺少 --text 且非 --list-voices 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "synthesize",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--text|Usage:/i);
  });

  test("【cosyvoice-v3-flash】获取音色列表", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "synthesize",
      "--list-voices",
      "--model",
      "cosyvoice-v3-flash",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("longxiaochun_v3");
  }, 60_000);
});
