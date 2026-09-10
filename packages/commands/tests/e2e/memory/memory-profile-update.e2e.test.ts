import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_PROFILE_UPDATE_ROUTES } from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS, type MemoryDryRunBody } from "./shared.ts";

describe("e2e: memory profile update", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--schema-id/i);
    expect(stderr).toMatch(/--name/i);
    expect(stderr).toMatch(/--description/i);
    expect(stderr).toMatch(/--attributes-operations/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --schema-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--name",
      "user_basic_v2",
    ]);
    expect(exitCode).toBe(2);
  });

  test("三个可改字段全不传报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--attributes-operations/i);
  });

  test("--attributes-operations 非法 JSON 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--attributes-operations",
      "[oops",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--attributes-operations 传对象而非数组报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--attributes-operations",
      '{"op":"add","name":"plan"}',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("op 非法取值报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--attributes-operations",
      '[{"op":"upsert","name":"plan"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/op/i);
  });

  test("op=add 缺 name 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--attributes-operations",
      '[{"op":"add","description":"套餐"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/name/i);
  });

  test("op=delete 缺 attribute_id 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--attributes-operations",
      '[{"op":"delete"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/attribute_id/i);
  });

  test("op=update 缺 attribute_id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--attributes-operations",
      '[{"op":"update","name":"plan"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 endpoint / PATCH / name 与 description", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--name",
      "user_basic_v2",
      "--description",
      "升级后的画像",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/profile_schemas\/schema_test$/);
    expect(data.method).toBe("PATCH");
    expect(data.request?.name).toBe("user_basic_v2");
    expect(data.request?.description).toBe("升级后的画像");
    expect(data.request?.attributes_operations).toBeUndefined();
  });

  test("--dry-run 断言三种 op 原样进 body（含 default_value: null）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--attributes-operations",
      '[{"op":"add","name":"plan","default_value":"free"},' +
        '{"op":"update","attribute_id":"attr_1","default_value":null},' +
        '{"op":"delete","attribute_id":"attr_2"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.attributes_operations).toEqual([
      { op: "add", name: "plan", default_value: "free" },
      { op: "update", attribute_id: "attr_1", default_value: null },
      { op: "delete", attribute_id: "attr_2" },
    ]);
  });

  test("--dry-run 断言 memory_library_id 进 body 而不是 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema_test",
      "--name",
      "user_basic_v2",
      "--memory-library-id",
      "lib_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    // UpdateProfileSchema is the only profile endpoint carrying the library in the body
    expect(data.request?.memory_library_id).toBe("lib_test");
    expect(data.endpoint).not.toMatch(/memory_library_id/);
  });
});

// The live update path is exercised inside the self-cleaning chain in
// memory-profile-delete.e2e.test.ts, which owns the schema it mutates.
