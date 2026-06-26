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
 * Video generate (t2v)：help / 分组不依赖密钥；长任务需视频 E2E + DashScope。
 */

describe("e2e: video generate (t2v)", () => {
  test("video 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["video"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/video|generate|edit|ref|task|download/i);
  });

  test("video generate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["video", "generate", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/generate|--prompt|--model|download|image/i);
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video generate (t2v)（DashScope 视频）",
  () => {
    test("video generate 缺少 --prompt 时打印子命令帮助并退出 (0)", async () => {
      const { stderr, exitCode } = await runCli([
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-t2v",
        "--non-interactive",
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("video generate --dry-run（无 --image）仅输出 request 且不调生成接口", async () => {
      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "generate",
        "--dry-run",
        "--model",
        ...cliTimeoutPrefix(),
        "happyhorse-1.0-t2v",
        "--prompt",
        "干跑校验",
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ request?: { model?: string; input?: { prompt?: string } } }>(
        stdout,
      );
      expect(data.request?.model).toBe("happyhorse-1.0-t2v");
      expect(data.request?.input?.prompt).toBe("干跑校验");
    });

    test("【happyhorse-1.0-t2v】文本生成视频", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-t2v",
        "--prompt",
        "夕阳下海面波光，远景静态镜头",
        "--download",
        join(outDir, "e2e-video-t2v.mp4"),
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
