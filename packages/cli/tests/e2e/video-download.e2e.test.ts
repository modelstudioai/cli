import { existsSync } from "node:fs";
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

/** dry-run 占位 UUID */
const PLACEHOLDER_TASK_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Video download：help / 分组不依赖密钥。
 * 真实下载：先 `video generate` 等待成功并取 stdout 中的 task_id，再 `video download`。
 */

describe("e2e: video download", () => {
  test("video 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["video"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/video|generate|edit|ref|task|download/i);
  });

  test("video download --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["video", "download", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/download|--task-id|--out/i);
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video download（DashScope 视频）",
  () => {
    test("video download 缺少 --task-id 时打印子命令帮助并退出 (0)", async () => {
      const { stderr, exitCode } = await runCli([
        "video",
        "download",
        "--out",
        "/tmp/will-not-be-used.mp4",
        "--non-interactive",
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--task-id|Usage:/i);
    });

    test("video download 缺少 --out 时打印子命令帮助并退出 (0)", async () => {
      const { stderr, exitCode } = await runCli([
        "video",
        "download",
        "--task-id",
        PLACEHOLDER_TASK_ID,
        "--non-interactive",
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--out|Usage:/i);
    });

    test("video download --dry-run 仅输出计划且不下载", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const fakeOut = join(outDir, "e2e-dry-not-written.mp4");
      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "download",
        "--dry-run",
        "--task-id",
        PLACEHOLDER_TASK_ID,
        "--out",
        fakeOut,
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ task_id?: string; action?: string; out?: string }>(stdout);
      expect(data.task_id).toBe(PLACEHOLDER_TASK_ID);
      expect(data.action).toBe("download");
      expect(data.out).toBe(fakeOut);
    });

    test("先生成视频再按 task_id 下载", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const genMp4 = join(outDir, "e2e-gen-for-download.mp4");

      const gen = await runCli([
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.0-t2v",
        "--duration",
        "3",
        "--prompt",
        "极简几何色块，静态镜头，用于下载测试",
        "--download",
        genMp4,
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(gen.exitCode, gen.stderr).toBe(0);
      const genData = parseStdoutJson<{
        status?: string;
        task_id?: string;
        video_url?: string;
        saved?: string;
      }>(gen.stdout);
      expect(genData.status).toBe("SUCCEEDED");
      expect(genData.task_id?.length ?? 0, gen.stdout + gen.stderr).toBeGreaterThan(8);
      expect(genData.video_url?.startsWith("https://")).toBe(true);
      expect(existsSync(genMp4)).toBe(true);

      const downloadMp4 = join(outDir, "e2e-download.mp4");
      const dl = await runCli([
        "video",
        "download",
        ...cliTimeoutPrefix(),
        "--task-id",
        genData.task_id!,
        "--out",
        downloadMp4,
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(dl.exitCode, dl.stderr).toBe(0);
      const dlData = parseStdoutJson<{ saved?: string }>(dl.stdout);
      expect(dlData.saved).toBe(downloadMp4);
      expect(existsSync(downloadMp4)).toBe(true);
    }, 3_600_000);
  },
);
