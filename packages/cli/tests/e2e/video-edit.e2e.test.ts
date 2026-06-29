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
 * Video edit E2E
 */

describe("e2e: video edit", () => {
  test("video 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["video"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/video|generate|edit|ref|task|download/i);
  });

  test("video edit --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["video", "edit", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/edit|--video|--prompt|model/i);
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video edit（DashScope 视频）",
  () => {
    test("video edit 缺少 --video 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCli([
        "video",
        "edit",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-video-edit",
        "--prompt",
        "仅提示词",
        "--non-interactive",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--video|Usage:/i);
    });

    test("【happyhorse-1.0-video-edit】视频编辑", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const t2vPath = join(outDir, "e2e-video-t2v.mp4");

      const t2v = await runCli([
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-t2v",
        "--prompt",
        "夕阳下海面波光，海边有两个小朋友在玩耍",
        "--download",
        t2vPath,
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(t2v.exitCode, t2v.stderr).toBe(0);
      const t2vData = parseStdoutJson<{ status?: string; video_url?: string }>(t2v.stdout);
      expect(t2vData.status).toBe("SUCCEEDED");

      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "edit",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-video-edit",
        "--video",
        t2vData.video_url!,
        "--prompt",
        "整体色调偏暖",
        "--download",
        join(outDir, "e2e-video-edit.mp4"),
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ status?: string; video_url?: string }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.video_url?.startsWith("https://")).toBe(true);
    }, 7_200_000);
  },
);
