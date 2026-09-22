import { assertMemoryServiceRejection } from "./live-helpers.ts";
import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_DELETE_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  type MemoryAddBody,
  type MemoryDryRunBody,
  type MemoryNodeDetailBody,
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
    expect(stderr).not.toMatch(/--user-id/i);
    expect(stderr).toMatch(/--yes/i);
    expect(stderr).toMatch(/--library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("拒绝已移除的 --user-id", async () => {
    const { exitCode, stderr } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
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
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Unknown flag.*--user-id/i);
  });

  test("缺 --yes 报 CONFIRMATION_REQUIRED (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node_test",
      ...TEST_WORKSPACE_ARGS,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(7);
    expect(stderr).toMatch(/--yes/i);
  });

  test("缺 --node-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node_test",
      "--library-id",
      "l".repeat(33),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / DELETE / query 参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node_test",
      "--library-id",
      "lib_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    // dry-run must short-circuit before the runtime confirmation gate, otherwise
    // this non-TTY run would fail asking for --yes
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    const endpoint = data.endpoint ?? "";
    expect(endpoint).toMatch(/api\/v2\/apps\/memory\/memory_nodes\/node_test\?/);
    expect(endpoint).not.toMatch(/user_id=/);
    expect(endpoint).toMatch(/memory_library_id=lib_test/);
    expect(data.method).toBe("DELETE");
  });

  test("--dry-run 不传 --library-id 时 query 里不出现该键", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node_test",
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
    const { exitCode, stderr } = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      ...memoryScopeCliArgs(),
      "--node-id",
      `no-such-node-${Date.now()}`,
      "--yes",
      "--output",
      "json",
    ]);
    assertMemoryServiceRejection({ exitCode, stderr });
  });

  test("记忆节点自清理闭环：add → list → node show → search → update → delete → list", async () => {
    const userId = `cli-memory-${Date.now()}`;
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
    // add 已改为 add-async：命令内部轮询到终态，节点 id 从 events[].result[] 提取；
    // 只有 request_id/event_id 而无任何 result 节点意味着写入静默失败。
    expect(added.event_id?.length ?? 0, addRes.stdout).toBeGreaterThan(0);
    const addedNodeId = (added.events ?? [])
      .flatMap((event) => event.result ?? [])
      .map((item) => item.memory_node_id)
      .find((nodeId): nodeId is string => !!nodeId && nodeId.length > 0);
    if (!addedNodeId) {
      throw new Error(`memory add 未产生任何记忆节点。stdout=${addRes.stdout}`);
    }

    let deleted = false;
    try {
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
      expect(listedNode.content).toBe(contentBefore);
      expect(listedNode.meta_data?.marker).toBe(marker);

      // node show 只有 workspace 作用域（无 --library-id flag）
      const workspaceId = process.env.BAILIAN_WORKSPACE_ID?.trim() ?? "";
      const showRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "node",
        "show",
        "--workspace-id",
        workspaceId,
        "--node-id",
        addedNodeId,
        "--output",
        "json",
      ]);
      expect(showRes.exitCode, showRes.stderr).toBe(0);
      const shown = parseStdoutJson<MemoryNodeDetailBody>(showRes.stdout);
      expect(shown.memory_node?.memory_node_id, showRes.stdout).toBe(addedNodeId);
      expect(shown.memory_node?.content, showRes.stdout).toBe(contentBefore);
      expect(shown.memory_node?.meta_data?.marker, showRes.stdout).toBe(marker);

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
      expect(searched.memory_nodes, searchRes.stdout).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ memory_node_id: addedNodeId, content: contentBefore }),
        ]),
      );

      const updateRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "update",
        ...memoryScopeCliArgs(),
        "--node-id",
        addedNodeId,
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
      // update mutated both content and meta_data; verify the meta_data write
      // landed too rather than only the content
      expect(updatedNode?.meta_data?.updated, afterUpdateRes.stdout).toBe("true");

      const deleteRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "delete",
        ...memoryScopeCliArgs(),
        "--node-id",
        addedNodeId,
        "--yes",
        "--output",
        "json",
      ]);
      expect(deleteRes.exitCode, deleteRes.stderr).toBe(0);
      deleted = true;

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
      expect(afterDelete.memory_nodes, afterDeleteRes.stdout).toEqual([]);
      expect(afterDelete.total, afterDeleteRes.stdout).toBe(0);
    } finally {
      if (!deleted) {
        const cleanup = await runCommandE2e(MEMORY_DELETE_ROUTES, [
          "memory",
          "delete",
          ...memoryScopeCliArgs(),
          "--node-id",
          addedNodeId,
          "--yes",
          "--output",
          "json",
        ]);
        expect(cleanup.exitCode, cleanup.stderr).toBe(0);
      }
    }
  }, 240_000);
});
