import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_PROFILE_CREATE_ROUTES } from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS, type MemoryDryRunBody } from "./shared.ts";

describe("e2e: memory profile create", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--name/i);
    expect(stderr).toMatch(/--description/i);
    expect(stderr).toMatch(/--attributes/i);
    expect(stderr).toMatch(/--plan-version/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --name 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--attributes",
      '[{"name":"age"}]',
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --attributes 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--name",
      "user_basic",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--attributes 非法 JSON 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--name",
      "user_basic",
      "--attributes",
      "[oops",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--attributes 传对象而非数组报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--name",
      "user_basic",
      "--attributes",
      '{"name":"age"}',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--plan-version 非法取值报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--name",
      "user_basic",
      "--attributes",
      '[{"name":"age"}]',
      "--plan-version",
      "ultra",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/pro|lite/i);
  });

  test("--dry-run 断言 endpoint / POST / name / attributes", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--name",
      "user_basic",
      "--attributes",
      '[{"name":"age","description":"年龄"},{"name":"hobby"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/profile_schemas$/);
    expect(data.method).toBe("POST");
    expect(data.request?.name).toBe("user_basic");
    expect(data.request?.attributes).toEqual([
      { name: "age", description: "年龄" },
      { name: "hobby" },
    ]);
    expect(data.request?.description).toBeUndefined();
    expect(data.request?.plan_version).toBeUndefined();
  });

  test("--dry-run 断言 --description/--plan-version/--memory-library-id 映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--name",
      "user_basic",
      "--description",
      "基础画像",
      "--attributes",
      '[{"name":"age","default_value":"18"}]',
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
    expect(data.request?.description).toBe("基础画像");
    expect(data.request?.plan_version).toBe("lite");
    expect(data.request?.memory_library_id).toBe("lib_test");
    expect(data.request?.attributes).toEqual([{ name: "age", default_value: "18" }]);
  });
});

// The live self-cleaning chain (create → list → show → update → get → delete)
// lives in memory-profile-delete.e2e.test.ts.
