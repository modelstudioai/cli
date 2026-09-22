import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_UPDATE_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  memoryUserId,
  type MemoryDryRunBody,
} from "./shared.ts";

describe("e2e: memory update", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--node-id/i);
    expect(stderr).toMatch(/--user-id/i);
    expect(stderr).toMatch(/--content/i);
    expect(stderr).toMatch(/--timestamp/i);
    expect(stderr).toMatch(/--meta-data/i);
    expect(stderr).toMatch(/--skill-name/i);
    expect(stderr).toMatch(/--skill-description/i);
    expect(stderr).toMatch(/--skill-tags/i);
    expect(stderr).toMatch(/--library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --node-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--user-id",
      memoryUserId(),
      "--content",
      "新内容",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --content 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      memoryUserId(),
    ]);
    expect(exitCode).toBe(2);
  });

  test("--content 513 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      memoryUserId(),
      "--content",
      "x".repeat(513),
    ]);
    expect(exitCode).toBe(2);
  });

  test("--timestamp 负数报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      memoryUserId(),
      "--content",
      "新内容",
      "--timestamp",
      "-1",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      memoryUserId(),
      "--content",
      "新内容",
      "--library-id",
      "l".repeat(33),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--meta-data 非法 JSON 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      memoryUserId(),
      "--content",
      "新内容",
      "--meta-data",
      "{oops",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / PATCH / custom_content", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      "user1",
      "--content",
      "更新后的记忆内容",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/memory_nodes\/node_test$/);
    expect(data.method).toBe("PATCH");
    expect(data.request?.user_id).toBeUndefined();
    expect(data.request?.custom_content).toBe("更新后的记忆内容");
    expect(data.request?.timestamp).toBeUndefined();
    expect(data.request?.meta_data).toBeUndefined();
  });

  test("--dry-run 断言 --timestamp/--meta-data/--library-id 映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      "user1",
      "--content",
      "在 WAIC 见面",
      "--timestamp",
      "1747278460",
      "--meta-data",
      '{"city":"上海"}',
      "--library-id",
      "lib_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.timestamp).toBe(1747278460);
    expect(data.request?.meta_data).toEqual({ city: "上海" });
    expect(data.request?.memory_library_id).toBe("lib_test");
  });

  test("--dry-run 断言 node id 被 URL 编码", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node/with space",
      "--user-id",
      "user1",
      "--content",
      "编码校验",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/memory_nodes\/node%2Fwith%20space$/);
  });

  test("--dry-run 断言 skill 三件套映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      "user1",
      "--content",
      "整理会议纪要",
      "--skill-name",
      "会议纪要整理",
      "--skill-description",
      "提取会议重点",
      "--skill-tags",
      "办公",
      "--skill-tags",
      "总结",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.skill_name).toBe("会议纪要整理");
    expect(data.request?.skill_description).toBe("提取会议重点");
    expect(data.request?.skill_tags).toEqual(["办公", "总结"]);
  });

  test("--dry-run 不传 skill 三件套时 body 里不出现该组键", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      "user1",
      "--content",
      "普通更新",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.skill_name).toBeUndefined();
    expect(data.request?.skill_description).toBeUndefined();
    expect(data.request?.skill_tags).toBeUndefined();
  });

  test("skill 三件套只传部分报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node_test",
      "--user-id",
      memoryUserId(),
      "--content",
      "部分 skill 参数",
      "--skill-name",
      "只有名字",
      "--skill-description",
      "缺 tags",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/skill-name|skill-description|skill-tags/i);
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory update (live)", () => {
  test("更新不存在的节点时服务端拒绝（非 0 退出）", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      ...memoryScopeCliArgs(),
      "--node-id",
      `no-such-node-${Date.now()}`,
      "--user-id",
      memoryUserId(),
      "--content",
      "不存在的节点",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });
});

// The live update-in-place assertion lives in the CRUD chain in memory-delete.e2e.test.ts.
