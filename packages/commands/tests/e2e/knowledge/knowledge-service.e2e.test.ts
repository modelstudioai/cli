// service group, 7 commands: the static group covers help/missing-args/dry-run per
// command; the live group runs the full lifecycle (create → scalar update → get
// assertion → search --agent-version beta smoke → deploy → copy → delete×2).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_SERVICE_ROUTES } from "../topic-routes.ts";

interface DryRunBody {
  endpoint?: string;
  request?: Record<string, unknown>;
}

describe("e2e: knowledge service list", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--scene/i);
    expect(stderr).toMatch(/--status/i);
    expect(stderr).toMatch(/--index-id/i);
  });

  test("缺 --scene 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--scene 非法值报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--scene",
      "qa",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--status 非法值报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--scene",
      "chat",
      "--status",
      "online",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--page-size 101 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--scene",
      "chat",
      "--page-size",
      "101",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 body agent_scene 与分页走 body", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--scene",
      "chat",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/app\/list/);
    expect(data.request?.agent_scene).toBe("chat");
    expect(data.request?.pipeline_id).toBe("idx_test");
    expect(data.request?.page_number).toBe(1);
  });

  test("--dry-run 断言 --status/--name/--agent-id 的 snake_case body 映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--scene",
      "search",
      "--status",
      "deployed",
      "--name",
      "demo",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.agent_status).toBe("deployed");
    expect(data.request?.agent_name).toBe("demo");
    expect(data.request?.agent_id).toBe("aid_test");
  });
});

describe("e2e: knowledge service get / create / copy", () => {
  test("get: 缺 --agent-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "get",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("get: --dry-run 断言 agent_version 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "get",
      "--agent-id",
      "aid_test",
      "--agent-version",
      "beta",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/rag\/app\/get/);
    expect(data.request?.agent_version).toBe("beta");
  });

  test("create: 缺 --scene 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "create",
      "--name",
      "demo",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("create: --scene 非法值报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "create",
      "--name",
      "demo",
      "--scene",
      "qa",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("create: --name 201 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "create",
      "--name",
      "x".repeat(201),
      "--scene",
      "chat",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("create: --description 1001 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "create",
      "--name",
      "demo",
      "--scene",
      "chat",
      "--description",
      "x".repeat(1001),
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("create: --dry-run + --index-id 断言最简 kb_search_configs", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "create",
      "--name",
      "demo",
      "--scene",
      "search",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    const agentConfig = data.request?.agent_config as
      | { kb_search_configs?: Array<{ id: string }> }
      | undefined;
    expect(agentConfig?.kb_search_configs).toEqual([{ id: "idx_test" }]);
  });

  test("copy: --dry-run 断言 body agent_id", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "copy",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/rag\/app\/copy/);
    expect(data.request?.agent_id).toBe("aid_test");
  });
});

describe("e2e: knowledge service update", () => {
  test("无修改项报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/nothing to update/i);
  });

  test("--config-file 与标量 config flag 互斥 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--temperature",
      "0.5",
      "--config-file",
      "/tmp/whatever.json",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("已发布版本 + config 修改前置拦截 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--agent-version",
      "1",
      "--temperature",
      "0.5",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/beta draft/i);
  });

  test("--temperature 2.5 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--temperature",
      "2.5",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--policy 非法值报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--policy",
      "fast",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--max-llm-calls 31 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--max-llm-calls",
      "31",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--enable-session-file 非 true/false 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--enable-session-file",
      "maybe",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--name 201 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--name",
      "x".repeat(201),
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--description 1001 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--description",
      "x".repeat(1001),
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--config-file 非法 JSON 报 USAGE (2)", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "svc-update-e2e-"));
    const badJson = join(fixtureDir, "bad.json");
    writeFileSync(badJson, "{not json");
    const { exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--config-file",
      badJson,
      "--workspace-id",
      "ws_test",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run + --version-desc 断言 body 与标量合并说明", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      "aid_test",
      "--temperature",
      "0.7",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody & { note?: string }>(stdout);
    expect(data.endpoint).toMatch(/rag\/app\/update/);
    const agentConfig = data.request?.agent_config as { temperature?: number } | undefined;
    expect(agentConfig?.temperature).toBe(0.7);
    expect(data.note).toMatch(/merged/i);
  });
});

