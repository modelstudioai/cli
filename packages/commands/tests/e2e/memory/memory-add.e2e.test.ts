import { describe, expect, test } from "vite-plus/test";
import {
  isMemorySkillE2EReady,
  parseStdoutJson,
  runCommandE2e,
  runCommandHelp,
} from "../helpers.ts";
import { MEMORY_ADD_ROUTES, MEMORY_DELETE_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  memorySkillProjectId,
  memoryUserId,
  type MemoryAddBody,
  type MemoryDryRunBody,
  type MemoryNodeListBody,
} from "./shared.ts";

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
    expect(stderr).toMatch(/--skill-name/i);
    expect(stderr).toMatch(/--skill-description/i);
    expect(stderr).toMatch(/--skill-tags/i);
    expect(stderr).not.toMatch(/--timestamp/i);
    expect(stderr).toMatch(/--wait/i);
    expect(stderr).toMatch(/--library-id/i);
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

  test("--library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--content",
      "over-long library id",
      "--library-id",
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
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/add-async$/);
    expect(data.method).toBe("POST");
    expect(data.request?.user_id).toBe("user1");
    expect(data.request?.custom_content).toBe("dry-run 不入网");
    // Not provided → must stay out of the body entirely
    expect(data.request?.messages).toBeUndefined();
    expect(data.request?.meta_data).toBeUndefined();
    expect(data.request?.skill_name).toBeUndefined();
    expect(data.request).not.toHaveProperty("timestamp");
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

  test("--dry-run 断言 --meta-data/--project-id/--profile-schema/--library-id 映射", async () => {
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
      "--library-id",
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
    expect(data.request?.project_ids).toBeUndefined();
    expect(data.request?.profile_schema).toBe("schema_test");
    expect(data.request?.memory_library_id).toBe("lib_test");
  });

  test("--dry-run 断言可重复 --project-id 汇成 project_ids 数组", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--messages",
      '[{"role":"user","content":"多规则写入"}]',
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
  });

  test("--dry-run 断言 skill 三件套映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--content",
      "整理会议纪要",
      "--skill-name",
      "会议纪要整理",
      "--skill-description",
      "提取会议重点并生成摘要",
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
    expect(data.request?.skill_description).toBe("提取会议重点并生成摘要");
    expect(data.request?.skill_tags).toEqual(["办公", "总结"]);
    expect(data.request).not.toHaveProperty("timestamp");
  });

  test("skill 三件套只传部分报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--content",
      "部分 skill 参数",
      "--skill-name",
      "只有名字",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/skill-name|skill-description|skill-tags/i);
  });

  test("--wait 负数报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--content",
      "wait 负数",
      "--wait",
      "-1",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("内部参数 --timestamp 不对 CLI 开放", async () => {
    const { exitCode, stderr } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--content",
      "memory",
      "--timestamp",
      "1747278460",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Unknown flag.*--timestamp/i);
  });
  test("--messages role 非法报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--messages",
      '[{"role":"system","content":"不允许的角色"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/role/i);
  });

  test("--messages role=tool 缺 tool_call_id 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--messages",
      '[{"role":"tool","content":"{\\"ok\\":true}"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/tool_call_id/i);
  });

  test("--messages tool_calls 缺 function.name 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      memoryUserId(),
      "--messages",
      '[{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{}}]}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/function\.name/i);
  });

  test("--dry-run 断言 OpenAI 标准 toolcall 消息原样进 body", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--messages",
      '[{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"update_memory","arguments":"{\\"text\\":\\"明天穿衣服\\"}"}}]},{"role":"tool","tool_call_id":"call_1","content":"{\\"ok\\":true}"}]',
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    const messages = data.request?.messages ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]?.tool_calls?.[0]?.function?.name).toBe("update_memory");
    expect(messages[1]?.role).toBe("tool");
    expect(messages[1]?.tool_call_id).toBe("call_1");
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

