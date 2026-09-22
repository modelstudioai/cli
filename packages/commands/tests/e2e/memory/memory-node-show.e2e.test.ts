import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_NODE_SHOW_ROUTES } from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS, type MemoryDryRunBody } from "./shared.ts";

describe("e2e: memory node show", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_NODE_SHOW_ROUTES, [
      "memory",
      "node",
      "show",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--node-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --node-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_NODE_SHOW_ROUTES, [
      "memory",
      "node",
      "show",
      ...TEST_WORKSPACE_ARGS,
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / GET / node id 被 URL 编码", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_NODE_SHOW_ROUTES, [
      "memory",
      "node",
      "show",
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
      /^https:\/\/ws_test\.cn-beijing\.maas\.aliyuncs\.com\/api\/v2\/apps\/memory\/memory_nodes\/node%2Fwith%20space$/,
    );
    expect(data.method).toBe("GET");
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory node show (live)", () => {
  test("不存在的节点被服务端拒绝（非 0 退出）", async () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID?.trim() ?? "";
    const { exitCode } = await runCommandE2e(MEMORY_NODE_SHOW_ROUTES, [
      "memory",
      "node",
      "show",
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

// The live positive node-show assertion lives in the CRUD chain in memory-delete.e2e.test.ts.
