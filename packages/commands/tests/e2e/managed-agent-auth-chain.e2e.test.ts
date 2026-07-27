import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { e2eFixturesDir, parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { MANAGED_AGENT_ROUTES } from "./topic-routes.ts";

/**
 * managed-agent 凭证链 e2e：验证 bl 自有配置体系（config 写入 / 命名 Profile /
 * logout）与错误映射如何流入 SDK 引擎。全部离线：凭证门禁用 `managed-agent plan`
 * 验证（provider-aware：空 state 不发网络请求，但仍按目标 provider 校验凭证）；
 * `validate` / `state list` / `plan --no-refresh` 属离线命令，无凭证也必须可用。
 * 配置一律通过 BAILIAN_CONFIG_DIR 指向临时目录，绝不触碰真实用户配置。
 */

const ROUTES = {
  ...MANAGED_AGENT_ROUTES,
  "auth logout": "authLogout",
};

const AGENTS_YAML = join(e2eFixturesDir, "managed-agent", "agents.yaml");
const AGENTS_YAML_INVALID = join(e2eFixturesDir, "managed-agent", "agents-invalid.yaml");
const AGENTS_YAML_MULTI = join(e2eFixturesDir, "managed-agent", "agents-multi.yaml");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 新建隔离配置目录并写入 config.json；返回子进程 env 覆盖（清空外部凭证 env）。 */
function makeConfigEnv(config: Record<string, unknown>): NodeJS.ProcessEnv {
  const configDir = mkdtempSync(join(tmpdir(), "bl-managed-agent-auth-"));
  tempDirs.push(configDir);
  writeFileSync(join(configDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  return {
    BAILIAN_CONFIG_DIR: configDir,
    DASHSCOPE_API_KEY: "",
    DASHSCOPE_BASE_URL: "",
    BAILIAN_BASE_URL: "",
    BAILIAN_WORKSPACE_ID: "",
  };
}

function validateArgs(file: string): string[] {
  return ["managed-agent", "validate", "--file", file, "--quiet"];
}

/** plan 是凭证门禁命令：空 state 下不发网络，但仍按目标 provider 校验凭证。 */
function planArgs(file: string): string[] {
  return ["managed-agent", "plan", "--file", file, "--quiet"];
}

/** 隔离宿主机的 ~/.agents/config.json，避免它强制覆盖 provider 凭证 env。 */
function isolatedAgentsConfigEnv(): NodeJS.ProcessEnv {
  return { AGENTS_CONFIG_PATH: join(tmpdir(), "bl-e2e-no-agents-config.json") };
}

/** 分配一个刚释放的本地端口，连接必然 ECONNREFUSED，用于网络错误场景。 */
async function closedPort(): Promise<number> {
  const server = createServer();
  try {
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to allocate a closed port");
    }
    return address.port;
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe("e2e: managed-agent 凭证链（config 写入 / Profile / logout / 错误映射）", () => {
  test("config.json 写入的 api_key 流入引擎，plan 离线通过", async () => {
    const env = makeConfigEnv({ api_key: "sk-e2e-config-write" });
    const { stderr, exitCode } = await runCommandE2e(ROUTES, planArgs(AGENTS_YAML), env);
    expect(exitCode, stderr).toBe(0);
  });

  test("active_config 指向的命名 Profile 提供凭证时通过", async () => {
    const env = makeConfigEnv({
      work: { api_key: "sk-e2e-profile-work" },
      active_config: "work",
    });
    const { stderr, exitCode } = await runCommandE2e(ROUTES, planArgs(AGENTS_YAML), env);
    expect(exitCode, stderr).toBe(0);
  });

  test("active_config 切到无凭证 Profile 时报统一 AUTH 错误 (3)", async () => {
    const env = makeConfigEnv({
      work: { api_key: "sk-e2e-profile-work" },
      empty: {},
      active_config: "empty",
    });
    const { stderr, exitCode } = await runCommandE2e(ROUTES, planArgs(AGENTS_YAML), env);
    expect(exitCode).toBe(3);
    expect(stderr).toMatch(/auth login|API key/i);
  });

  test("auth logout 清除凭证后 plan 报 AUTH，而非用残留凭证", async () => {
    const env = makeConfigEnv({ api_key: "sk-e2e-before-logout" });

    const before = await runCommandE2e(ROUTES, planArgs(AGENTS_YAML), env);
    expect(before.exitCode, before.stderr).toBe(0);

    const logout = await runCommandE2e(ROUTES, ["auth", "logout"], env);
    expect(logout.exitCode, logout.stderr).toBe(0);

    const after = await runCommandE2e(ROUTES, planArgs(AGENTS_YAML), env);
    expect(after.exitCode).toBe(3);
    expect(after.stderr).toMatch(/auth login|API key/i);
  });

  test("agents.yaml schema 错误映射为 USAGE (2)，不透传原始 zod dump", async () => {
    const env = makeConfigEnv({});
    const { stderr, exitCode } = await runCommandE2e(
      ROUTES,
      validateArgs(AGENTS_YAML_INVALID),
      env,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/agents/i);
    expect(stderr).not.toMatch(/"code":\s*"invalid_type"/);
  });

  test("validate --output json 成功路径 stdout 为单个合法 JSON", async () => {
    const env = makeConfigEnv({ api_key: "sk-e2e-config-write" });
    const { stdout, stderr, exitCode } = await runCommandE2e(
      ROUTES,
      ["managed-agent", "validate", "--file", AGENTS_YAML, "--output", "json"],
      env,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ valid?: boolean; diagnostics?: unknown[] }>(stdout);
    expect(data.valid).toBe(true);
    expect(Array.isArray(data.diagnostics)).toBe(true);
  });

  test("SDK fetch 连不上时映射为 NETWORK (6) + errno hint，不降级成 GENERAL", async () => {
    const port = await closedPort();
    const env = makeConfigEnv({
      api_key: "sk-e2e-network",
      base_url: `http://127.0.0.1:${port}`,
    });
    const { stderr, exitCode } = await runCommandE2e(
      ROUTES,
      ["managed-agent", "session", "get", "--session-id", "sess_net", "--file", AGENTS_YAML],
      env,
    );
    expect(exitCode).toBe(6);
    expect(stderr).toMatch(/Network request failed/i);
    expect(stderr).toMatch(/ECONNREFUSED|refused/i);
  });
});

describe("e2e: managed-agent 鉴权分层（离线命令免登录 / provider-aware 按需校验）", () => {
  test("validate 无任何凭证也离线通过 (0)", async () => {
    const env = makeConfigEnv({});
    const { stderr, exitCode } = await runCommandE2e(ROUTES, validateArgs(AGENTS_YAML), env);
    expect(exitCode, stderr).toBe(0);
  });

  test("state list 无任何凭证也离线通过 (0)，stdout 为合法 JSON", async () => {
    const env = makeConfigEnv({});
    const { stdout, stderr, exitCode } = await runCommandE2e(
      ROUTES,
      ["managed-agent", "state", "list", "--file", AGENTS_YAML, "--output", "json"],
      env,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ resources?: unknown[] }>(stdout);
    expect(Array.isArray(data.resources)).toBe(true);
  });

  test("plan --no-refresh 无任何凭证也离线通过 (0)", async () => {
    const env = makeConfigEnv({});
    const { stderr, exitCode } = await runCommandE2e(
      ROUTES,
      [...planArgs(AGENTS_YAML), "--no-refresh"],
      env,
    );
    expect(exitCode, stderr).toBe(0);
  });

  test("多 provider 下 plan --provider claude 只需 claude 凭证，bailian 未登录不阻塞 (0)", async () => {
    const env = {
      ...makeConfigEnv({}),
      ...isolatedAgentsConfigEnv(),
      ANTHROPIC_API_KEY: "sk-ant-e2e-scope",
      CLAUDE_API_KEY: "",
    };
    const { stderr, exitCode } = await runCommandE2e(
      ROUTES,
      [...planArgs(AGENTS_YAML_MULTI), "--provider", "claude"],
      env,
    );
    expect(exitCode, stderr).toBe(0);
  });

  test("plan --provider claude 缺 claude key 时报 AUTH (3)，hint 指向 ANTHROPIC_API_KEY", async () => {
    const env = {
      ...makeConfigEnv({ api_key: "sk-e2e-bailian-present" }),
      ...isolatedAgentsConfigEnv(),
      ANTHROPIC_API_KEY: "",
      CLAUDE_API_KEY: "",
    };
    const { stderr, exitCode } = await runCommandE2e(
      ROUTES,
      [...planArgs(AGENTS_YAML_MULTI), "--provider", "claude"],
      env,
    );
    expect(exitCode).toBe(3);
    expect(stderr).toMatch(/ANTHROPIC_API_KEY/);
  });
});
