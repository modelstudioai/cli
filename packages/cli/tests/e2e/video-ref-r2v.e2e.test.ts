import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  cliTimeoutPrefix,
  e2eLabelFromMetaUrl,
  isBailianE2EVideoEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCli,
} from "./helpers.ts";

/**
 * Video ref (r2v)：help / 分组不依赖密钥；参考生成需视频 E2E + DashScope。
 */

describe("e2e: video ref (r2v)", () => {
  test("video 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["video"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/video|generate|edit|ref|task|download/i);
  });

  test("video ref --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["video", "ref", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/ref|--prompt|--image|model/i);
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video ref (r2v)（DashScope 视频）",
  () => {
    test("video ref 缺少 --prompt 时打印子命令帮助并退出 (0)", async () => {
      const { stderr, exitCode } = await runCli([
        ...cliTimeoutPrefix(),
        "video",
        "ref",
        "--model",
        "happyhorse-1.0-r2v",
        "--image",
        "https://example.com/x.png",
        "--non-interactive",
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("video ref 缺少 --image 与 --ref-video 时退出为用法错误 (2)", async () => {
      const { stderr, exitCode } = await runCli([
        ...cliTimeoutPrefix(),
        "video",
        "ref",
        "--model",
        "happyhorse-1.0-r2v",
        "--prompt",
        "仅有描述无素材",
        "--non-interactive",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--image|ref-video|At least one|required/i);
    });

    test("【happyhorse-1.0-r2v】视频参考生成", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const gen = await runCli([
        "image",
        "generate",
        "--model",
        "qwen-image-2.0",
        "--prompt",
        "一只简笔画小猫，白底",
        "--out-dir",
        outDir,
        "--out-prefix",
        "e2e-gen",
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(gen.exitCode, gen.stderr).toBe(0);
      const genData = parseStdoutJson<{ saved?: string[] }>(gen.stdout);
      const imagePath = genData.saved?.[0];
      expect(imagePath).toBeTruthy();

      const { stdout, stderr, exitCode } = await runCli([
        ...cliTimeoutPrefix(),
        "video",
        "ref",
        "--model",
        "happyhorse-1.0-r2v",
        "--prompt",
        "图1在画面中心轻微晃动",
        "--image",
        imagePath!,
        "--download",
        join(outDir, "e2e-video-r2v.mp4"),
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ status?: string; video_url?: string }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.video_url?.startsWith("https://")).toBe(true);
    }, 3_600_000);
  },
);
