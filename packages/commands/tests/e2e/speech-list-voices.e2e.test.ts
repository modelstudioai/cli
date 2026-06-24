import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, runCli } from "./setup.ts";

/**
 * Speech list-voices E2E
 */

describe("e2e: speech list-voices", () => {
  test("speech 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["speech"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/speech|synthesize|recognize/i);
  });

  test("speech synthesize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["speech", "synthesize", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/synthesize|--text|--voice|list-voices|model/i);
  });

  test("speech recognize --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["speech", "recognize", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/recognize|--url|audio|model/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: speech list-voices", () => {
  test("speech synthesize 缺少 --text 且非 --list-voices 时打印子命令帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli(["speech", "synthesize", "--non-interactive"]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--text|Usage:/i);
  });

  test("【cosyvoice-v3-flash】获取音色列表", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "speech",
      "synthesize",
      "--list-voices",
      "--model",
      "cosyvoice-v3-flash",
      "--non-interactive",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("longxiaochun_v3");
  }, 60_000);
});