describe.skipIf(!isMemorySkillE2EReady())("e2e: memory add (live skill)", () => {
  test("skill 闭环：add → export → update → export → search → delete → list", async () => {
    const userId = `cli-skill-${Date.now()}`;
    const marker = `vp-skill-${Date.now()}`;

    const addRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "add",
      ...memoryScopeCliArgs(),
      "--user-id",
      userId,
      "--content",
      `${marker} 会议纪要整理：自动提取会议重点并生成摘要`,
      "--project-id",
      memorySkillProjectId(),
      "--skill-name",
      `测试技能 ${marker}`,
      "--skill-description",
      "提取会议重点并生成摘要",
      "--skill-tags",
      "e2e-test",
      "--output",
      "json",
    ]);
    expect(addRes.exitCode, addRes.stderr).toBe(0);
    const added = parseStdoutJson<MemoryAddBody>(addRes.stdout);
    expect(added.event_id?.length ?? 0, addRes.stdout).toBeGreaterThan(0);
    const skillEvent = (added.events ?? []).find((event) => event.resource_type === "custom_skill");
    expect(skillEvent, addRes.stdout).toBeDefined();
    expect(skillEvent?.status, addRes.stdout).toMatch(/SUCCEEDED|SUCCESS/);

    // 自定义内容直存必须产生节点，并验证可检索与导出后自清理。
    const skillNodeId = (skillEvent?.result ?? [])
      .map((item) => item.memory_node_id)
      .find((nodeId): nodeId is string => !!nodeId && nodeId.length > 0);
    if (!skillNodeId) throw new Error("Custom skill storage returned no node ID.");

    try {
      const exportRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "skill",
        "export",
        "--workspace-id",
        process.env.BAILIAN_WORKSPACE_ID!,
        "--node-id",
        skillNodeId,
        "--output",
        "json",
      ]);
      expect(exportRes.exitCode, exportRes.stderr).toBe(0);
      const exported = parseStdoutJson<{
        memory_node: { content: string; skill_name: string; skill_tags: string[] };
      }>(exportRes.stdout);
      expect(exported.memory_node.content).toContain(marker);
      expect(exported.memory_node.content).not.toMatch(/^---/);
      expect(exported.memory_node.skill_name).toBe(`测试技能 ${marker}`);
      expect(exported.memory_node.skill_tags).toEqual(["e2e-test"]);
      const updateRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "update",
        ...memoryScopeCliArgs(),
        "--node-id",
        skillNodeId,
        "--content",
        `${marker} 更新后的会议纪要流程`,
        "--skill-name",
        `更新技能 ${marker}`,
        "--skill-description",
        "更新后的摘要说明",
        "--skill-tags",
        "updated",
        "--skill-tags",
        "summary",
        "--output",
        "json",
      ]);
      expect(updateRes.exitCode, updateRes.stderr).toBe(0);
      const updatedExport = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "skill",
        "export",
        "--workspace-id",
        process.env.BAILIAN_WORKSPACE_ID!,
        "--node-id",
        skillNodeId,
        "--output",
        "json",
      ]);
      expect(updatedExport.exitCode, updatedExport.stderr).toBe(0);
      expect(
        parseStdoutJson<{ memory_node: unknown }>(updatedExport.stdout).memory_node,
      ).toMatchObject({
        content: `${marker} 更新后的会议纪要流程`,
        skill_name: `更新技能 ${marker}`,
        skill_description: "更新后的摘要说明",
        skill_tags: ["updated", "summary"],
      });
      const searchRes = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "search",
        ...memoryScopeCliArgs(),
        "--user-id",
        userId,
        "--query",
        marker,
        "--project-id",
        memorySkillProjectId(),
        "--memory-types",
        "skill",
        "--min-score",
        "0",
        "--plan-version",
        "lite",
        "--output",
        "json",
      ]);
      expect(searchRes.exitCode, searchRes.stderr).toBe(0);
      const searched = parseStdoutJson<MemoryNodeListBody>(searchRes.stdout);
      expect(
        (searched.memory_nodes ?? []).some((node) => node.memory_node_id === skillNodeId),
        searchRes.stdout,
      ).toBe(true);
    } finally {
      const cleanup = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "delete",
        ...memoryScopeCliArgs(),
        "--node-id",
        skillNodeId,
        "--yes",
        "--output",
        "json",
      ]);
      expect(cleanup.exitCode, cleanup.stderr).toBe(0);
      const afterDelete = await runCommandE2e(MEMORY_DELETE_ROUTES, [
        "memory",
        "list",
        ...memoryScopeCliArgs(),
        "--user-id",
        userId,
        "--project-id",
        memorySkillProjectId(),
        "--output",
        "json",
      ]);
      expect(afterDelete.exitCode, afterDelete.stderr).toBe(0);
      const remaining = parseStdoutJson<MemoryNodeListBody>(afterDelete.stdout);
      expect(remaining.memory_nodes, afterDelete.stdout).toEqual([]);
      expect(remaining.total, afterDelete.stdout).toBe(0);
    }
  }, 240_000);
});
