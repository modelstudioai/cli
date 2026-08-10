import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { e2eFixturesDir, parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { MANAGED_AGENT_ROUTES } from "./topic-routes.ts";

/**
 * managed-agent：help / 缺参不依赖密钥；所有 mutation 命令的 --dry-run
 * 必须在构建 SDK runtime（凭证注入 / 联网 / 写盘）之前短路，因此同样不需要密钥。
 * 鉴权分层：离线命令（init/validate/state list|show|rm）auth: "none"；联网命令
 * 统一 auth: "apiKey" 硬门禁（见 managed-agent-auth-chain e2e）。
 * 真实集成（apply/destroy/session 流程）依赖工作区内的 agents.yaml 与远端资源，
 * 属批量场景，暂仅覆盖 dry-run 契约。
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
    // auth: "apiKey" 的凭证解析先于 run() 执行；注入假 key 让用例不依赖环境凭证，
    // 命令仍会在配置加载阶段因文件缺失短路，不产生任何网络请求。
    const { stderr, exitCode } = await runCommandE2e(
      MANAGED_AGENT_ROUTES,
      [
        "managed-agent",
        "skill-list",
        "--source",
        "all",
        "--file",
        "agents.e2e-missing.yaml",
        "--quiet",
      ],
      { DASHSCOPE_API_KEY: "sk-e2e-skill-list" },
    );
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

describe("e2e: managed-agent sync / migrate（bailian-only）", () => {
  const fixturesDir = join(e2eFixturesDir, "managed-agent");
  const agentsYaml = join(fixturesDir, "agents.yaml");
  const agentsSyncedYaml = join(fixturesDir, "agents-synced.yaml");
  const agentsClaudeYaml = join(fixturesDir, "agents-claude.yaml");

  test("managed-agent sync --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "sync",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--out|--force|--skip-missing-files/i);
    expect(stderr).toMatch(/--agent-id/i);
    expect(stderr).toMatch(/--types/i);
    expect(stderr).toMatch(/--environment-id/i);
    expect(stderr).toMatch(/--vault-id/i);
    expect(stderr).toMatch(/--file-id/i);
    expect(stderr).toMatch(/--skill-id/i);
  });

  test("sync 非法 --types 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "sync",
      "--types",
      "agent,sessions",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--types contains unsupported values: sessions/i);
  });

  test("sync --agent-id 搭配不含 agent 的 --types 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "sync",
      "--agent-id",
      "agent-e2e",
      "--types",
      "skill",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--agent-id requires --types to include agent/i);
  });

  test("sync --vault-id 搭配不含 vault 的 --types 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "sync",
      "--vault-id",
      "vault-e2e",
      "--types",
      "agent",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--vault-id requires --types to include vault/i);
  });

  test("sync 输出文件已存在且未 --force 时退出为用法错误 (2)", async () => {
    // auth: "apiKey" 的凭证解析先于 run() 执行；注入假 key 让用例不依赖环境凭证，
    // 命令仍会在覆盖写守卫处短路（先于构建 SDK runtime），不产生任何网络请求。
    const { stderr, exitCode } = await runCommandE2e(
      MANAGED_AGENT_ROUTES,
      ["managed-agent", "sync", "--out", agentsYaml, "--quiet"],
      { DASHSCOPE_API_KEY: "sk-e2e-sync" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/already exists/i);
  });

  test("sync --dry-run 仅回显计划，即使 --out 已存在也不报错", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "sync",
      "--dry-run",
      "--agent-id",
      "agent-e2e",
      "--skill-id",
      "skill-e2e",
      "--types",
      "agents,skills",
      "--out",
      agentsYaml,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_sync?: {
        provider?: string;
        out?: string;
        agent_id?: string;
        skill_id?: string;
        types?: string[];
      };
    }>(stdout);
    expect(data.would_sync?.provider).toBe("bailian");
    expect(data.would_sync?.out).toBe(agentsYaml);
    expect(data.would_sync?.agent_id).toBe("agent-e2e");
    expect(data.would_sync?.skill_id).toBe("skill-e2e");
    // 复数拼写归一化为 SDK 的单数资源类型
    expect(data.would_sync?.types).toEqual(["agent", "skill"]);
  });

  test("sync --agent-id 时 --types 自动补充 skill（关联技能联动导出）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "sync",
      "--dry-run",
      "--agent-id",
      "agent-e2e",
      "--types",
      "agent",
      "--out",
      "agents.synced.e2e-missing.yaml",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_sync?: { types?: string[] } }>(stdout);
    expect(data.would_sync?.types).toEqual(["agent", "skill"]);
  });

  test("managed-agent migrate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "migrate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--from|--to/i);
  });

  test("migrate 目标文件缺失时退出为用法错误 (2)", async () => {
    // auth: "apiKey" 的凭证解析先于 run() 执行；注入假 key 让用例不依赖环境凭证，
    // 命令仍会在目标文件守卫处短路，不产生任何网络请求。
    const { stderr, exitCode } = await runCommandE2e(
      MANAGED_AGENT_ROUTES,
      [
        "managed-agent",
        "migrate",
        "--from",
        agentsSyncedYaml,
        "--to",
        "agents.e2e-missing.yaml",
        "--quiet",
      ],
      { DASHSCOPE_API_KEY: "sk-e2e-migrate" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Target file .*agents\.e2e-missing\.yaml.*not found/i);
  });

  test("migrate 目标 provider 非 bailian 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      MANAGED_AGENT_ROUTES,
      ["managed-agent", "migrate", "--from", agentsSyncedYaml, "--to", agentsClaudeYaml, "--quiet"],
      { DASHSCOPE_API_KEY: "sk-e2e-migrate" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/only targets the bailian provider/i);
  });

  test("migrate --dry-run 仅回显计划，目标缺失也不报错", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "migrate",
      "--dry-run",
      "--from",
      agentsSyncedYaml,
      "--to",
      "agents.e2e-missing.yaml",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_migrate?: { from?: string; to?: string };
    }>(stdout);
    expect(data.would_migrate?.from).toBe(agentsSyncedYaml);
    expect(data.would_migrate?.to).toBe("agents.e2e-missing.yaml");
  });
});
