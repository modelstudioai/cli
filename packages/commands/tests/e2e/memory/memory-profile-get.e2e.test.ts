import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_PROFILE_GET_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  memoryUserId,
  type MemoryDryRunBody,
} from "./shared.ts";

describe("e2e: memory profile get", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_PROFILE_GET_ROUTES, [
      "memory",
      "profile",
      "get",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--schema-id/i);
    expect(stderr).toMatch(/--user-id/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --schema-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_GET_ROUTES, [
      "memory",
      "profile",
      "get",
      "--user-id",
      "user1",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --user-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_GET_ROUTES, [
      "memory",
      "profile",
      "get",
      "--schema-id",
      "schema_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run endpoint 命中 /user_profile 子资源", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_GET_ROUTES, [
      "memory",
      "profile",
      "get",
      "--schema-id",
      "schema_test",
      "--user-id",
      "user1",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    // Regression guard: this path used to point at /profiles, which the API rejects
    expect(data.endpoint).toMatch(
      /api\/v2\/apps\/memory\/profile_schemas\/schema_test\/user_profile\?user_id=user1$/,
    );
    expect(data.method).toBe("GET");
  });

  test("--dry-run 断言 --memory-library-id 进 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_GET_ROUTES, [
      "memory",
      "profile",
      "get",
      "--schema-id",
      "schema_test",
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
    const endpoint = parseStdoutJson<MemoryDryRunBody>(stdout).endpoint ?? "";
    expect(endpoint).toMatch(/user_id=user1/);
    expect(endpoint).toMatch(/memory_library_id=lib_test/);
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory profile get (live)", () => {
  test("不存在的 schema 被服务端拒绝（非 0 退出）", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_GET_ROUTES, [
      "memory",
      "profile",
      "get",
      ...memoryScopeCliArgs(),
      "--schema-id",
      `no-such-schema-${Date.now()}`,
      "--user-id",
      memoryUserId(),
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });
});
