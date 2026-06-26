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
 * Video generate (i2v)：help / 分组不依赖密钥；长任务需视频 E2E + DashScope。
 */

describe("e2e: video generate (i2v)", () => {
  test("video 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["video"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/video|generate|edit|ref|task|download/i);
  });

  test("video generate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["video", "generate", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/generate|--prompt|--image|model/i);
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video generate (i2v)（DashScope 视频）",
  () => {
    test("video generate 缺少 --prompt 时打印子命令帮助并退出 (0)", async () => {
      const { stderr, exitCode } = await runCli([
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-i2v",
        "--image",
        "https://example.com/placeholder.png",
        "--non-interactive",
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("video generate --dry-run（无 --image）仅输出 request（t2v 路径不调上传）", async () => {
      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--dry-run",
        "--model",
        "happyhorse-1.0-t2v",
        "--prompt",
        "干跑无图",
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ request?: { input?: { prompt?: string; media?: unknown } } }>(
        stdout,
      );
      expect(data.request?.input?.prompt).toBe("干跑无图");
      expect(data.request?.input?.media).toBeUndefined();
    });

    test("【happyhorse-1.0-i2v】图片生成视频", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const png = join(outDir, "e2e-gen.png");
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
      const imagePath = genData.saved?.[0] ?? png;

      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-i2v",
        "--image",
        imagePath,
        "--prompt",
        "镜头缓慢推进，小猫微微动一下",
        "--download",
        join(outDir, "e2e-video-i2v.mp4"),
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ status?: string; video_url?: string; saved?: string }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.video_url?.startsWith("https://")).toBe(true);
    }, 3_600_000);
  },
);
