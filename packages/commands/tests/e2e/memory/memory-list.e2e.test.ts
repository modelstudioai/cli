import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_LIST_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  memoryUserId,
  type MemoryDryRunBody,
  type MemoryNodeListBody,
} from "./shared.ts";

describe("e2e: memory list", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--user-id/i);
    expect(stderr).toMatch(/--page-size/i);
    expect(stderr).toMatch(/--page/i);
    expect(stderr).toMatch(/--project-id/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 workspace 时报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      MEMORY_LIST_ROUTES,
      ["memory", "list", "--user-id", "user1", "--api-key", "sk-fake", "--output", "json"],
      { BAILIAN_WORKSPACE_ID: "", BAILIAN_CONFIG_DIR: "/tmp" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/workspace.*required/i);
  });

  test("裸调用（无任何 flag）打 help 并 exit 0", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, ["memory", "list"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--user-id/i);
  });

  test("缺 --user-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--page-size",
      "10",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--page 0 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--user-id",
      memoryUserId(),
      "--page",
      "0",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--memory-library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--user-id",
      memoryUserId(),
      "--memory-library-id",
      "l".repeat(33),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--page-size 0 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--user-id",
      memoryUserId(),
      "--page-size",
      "0",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--page 非数字报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--user-id",
      memoryUserId(),
      "--page",
      "abc",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / GET / user_id query", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--user-id",
      "user1",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    // The memory API is served on the workspace-specific host, not the model domain
    expect(data.endpoint).toMatch(/^https:\/\/ws_test\.cn-beijing\.maas\.aliyuncs\.com\//);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/memory_nodes\?user_id=user1$/);
    expect(data.method).toBe("GET");
  });

  test("--dry-run 断言分页 / project-id / memory-library-id 进 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      "--user-id",
      "user1",
      "--page-size",
      "20",
      "--page",
      "2",
      "--project-id",
      "proj_test",
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
    expect(endpoint).toMatch(/page_size=20/);
    // The API paginates with page_num, not page
    expect(endpoint).toMatch(/page_num=2/);
    expect(endpoint).toMatch(/project_id=proj_test/);
    expect(endpoint).toMatch(/memory_library_id=lib_test/);
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory list (live)", () => {
  test("列出不存在的记忆实体返回空列表而非报错", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      ...memoryScopeCliArgs(),
      "--user-id",
      `no-such-entity-${Date.now()}`,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryNodeListBody>(stdout);
    expect(data.request_id?.length ?? 0).toBeGreaterThan(0);
    expect(data.memory_nodes ?? []).toHaveLength(0);
  });

  test("text 输出对空列表给出明确提示", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_LIST_ROUTES, [
      "memory",
      "list",
      ...memoryScopeCliArgs(),
      "--user-id",
      `no-such-entity-${Date.now()}`,
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/No memory nodes found/i);
  });
});
