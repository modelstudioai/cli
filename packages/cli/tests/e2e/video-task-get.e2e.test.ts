import { describe, expect, test } from "vite-plus/test";
import { isBailianE2EEnabled, isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

const taskId = process.env.BAILIAN_E2E_VIDEO_TASK_ID?.trim();

/**
 * Video task get：help / 分组不依赖密钥；查询需 E2E + task_id + DashScope。
 */

describe("e2e: video task get", () => {
  test("video 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["video"]);
    expect(exitCode, stderr).toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/video|generate|edit|ref|task|download/i);
  });

  test("video task get --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["video", "task", "get", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/task|get|--task-id/i);
  });
});

describe.skipIf(!isBailianE2EEnabled() || !taskId || !isDashScopeE2EReady())(
  "e2e: video task get（DashScope）",
  () => {
    test("video task get 缺少 --task-id 时打印子命令帮助并退出 (0)", async () => {
      const { stderr, exitCode } = await runCli([
        "video",
        "task",
        "get",
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toMatch(/--task-id|Usage:/i);
    });

    test("video task get --dry-run 仅回显 task_id 且不调任务接口", async () => {
      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "task",
        "get",
        "--dry-run",
        "--task-id",
        taskId!,
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ task_id?: string }>(stdout);
      expect(data.task_id).toBe(taskId);
    });

    test("根据 task_id 查询任务状态", async () => {
      const { stdout, stderr, exitCode } = await runCli([
        "video",
        "task",
        "get",
        "--task-id",
        taskId!,
        "--non-interactive",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ task_status?: string; task_id?: string }>(stdout);
      expect(data.task_id).toBe(taskId);
      expect(data.task_status?.length ?? 0).toBeGreaterThan(0);
    }, 60_000);
  },
);
