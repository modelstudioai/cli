import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_SEARCH_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  memoryUserId,
  type MemoryDryRunBody,
  type MemoryNodeListBody,
} from "./shared.ts";

describe("e2e: memory search", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--user-id/i);
    expect(stderr).toMatch(/--query/i);
    expect(stderr).toMatch(/--messages/i);
    expect(stderr).toMatch(/--top-k/i);
    expect(stderr).toMatch(/--min-score/i);
    expect(stderr).toMatch(/--enable-rerank/i);
    expect(stderr).toMatch(/--enable-judge/i);
    expect(stderr).toMatch(/--enable-rewrite/i);
    expect(stderr).toMatch(/--plan-version/i);
    expect(stderr).toMatch(/--workspace-id/i);
    expect(stderr).toMatch(/--project-id/i);
  });

  test("缺 --user-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--query",
      "编程偏好",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --query 与 --messages 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/query|messages/i);
  });

  test("--top-k 0 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
      "--query",
      "x",
      "--top-k",
      "0",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--memory-library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
      "--query",
      "x",
      "--memory-library-id",
      "l".repeat(33),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--top-k 101 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
      "--query",
      "x",
      "--top-k",
      "101",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--min-score 1.5 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
      "--query",
      "x",
      "--min-score",
      "1.5",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--plan-version 非法取值报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
      "--query",
      "x",
      "--plan-version",
      "ultra",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/pro|lite/i);
  });

  test("--enable-rerank 非 true/false 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
      "--query",
      "x",
      "--enable-rerank",
      "yes",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--messages 非法 JSON 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      memoryUserId(),
      "--messages",
      "[oops",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run + --query 断言 endpoint 与 query 被包成单条 user message", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      "user1",
      "--query",
      "编程偏好",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/memory_nodes\/search$/);
    expect(data.method).toBe("POST");
    expect(data.request?.messages).toEqual([{ role: "user", content: "编程偏好" }]);
    // `query` is not part of the API contract — it must never reach the body
    expect(data.request?.query).toBeUndefined();
  });

  test("--dry-run + --messages 覆盖 --query", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      "user1",
      "--query",
      "被忽略",
      "--messages",
      '[{"role":"user","content":"推荐一本书"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.messages).toEqual([{ role: "user", content: "推荐一本书" }]);
  });

  test("--dry-run 断言检索调参全部映射进 body", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      "user1",
      "--query",
      "提醒事项",
      "--top-k",
      "5",
      "--min-score",
      "0",
      "--enable-rerank",
      "true",
      "--enable-judge",
      "true",
      "--enable-rewrite",
      "false",
      "--plan-version",
      "lite",
      "--memory-library-id",
      "lib_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.top_k).toBe(5);
    // 0 is a meaningful threshold — it must not be dropped as falsy
    expect(data.request?.min_score).toBe(0);
    expect(data.request?.enable_rerank).toBe(true);
    expect(data.request?.enable_judge).toBe(true);
    expect(data.request?.enable_rewrite).toBe(false);
    expect(data.request?.plan_version).toBe("lite");
    expect(data.request?.memory_library_id).toBe("lib_test");
  });

  test("--dry-run 断言可重复 --project-id 汇成 project_ids", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      "user1",
      "--query",
      "多规则混检",
      "--project-id",
      "proj_a",
      "--project-id",
      "proj_b",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.project_ids).toEqual(["proj_a", "proj_b"]);
    expect(data.request?.project_id).toBeUndefined();
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory search (live)", () => {
  test("检索不存在的记忆实体返回空列表而非报错", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      ...memoryScopeCliArgs(),
      "--user-id",
      `no-such-entity-${Date.now()}`,
      "--query",
      "任何内容",
      "--top-k",
      "3",
      "--plan-version",
      "lite",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryNodeListBody>(stdout);
    expect(data.request_id?.length ?? 0).toBeGreaterThan(0);
    expect(data.memory_nodes ?? []).toHaveLength(0);
  });

  test("--memory-library-id 不存在时服务端拒绝（非 0 退出）", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--memory-library-id",
      "no-such-library-000000000000000",
      "--user-id",
      memoryUserId(),
      "--query",
      "任何内容",
      "--plan-version",
      "lite",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });
});
