import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { MANAGED_AGENT_ROUTES } from "./topic-routes.ts";

/**
 * managed-agent：help / 缺参不依赖密钥；所有 mutation 命令的 --dry-run
 * 必须在构建 SDK runtime（凭证注入 / 联网 / 写盘）之前短路，因此同样不需要密钥。
 * 真实集成（apply/destroy/session 流程）依赖工作区内的 agents.yaml 与远端资源，
 * 属于批量场景，暂仅覆盖 dry-run 契约。
 */

describe("e2e: managed-agent", () => {
  test("managed-agent apply --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "apply",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--file|--provider|--yes/i);
  });

  test("managed-agent session delete 缺少 --session-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "session",
      "delete",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--session-id|Missing required/i);
  });

  test("managed-agent session send 缺少 --message 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "session",
      "send",
      "--session-id",
      "sess_e2e",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--message|Missing required/i);
  });

  test("managed-agent skill-list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "skill-list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--source|--provider|--file/i);
  });

  test("managed-agent skill-list 非法 --source 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "skill-list",
      "--source",
      "builtin",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--source must be one of: custom, official/i);
  });

  test("managed-agent skill-list --source all 通过参数校验（缺配置文件时才失败）", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "skill-list",
      "--source",
      "all",
      "--file",
      "agents.e2e-missing.yaml",
      "--quiet",
    ]);
    // all 是合法值：不应报 --source 用法错误，而是走到配置加载后因文件缺失退出
    expect(exitCode).toBe(2);
    expect(stderr).not.toMatch(/--source must be one of/i);
    expect(stderr).toMatch(/File not found.*agents\.e2e-missing\.yaml/i);
  });
});

describe("e2e: managed-agent（--dry-run 短路，不联网不写盘）", () => {
  test("init --dry-run 仅输出计划，不创建文件", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "init",
      "--dry-run",
      "--file",
      "agents.e2e-dry-run.yaml",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_create?: string; provider?: string }>(stdout);
    expect(data.would_create).toBe("agents.e2e-dry-run.yaml");
    expect(data.provider).toBe("bailian");
  });

  test("apply --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "apply",
      "--dry-run",
      "--yes",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_apply?: { provider?: string } }>(stdout);
    expect(data.would_apply?.provider).toBe("all");
  });

  test("destroy --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "destroy",
      "--dry-run",
      "--cascade",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_destroy?: { cascade?: boolean } }>(stdout);
    expect(data.would_destroy?.cascade).toBe(true);
  });

  test("session create --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "session",
      "create",
      "--dry-run",
      "--agent",
      "assistant",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_create_session?: { agent?: string } }>(stdout);
    expect(data.would_create_session?.agent).toBe("assistant");
  });

  test("session delete --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "session",
      "delete",
      "--dry-run",
      "--session-id",
      "sess_e2e",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_delete_session?: string }>(stdout);
    expect(data.would_delete_session).toBe("sess_e2e");
  });

  test("session send --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "session",
      "send",
      "--dry-run",
      "--session-id",
      "sess_e2e",
      "--message",
      "干跑",
      "--no-stream",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_send?: { session_id?: string; message?: string; mode?: string };
    }>(stdout);
    expect(data.would_send?.session_id).toBe("sess_e2e");
    expect(data.would_send?.message).toBe("干跑");
    expect(data.would_send?.mode).toBe("polling");
  });

  test("session run --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "session",
      "run",
      "--dry-run",
      "--prompt",
      "干跑",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_run?: { prompt?: string; mode?: string };
    }>(stdout);
    expect(data.would_run?.prompt).toBe("干跑");
    expect(data.would_run?.mode).toBe("streaming");
  });

  test("state rm --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "state",
      "rm",
      "--dry-run",
      "--address",
      "bailian.agent.assistant",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_remove?: string }>(stdout);
    expect(data.would_remove).toBe("bailian.agent.assistant");
  });

  test("state import --dry-run 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "state",
      "import",
      "--dry-run",
      "--address",
      "bailian.agent.assistant",
      "--remote-id",
      "agent-e2e",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_import?: string; remote_id?: string }>(stdout);
    expect(data.would_import).toBe("bailian.agent.assistant");
    expect(data.remote_id).toBe("agent-e2e");
  });
});
