import { describe, expect, test } from "vite-plus/test";
import {
  isBailianE2EEnabled,
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { VIDEO_ROUTES } from "./topic-routes.ts";

const taskId = process.env.BAILIAN_E2E_VIDEO_TASK_ID?.trim();

/**
 * Video task get：help / 分组不依赖密钥；查询需 E2E + task_id + DashScope。
 */

describe("e2e: video task get", () => {
  test("video task get --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(VIDEO_ROUTES, [
      "video",
      "task",
      "get",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/task|get|--task-id/i);
  });
});

describe.skipIf(!isBailianE2EEnabled() || !taskId || !isDashScopeE2EReady())(
  "e2e: video task get（DashScope）",
  () => {
    test("video task get 缺少 --task-id 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "task",
        "get",
        "--output",
        "json",
      ]);
      expect(exitCode).toBe(2);
      const err = JSON.parse(stderr.trim()) as { error?: { code?: number; message?: string } };
      expect(err.error?.code).toBe(2);
      expect(err.error?.message).toMatch(/--task-id/i);
    });

    test("video task get --dry-run 仅回显 task_id 且不调任务接口", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "task",
        "get",
        "--dry-run",
        "--task-id",
        taskId!,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ task_id?: string }>(stdout);
      expect(data.task_id).toBe(taskId);
    });

    test("根据 task_id 查询任务状态", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "task",
        "get",
        "--task-id",
        taskId!,
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
