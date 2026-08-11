import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_KB_STATS_ROUTES } from "../topic-routes.ts";

interface DryRunBody {
  endpoint?: string;
  request?: {
    indexId?: string;
    startTimestamp?: string;
    endTimestamp?: string;
  };
}

describe("e2e: knowledge stats dry-run", () => {
  test("--dry-run 正常日期范围输出正确时间戳", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_KB_STATS_ROUTES,
      [
        "knowledge",
        "stats",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--start",
        "2026-07-30",
        "--end",
        "2026-08-10",
        "--workspace-id",
        "ws_test",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/monitor/);
    expect(data.request?.indexId).toBe("idx_test");
    expect(data.request?.startTimestamp).toBe("1785369600"); // 2026-07-30 00:00:00 UTC
    expect(data.request?.endTimestamp).toBe("1786320000"); // 2026-08-10 00:00:00 UTC (11 days after start)
  });

  test("--end 未来时间被截断为当前时间", async () => {
    const beforeRun = Math.floor(Date.now() / 1000);
    const { stdout, stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_KB_STATS_ROUTES,
      [
        "knowledge",
        "stats",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--start",
        "2026-07-30",
        "--end",
        "2026-12-31",
        "--workspace-id",
        "ws_test",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    const afterRun = Math.floor(Date.now() / 1000);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.startTimestamp).toBe("1785369600"); // 2026-07-30 unchanged
    // endTimestamp should be clamped to now, within the run window
    const endTs = Number(data.request?.endTimestamp);
    expect(endTs).toBeGreaterThanOrEqual(beforeRun);
    expect(endTs).toBeLessThanOrEqual(afterRun);
  });

  test("--start 未来时间报用法错误 (exit 2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_KB_STATS_ROUTES,
      [
        "knowledge",
        "stats",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--start",
        "2026-12-31",
        "--workspace-id",
        "ws_test",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/future/i);
  });
});
