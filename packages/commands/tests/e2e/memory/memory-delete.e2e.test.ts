import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_DELETE_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  memoryUserId,
  type MemoryAddBody,
  type MemoryDryRunBody,
  type MemoryNodeListBody,
} from "./shared.ts";

describe("e2e: memory delete", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--node-id/i);
    expect(stderr).toMatch(/--user-id/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --node-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--user-id",
      memoryUserId(),
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --user-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / DELETE / query 参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node_test",
      "--user-id",
      "user1",
      "--memory-library-id",
      "lib_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    const endpoint = data.endpoint ?? "";
    expect(endpoint).toMatch(/api\/v2\/apps\/memory\/memory_nodes\/node_test\?/);
    expect(endpoint).toMatch(/user_id=user1/);
    expect(endpoint).toMatch(/memory_library_id=lib_test/);
    expect(data.method).toBe("DELETE");
  });

  test("--dry-run 不传 --memory-library-id 时 query 里不出现该键", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node_test",
      "--user-id",
      "user1",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).not.toMatch(/memory_library_id/);
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory delete (live)", () => {
  test("删除不存在的节点时服务端拒绝（非 0 退出）", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      ...memoryScopeCliArgs(),
      "--node-id",
      `no-such-node-${Date.now()}`,
      "--user-id",
      memoryUserId(),
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });

  test("记忆节点自清理闭环：add → list → search → update → delete → list", async () => {
    const userId = memoryUserId();
    const marker = `vp-${Date.now()}`;
    const contentBefore = `CLI vp test ${marker}：记忆写入（可删）`;
    const contentAfter = `CLI vp test ${marker}：记忆已更新`;

    const addRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "add",
      ...memoryScopeCliArgs(),
      "--user-id",
      userId,
      "--content",
      contentBefore,
      "--meta-data",
      `{"marker":"${marker}"}`,
      "--output",
      "json",
    ]);
    expect(addRes.exitCode, addRes.stderr).toBe(0);
    const added = parseStdoutJson<MemoryAddBody>(addRes.stdout);
    expect(added.request_id?.length ?? 0, addRes.stdout).toBeGreaterThan(0);
    // The contract says AddMemory reports the changed nodes; a bare request_id
    // with no node means the write silently did nothing.
    expect(added.memory_nodes?.length ?? 0, addRes.stdout).toBeGreaterThan(0);
    const addedNodeId = added.memory_nodes![0]!.memory_node_id;
    expect(addedNodeId.length).toBeGreaterThan(0);

    const listRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "list",
      ...memoryScopeCliArgs(),
      "--user-id",
      userId,
      "--page-size",
      "50",
      "--output",
      "json",
    ]);
    expect(listRes.exitCode, listRes.stderr).toBe(0);
    const listed = parseStdoutJson<MemoryNodeListBody>(listRes.stdout);
    const listedNode = listed.memory_nodes?.find((node) => node.memory_node_id === addedNodeId);
    if (!listedNode) {
      throw new Error(
        `memory list 未包含刚写入的节点 ${addedNodeId}。请确认 BAILIAN_E2E_MEMORY_LIBRARY_ID 与控制台「记忆库」ID 一致。stdout=${listRes.stdout}`,
      );
    }
    expect(listedNode.meta_data?.marker).toBe(marker);

    const searchRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "search",
      ...memoryScopeCliArgs(),
      "--user-id",
      userId,
      "--query",
      marker,
      "--top-k",
      "5",
      "--min-score",
      "0",
      "--plan-version",
      "lite",
      "--output",
      "json",
    ]);
    expect(searchRes.exitCode, searchRes.stderr).toBe(0);
    const searched = parseStdoutJson<MemoryNodeListBody>(searchRes.stdout);
    expect(searched.memory_nodes?.length ?? 0, searchRes.stdout).toBeGreaterThan(0);

    const updateRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "update",
      ...memoryScopeCliArgs(),
      "--node-id",
      addedNodeId,
      "--user-id",
      userId,
      "--content",
      contentAfter,
      "--meta-data",
      '{"updated":"true"}',
      "--output",
      "json",
    ]);
    expect(updateRes.exitCode, updateRes.stderr).toBe(0);

    // Verify the update landed on the server rather than trusting the 200
    const afterUpdateRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "list",
      ...memoryScopeCliArgs(),
      "--user-id",
      userId,
      "--page-size",
      "50",
      "--output",
      "json",
    ]);
    expect(afterUpdateRes.exitCode, afterUpdateRes.stderr).toBe(0);
    const afterUpdate = parseStdoutJson<MemoryNodeListBody>(afterUpdateRes.stdout);
    const updatedNode = afterUpdate.memory_nodes?.find(
      (node) => node.memory_node_id === addedNodeId,
    );
    expect(updatedNode?.content, afterUpdateRes.stdout).toBe(contentAfter);

    const deleteRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      ...memoryScopeCliArgs(),
      "--node-id",
      addedNodeId,
      "--user-id",
      userId,
      "--output",
      "json",
    ]);
    expect(deleteRes.exitCode, deleteRes.stderr).toBe(0);

    const afterDeleteRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "list",
      ...memoryScopeCliArgs(),
      "--user-id",
      userId,
      "--page-size",
      "50",
      "--output",
      "json",
    ]);
    expect(afterDeleteRes.exitCode, afterDeleteRes.stderr).toBe(0);
    const afterDelete = parseStdoutJson<MemoryNodeListBody>(afterDeleteRes.stdout);
    expect(
      afterDelete.memory_nodes?.some((node) => node.memory_node_id === addedNodeId) ?? false,
      afterDeleteRes.stdout,
    ).toBe(false);
  }, 240_000);
});
