import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { e2eFixturesDir, parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { MANAGED_AGENT_ROUTES } from "./topic-routes.ts";

const AGENTS_DEPLOYMENT_YAML = join(e2eFixturesDir, "managed-agent", "agents-deployment.yaml");
const AGENTS_DEPLOYMENT_INVALID_YAML = join(
  e2eFixturesDir,
  "managed-agent",
  "agents-deployment-invalid.yaml",
);

const DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES = [
  "bailian.deployment.initial_events.message_required",
  "bailian.deployment.file.mount_path.required",
  "bailian.deployment.file.mount_path.duplicate",
];
const projectDirectories: string[] = [];

afterEach(async () => {
  for (const directory of projectDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

/**
 * managed-agent：help / 缺参不依赖密钥；所有 mutation 命令的 --dry-run
 * 必须在构建 SDK runtime（凭证注入 / 联网 / 写盘）之前短路，因此同样不需要密钥。
 * 鉴权分层：离线命令（init/validate/state list|show|rm）auth: "none"；联网命令
 * 统一 auth: "apiKey" 硬门禁（见 managed-agent-auth-chain e2e）。
 * 真实集成（apply/destroy/session 流程）依赖工作区内的 agents.yaml 与远端资源，
 * 属批量场景，暂仅覆盖 dry-run 契约。
 */

describe("e2e: managed-agent", () => {
  test("validate 接受原生 Bailian Deployment 配置", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "validate",
      "--file",
      AGENTS_DEPLOYMENT_YAML,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      valid?: boolean;
      diagnostics?: Array<{ code?: string; severity?: string }>;
    }>(stdout);
    expect(data.valid).toBe(true);
    expect(data.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "bailian.deployment.schedule_unsupported" }),
    );
  });

  test("plan --dry-run 通过 SDK planner 规划原生 Bailian Deployment", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "plan",
      "--dry-run",
      "--file",
      AGENTS_DEPLOYMENT_YAML,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      actions?: Array<{
        action?: string;
        address?: { provider?: string; type?: string; name?: string };
      }>;
      diagnostics?: Array<{ code?: string; severity?: string }>;
    }>(stdout);
    expect(data.actions).toContainEqual(
      expect.objectContaining({
        action: "create",
        address: {
          provider: "bailian",
          type: "deployment",
          name: "daily-report",
        },
      }),
    );
    expect(data.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "bailian.deployment.schedule_unsupported" }),
    );
  });

  test("validate 拒绝会产生空消息或无效挂载路径的 Bailian Deployment", async () => {
    const { stdout, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "validate",
      "--file",
      AGENTS_DEPLOYMENT_INVALID_YAML,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(1);
    const data = parseStdoutJson<{
      valid?: boolean;
      diagnostics?: Array<{ code?: string; severity?: string }>;
    }>(stdout);
    expect(data.valid).toBe(false);
    for (const diagnosticCode of DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES) {
      expect(data.diagnostics).toContainEqual(
        expect.objectContaining({ code: diagnosticCode, severity: "error" }),
      );
    }
  });

  test("plan --dry-run 在 Deployment 安全诊断失败时阻断计划", async () => {
    const { stdout, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "plan",
      "--dry-run",
      "--file",
      AGENTS_DEPLOYMENT_INVALID_YAML,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(1);
    const data = parseStdoutJson<{
      diagnostics?: Array<{ code?: string; severity?: string }>;
    }>(stdout);
    for (const diagnosticCode of DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES) {
      expect(data.diagnostics).toContainEqual(
        expect.objectContaining({ code: diagnosticCode, severity: "error" }),
      );
    }
  });

  test("managed-agent apply --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "apply",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--file|--provider|--yes/i);
    expect(stderr).not.toContain("--ci");
  });

  test("managed-agent init 不再暴露 Git 仓库脚手架", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "init",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).not.toContain("--git");
  });

  test("managed-agent project 暴露目录项目与共享版本管理子命令", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "project",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/init|validate|build|publish|workbench|version/i);
  });

  test("managed-agent project 完成 init、validate、build 与 version status 本地闭环", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "bailian-managed-agent-project-"));
    projectDirectories.push(projectRoot);
    const initialized = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "project",
      "init",
      "--project",
      projectRoot,
      "--provider",
      "bailian",
      "--output",
      "json",
    ]);
    expect(initialized.exitCode, initialized.stderr).toBe(0);
    expect(
      parseStdoutJson<{ baseline_version?: string }>(initialized.stdout).baseline_version,
    ).toMatch(/^[a-f0-9]{64}$/);

    const validated = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "project",
      "validate",
      "--project",
      projectRoot,
      "--output",
      "json",
    ]);
    expect(validated.exitCode, validated.stderr).toBe(0);
    expect(
      parseStdoutJson<{ diagnostics?: Array<{ severity?: string }> }>(validated.stdout).diagnostics,
    ).not.toContainEqual(expect.objectContaining({ severity: "error" }));

    const built = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "project",
      "build",
      "--project",
      projectRoot,
      "--yes",
      "--output",
      "json",
    ]);
    expect(built.exitCode, built.stderr).toBe(0);
    expect(await readFile(join(projectRoot, ".openagentpack/build/agents.yaml"), "utf8")).toContain(
      "assistant",
    );

    const status = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "project",
      "version",
      "status",
      "--project",
      projectRoot,
      "--output",
      "json",
    ]);
    expect(status.exitCode, status.stderr).toBe(0);
    expect(parseStdoutJson<{ enabled?: boolean }>(status.stdout).enabled).toBe(true);
    expect(await stat(join(projectRoot, ".openagentpack/state.json")).catch(() => null)).toBeNull();
  });

  test("managed-agent project version preview 缺少 --version-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "project",
      "version",
      "preview",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--version-id|Missing required/i);
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

  test("project workbench --dry-run 仅输出目录项目启动计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "project",
      "workbench",
      "--dry-run",
      "--project",
      "./agent-project",
      "--no-open",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_launch?: string;
      project_root?: string;
      port?: number;
    }>(stdout);
    expect(data.would_launch).toBe("workbench");
    expect(data.project_root).toBe("./agent-project");
    expect(data.port).toBe(4848);
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
