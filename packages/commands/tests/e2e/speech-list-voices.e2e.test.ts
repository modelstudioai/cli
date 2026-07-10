import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, runCommandE2e } from "./helpers.ts";
import { SPEECH_ROUTES } from "./topic-routes.ts";

/**
 * Speech list-voices E2E
 */

describe("e2e: speech list-voices", () => {
  test("speech synthesize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "synthesize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/synthesize|--text|--voice|list-voices|model/i);
  });

  test("speech recognize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "recognize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recognize|--url|audio|model/i);
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
