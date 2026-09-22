import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_SKILL_EXPORT_ROUTES } from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS, type MemoryDryRunBody } from "./shared.ts";

describe("e2e: memory skill export", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_SKILL_EXPORT_ROUTES, [
      "memory",
      "skill",
      "export",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--node-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --node-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SKILL_EXPORT_ROUTES, [
      "memory",
      "skill",
      "export",
      ...TEST_WORKSPACE_ARGS,
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / GET / node id 被 URL 编码", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_SKILL_EXPORT_ROUTES, [
      "memory",
      "skill",
      "export",
      "--node-id",
      "node/with space",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(
      /^https:\/\/ws_test\.cn-beijing\.maas\.aliyuncs\.com\/api\/v2\/apps\/memory\/skill\/export\/node%2Fwith%20space$/,
    );
    expect(data.method).toBe("GET");
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory skill export (live)", () => {
  test("不存在的节点被服务端拒绝（非 0 退出）", async () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID?.trim() ?? "";
    const { exitCode } = await runCommandE2e(MEMORY_SKILL_EXPORT_ROUTES, [
      "memory",
      "skill",
      "export",
      "--workspace-id",
      workspaceId,
      "--node-id",
      `no-such-node-${Date.now()}`,
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });
});

// The live positive skill-export assertion needs a skill fixture; it lives in the
// skill chain in memory-add.e2e.test.ts (gated by BAILIAN_E2E_MEMORY_SKILL_PROJECT_ID).