describe("e2e: knowledge service deploy / delete (危险)", () => {
  test("deploy: 非 TTY 无 --yes 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "deploy",
      "--agent-id",
      "aid_test",
      "--api-key",
      "sk-fake",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--yes/);
  });

  test("deploy: --dry-run 断言 body", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "deploy",
      "--agent-id",
      "aid_test",
      "--version-desc",
      "v1 desc",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/rag\/app\/deploy/);
    expect(data.request?.agent_version_desc).toBe("v1 desc");
  });

  test("delete: 非 TTY 无 --yes 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "delete",
      "--agent-id",
      "aid_test",
      "--api-key",
      "sk-fake",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--yes/);
  });
});

// Path gotcha: the actual gateway prefix is rag/app/; the rag/agent/ prefix from the
// public API docs is not routed (it returns console HTML).
describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge service 生命周期 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("create → update → get 断言 → deploy → copy → delete×2", async () => {
    const serviceName = `e2e-svc-${Date.now() % 100000000}`;

    // 1) create (chat scene, no knowledge base bound — verifies server defaults)
    const createRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "create",
      "--name",
      serviceName,
      "--scene",
      "chat",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(createRun.exitCode, createRun.stderr).toBe(0);
    const agentId = createRun.stdout.trim().split("\n").pop()!;
    expect(agentId).toMatch(/^aid-/);

    // 1.5) list asserts the new agent shows up (filtered by agent_id)
    const listRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "list",
      "--scene",
      "chat",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(listRun.exitCode, listRun.stderr).toBe(0);
    expect(listRun.stdout.trim().split("\n")).toContain(agentId);

    // 2) scalar update (read-merge-write onto the beta draft)
    const updateRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "update",
      "--agent-id",
      agentId,
      "--temperature",
      "0.55",
      "--workspace-id",
      workspaceId,
    ]);
    expect(updateRun.exitCode, updateRun.stderr).toBe(0);

    // 3) get asserts the scalars landed on beta
    const getRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "get",
      "--agent-id",
      agentId,
      "--agent-version",
      "beta",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(getRun.exitCode, getRun.stderr).toBe(0);
    const getData = parseStdoutJson<{
      data: { agent_details: Array<{ agent_config?: { temperature?: number } }> };
    }>(getRun.stdout);
    expect(getData.data.agent_details[0]?.agent_config?.temperature).toBe(0.55);

    // 4) deploy (--yes non-interactive)
    const deployRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "deploy",
      "--agent-id",
      agentId,
      "--yes",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(deployRun.exitCode, deployRun.stderr).toBe(0);
    expect(deployRun.stdout.trim().split("\n").pop()).toBe("1");

    // 4.5) bare get (no --agent-version) returns all versions: beta draft + published 1
    const allVersionsRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "get",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(allVersionsRun.exitCode, allVersionsRun.stderr).toBe(0);
    const allVersionsData = parseStdoutJson<{
      data: { agent_details: Array<{ agent_version?: string }> };
    }>(allVersionsRun.stdout);
    const versions = allVersionsData.data.agent_details.map((detail) => detail.agent_version);
    expect(versions).toContain("beta");
    expect(versions).toContain("1");

    // 5) copy
    const copyRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
      "knowledge",
      "service",
      "copy",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(copyRun.exitCode, copyRun.stderr).toBe(0);
    const copiedAgentId = copyRun.stdout.trim().split("\n").pop()!;
    expect(copiedAgentId).toMatch(/^aid-/);
    expect(copiedAgentId).not.toBe(agentId);

    // 6) delete both (idempotent soft delete)
    for (const idToDelete of [copiedAgentId, agentId]) {
      const deleteRun = await runCommandE2e(KNOWLEDGE_SERVICE_ROUTES, [
        "knowledge",
        "service",
        "delete",
        "--agent-id",
        idToDelete,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
      expect(deleteRun.exitCode, deleteRun.stderr).toBe(0);
    }
  }, 300_000);
});
