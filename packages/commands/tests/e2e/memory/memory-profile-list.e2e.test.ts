import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_PROFILE_LIST_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  type MemoryDryRunBody,
  type ProfileSchemaListBody,
} from "./shared.ts";

describe("e2e: memory profile list", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--page-size/i);
    expect(stderr).toMatch(/--page/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("--page 0 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      "--page",
      "0",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--memory-library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      "--memory-library-id",
      "l".repeat(33),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--page-size 0 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      "--page-size",
      "0",
    ]);
    expect(exitCode).toBe(2);
  });

  test("未知 flag 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      "--user-id",
      "user1",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 无参数时 endpoint 不带 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/profile_schemas$/);
    expect(data.method).toBe("GET");
  });

  test("--dry-run 断言分页与 memory-library-id 进 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      "--page-size",
      "20",
      "--page",
      "2",
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
    expect(endpoint).toMatch(/page_num=2/);
    expect(endpoint).toMatch(/memory_library_id=lib_test/);
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory profile list (live)", () => {
  test("列出画像模板返回 request_id 与 total", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      ...memoryScopeCliArgs(),
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ProfileSchemaListBody>(stdout);
    expect(data.request_id?.length ?? 0).toBeGreaterThan(0);
    for (const schema of data.profile_schemas ?? []) {
      expect(schema.profile_schema_id.length).toBeGreaterThan(0);
      expect(schema.name.length).toBeGreaterThan(0);
    }
  });

  test("--memory-library-id 不存在时服务端拒绝（非 0 退出）", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_LIST_ROUTES, [
      "memory",
      "profile",
      "list",
      "--memory-library-id",
      "no-such-library-000000000000000",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });
});
