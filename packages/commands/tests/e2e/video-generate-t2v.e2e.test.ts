import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  cliTimeoutPrefix,
  e2eLabelFromMetaUrl,
  isBailianE2EVideoEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { VIDEO_ROUTES } from "./topic-routes.ts";

/**
 * Video generate (t2v)：help / 分组不依赖密钥；长任务需视频 E2E + DashScope。
 */

describe("e2e: video generate (t2v)", () => {
  test("video generate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(VIDEO_ROUTES, [
      "video",
      "generate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/generate|--prompt|--model|download|image/i);
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video generate (t2v)（DashScope 视频）",
  () => {
    test("video generate 缺少 --prompt 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "wan3.0-video",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("video generate --dry-run（无 --image）仅输出 request 且不调生成接口", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        "--dry-run",
        ...cliTimeoutPrefix(),
        "--prompt",
        "干跑校验",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ request?: { model?: string; input?: { prompt?: string } } }>(
        stdout,
      );
      expect(data.request?.model).toBe("wan3.0-video");
      expect(data.request?.input?.prompt).toBe("干跑校验");
    });

    test("【wan3.0-video】文本生成视频", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "wan3.0-video",
        "--prompt",
        "夕阳下海面波光，远景静态镜头",
        "--download",
        join(outDir, "e2e-video-t2v.mp4"),
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
