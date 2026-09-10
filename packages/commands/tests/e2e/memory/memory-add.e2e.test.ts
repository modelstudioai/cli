import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_ADD_ROUTES } from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS, memoryUserId, type MemoryDryRunBody } from "./shared.ts";

describe("e2e: memory add", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--user-id/i);
    expect(stderr).toMatch(/--messages/i);
    expect(stderr).toMatch(/--content/i);
    expect(stderr).toMatch(/--profile-schema/i);
    expect(stderr).toMatch(/--meta-data/i);
    expect(stderr).toMatch(/--project-id/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --user-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--content",
      "仅内容无用户",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --messages 与 --content 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/messages|content/i);
  });

  test("--user-id 65 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "u".repeat(65),
      "--content",
      "over-long user id",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--content 513 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--content",
      "x".repeat(513),
    ]);
    expect(exitCode).toBe(2);
  });

  test("--memory-library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--content",
      "over-long library id",
      "--memory-library-id",
      "l".repeat(33),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--messages 非法 JSON 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--messages",
      "not-json",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--messages 传对象而非数组报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--messages",
      '{"role":"user","content":"hi"}',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--messages 超过 50 条报 USAGE (2)", async () => {
    const messages = Array.from({ length: 51 }, (_unused, index) => ({
      role: "user",
      content: `turn ${index}`,
    }));
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--messages",
      JSON.stringify(messages),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--meta-data 非法 JSON 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--content",
      "meta 格式错误",
      "--meta-data",
      "{oops",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--meta-data 传数组而非对象报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--content",
      "meta 类型错误",
      "--meta-data",
      '["a","b"]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run + --content 断言 endpoint / POST / custom_content", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--content",
      "dry-run 不入网",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/^https:\/\/ws_test\.cn-beijing\.maas\.aliyuncs\.com\//);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/add$/);
    expect(data.method).toBe("POST");
    expect(data.request?.user_id).toBe("user1");
    expect(data.request?.custom_content).toBe("dry-run 不入网");
    // Not provided → must stay out of the body entirely
    expect(data.request?.messages).toBeUndefined();
    expect(data.request?.meta_data).toBeUndefined();
  });

  test("--dry-run + --messages 断言 messages 原样进 body", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--messages",
      '[{"role":"user","content":"我喜欢旅行"},{"role":"assistant","content":"记住了"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.messages).toEqual([
      { role: "user", content: "我喜欢旅行" },
      { role: "assistant", content: "记住了" },
    ]);
    expect(data.request?.custom_content).toBeUndefined();
  });

  test("--dry-run 断言 --meta-data/--project-id/--profile-schema/--memory-library-id 映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--content",
      "参加了 WAIC",
      "--meta-data",
      '{"location":"上海","year":2026}',
      "--project-id",
      "proj_test",
      "--profile-schema",
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
    expect(data.request?.meta_data).toEqual({ location: "上海", year: 2026 });
    expect(data.request?.project_id).toBe("proj_test");
    expect(data.request?.profile_schema).toBe("schema_test");
    expect(data.request?.memory_library_id).toBe("lib_test");
  });

  test("--dry-run 同传 --content 与 --messages 时两者都进 body（服务端择一）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--content",
      "content wins",
      "--messages",
      '[{"role":"user","content":"ignored"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.request?.custom_content).toBe("content wins");
    expect(data.request?.messages).toHaveLength(1);
  });
});

// The live self-cleaning chain (add → list → search → update → delete) lives in
// memory-delete.e2e.test.ts.
