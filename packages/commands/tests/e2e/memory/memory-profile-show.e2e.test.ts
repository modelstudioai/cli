import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_PROFILE_SHOW_ROUTES } from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS, memoryScopeCliArgs, type MemoryDryRunBody } from "./shared.ts";

describe("e2e: memory profile show", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_PROFILE_SHOW_ROUTES, [
      "memory",
      "profile",
      "show",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--schema-id/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --schema-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_SHOW_ROUTES, [
      "memory",
      "profile",
      "show",
      "--memory-library-id",
      "lib_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / GET", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_SHOW_ROUTES, [
      "memory",
      "profile",
      "show",
      "--schema-id",
      "schema_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/profile_schemas\/schema_test$/);
    expect(data.method).toBe("GET");
  });

  test("--dry-run 断言 --memory-library-id 进 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_SHOW_ROUTES, [
      "memory",
      "profile",
      "show",
      "--schema-id",
      "schema_test",
      "--memory-library-id",
      "lib_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/profile_schemas\/schema_test\?memory_library_id=lib_test$/);
  });

  test("--dry-run schema id 做 URL 编码", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_SHOW_ROUTES, [
      "memory",
      "profile",
      "show",
      "--schema-id",
      "a/b c",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/profile_schemas\/a%2Fb%20c$/);
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory profile show (live)", () => {
  test("不存在的 schema 被服务端拒绝（非 0 退出）", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_SHOW_ROUTES, [
      "memory",
      "profile",
      "show",
      ...memoryScopeCliArgs(),
      "--schema-id",
      `no-such-schema-${Date.now()}`,
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });
});
