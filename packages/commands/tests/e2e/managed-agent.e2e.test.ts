import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  LocalFileStateBackend,
  planProjectWithStateBackend,
  resolveProjectConfig,
  type ResourceAddress,
} from "@openagentpack/sdk";
import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";
import { e2eFixturesDir, parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { MANAGED_AGENT_ROUTES } from "./topic-routes.ts";

const AGENTS_DEPLOYMENT_YAML = join(e2eFixturesDir, "managed-agent", "agents-deployment.yaml");
const AGENTS_DEPLOYMENT_INVALID_YAML = join(
  e2eFixturesDir,
  "managed-agent",
  "agents-deployment-invalid.yaml",
);
const AGENTS_YAML = join(e2eFixturesDir, "managed-agent", "agents.yaml");
const LOCAL_SKILL_ZIP_BASE64 =
  "UEsDBAoAAAAIAGBoIV3X45MGOwAAAEoAAAAIAAAAU0tJTEwubWTT1dXlykvMTbVSyMlPTszRLUotyC8q4UpJLU4uyiwoyczPs1LwAckoQGQUirMzc3K4dIHalKESQRAtAFBLAwQKAAAAAABgaCFdAAAAAAAAAAAAAAAACAAAAHNjcmlwdHMvUEsDBAoAAAAIAGBoIV3vn4RoIQAAAB8AAAAOAAAAc2NyaXB0cy9ydW4uanNLrSjILypRSM7PKy5RKCrNU7BV0NBUsLVTKCkqTbXmAgBQSwECFAAKAAAACABgaCFd1+OTBjsAAABKAAAACAAAAAAAAAAAAAAAAAAAAAAAU0tJTEwubWRQSwECFAAKAAAAAABgaCFdAAAAAAAAAAAAAAAACAAAAAAAAAAAABAAAABhAAAAc2NyaXB0cy9QSwECFAAKAAAACABgaCFd75+EaCEAAAAfAAAADgAAAAAAAAAAAAAAAACHAAAAc2NyaXB0cy9ydW4uanNQSwUGAAAAAAMAAwCoAAAA1AAAAAAA";

const DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES = [
  "bailian.deployment.initial_events.message_required",
  "bailian.deployment.file.mount_path.required",
  "bailian.deployment.file.mount_path.duplicate",
];

async function writeLocalSkillDirectory(parentDirectory: string): Promise<string> {
  const skillDirectory = join(parentDirectory, "local-report");
  await mkdir(join(skillDirectory, "scripts"), { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    `---
name: local-report
description: Local report skill
---
# Local Report
`,
    "utf8",
  );
  await writeFile(join(skillDirectory, "scripts", "run.js"), "export const run = true;\n", "utf8");
  return skillDirectory;
}

async function writeLocalSkillZip(parentDirectory: string): Promise<string> {
  const skillZipPath = join(parentDirectory, "local-report.zip");
  await writeFile(skillZipPath, Buffer.from(LOCAL_SKILL_ZIP_BASE64, "base64"));
  return skillZipPath;
}

async function seedTrackedResources(
  configPath: string,
  addresses: ResourceAddress[],
): Promise<void> {
  const loaded = await resolveProjectConfig(configPath);
  const stateBackend = new LocalFileStateBackend({ configPath });
  const stateScope = { projectId: loaded.projectName ?? basename(dirname(configPath)) };
  const backendInput = {
    projectName: loaded.projectName,
    config: loaded.config,
    configPath: loaded.configPath,
    providers: loaded.config.providers,
    stateBackend,
    stateScope,
  };
  const planned = await planProjectWithStateBackend(backendInput, {
    provider: "bailian",
    refresh: false,
    quiet: true,
  });
  await stateBackend.write(stateScope, (state) => {
    for (const address of addresses) {
      const action = planned.plan.actions.find(
        (entry) =>
          entry.address.provider === address.provider &&
          entry.address.type === address.type &&
          entry.address.name === address.name,
      );
      const contentHash = (action?.after as { content_hash?: string } | undefined)?.content_hash;
      if (action?.action !== "create" || !contentHash) {
        throw new Error(`Cannot seed tracked resource ${address.type}.${address.name}.`);
      }
      state.setResource({
        address,
        remote_id: `${address.type}_${address.name}_e2e`,
        content_hash: contentHash,
        desired_hash: contentHash,
      });
    }
  });
}

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
      diagnostics?: Array<{ code?: string; message?: string; severity?: string }>;
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
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
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
      diagnostics?: Array<{ code?: string; message?: string; severity?: string }>;
    }>(stdout);
    expect(data.valid).toBe(false);
    const errorDiagnostics =
      data.diagnostics?.filter((diagnostic) => diagnostic.severity === "error") ?? [];
    const firstError = errorDiagnostics[0];
    expect(firstError?.code).toBeTruthy();
    expect(firstError?.message).toBeTruthy();
    expect(stderr).toContain(`[${firstError?.code}] ${firstError?.message}`);
    expect(stderr).toContain(`(+${errorDiagnostics.length - 1} more errors)`);
    expect(stderr).not.toMatch(/Validation failed with \d+ error/);
    for (const diagnosticCode of DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES) {
      expect(data.diagnostics).toContainEqual(
        expect.objectContaining({ code: diagnosticCode, severity: "error" }),
      );
    }
  });

  test("plan --dry-run 在 Deployment 安全诊断失败时阻断计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
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
      diagnostics?: Array<{ code?: string; message?: string; severity?: string }>;
    }>(stdout);
    const errorDiagnostics =
      data.diagnostics?.filter((diagnostic) => diagnostic.severity === "error") ?? [];
    const firstError = errorDiagnostics[0];
    expect(firstError?.code).toBeTruthy();
    expect(firstError?.message).toBeTruthy();
    expect(stderr).toContain(`[${firstError?.code}] ${firstError?.message}`);
    expect(stderr).toContain(`(+${errorDiagnostics.length - 1} more errors)`);
    expect(stderr).not.toContain("Plan contains errors.");
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
  });

  test("managed-agent apply 计划失败时在最终错误中保留首条诊断和剩余数量", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      MANAGED_AGENT_ROUTES,
      [
        "managed-agent",
        "apply",
        "--file",
        AGENTS_DEPLOYMENT_INVALID_YAML,
        "--no-refresh",
        "--yes",
        "--output",
        "json",
      ],
      {
        DASHSCOPE_API_KEY: "sk-e2e-apply-diagnostics",
        BAILIAN_BASE_URL: "http://127.0.0.1:1",
      },
    );

    expect(exitCode).toBe(1);
    for (const diagnosticCode of DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES) {
      expect(stderr).toContain(`[error] ${diagnosticCode}:`);
    }
    expect(stderr).toContain(`[${DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES[0]}]`);
    expect(stderr).toContain(`(+${DEPLOYMENT_SAFETY_DIAGNOSTIC_CODES.length - 1} more errors)`);
    expect(stderr).not.toContain("Cannot apply: resolve the errors above first.");
  });

  test("managed-agent apply 失败时在 text 和 JSON 最终错误中保留服务端原因", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-apply-error-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const server = http.createServer((_request, response) => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          code: "AGENT_E2E_FAILURE",
          message: "intentional apply failure",
          request_id: "req_apply_error_e2e",
        }),
      );
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address() as AddressInfo;
    const configSource = `version: "1"
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
    base_url: \${BAILIAN_BASE_URL}
defaults:
  provider: bailian
agents:
  apply-error:
    name: Apply Error
    model: qwen3.8-max
    instructions: Exercise the apply error path.
`;
    await writeFile(configPath, configSource, "utf8");
    const baseArgs = [
      "managed-agent",
      "apply",
      "--file",
      configPath,
      "--provider",
      "bailian",
      "--yes",
    ];
    const env = {
      DASHSCOPE_API_KEY: "sk-e2e-apply-error",
      BAILIAN_BASE_URL: `http://127.0.0.1:${address.port}`,
    };

    try {
      const textResult = await runCommandE2e(MANAGED_AGENT_ROUTES, baseArgs, env);
      expect(textResult.exitCode).toBe(1);
      expect(textResult.stderr).toMatch(/Error:\s+Bailian API 500:.*intentional apply failure/);
      expect(textResult.stderr).not.toMatch(/Error:\s+Apply failed\./);

      const jsonResult = await runCommandE2e(
        MANAGED_AGENT_ROUTES,
        [...baseArgs, "--output", "json"],
        env,
      );
      expect(jsonResult.exitCode).toBe(1);
      expect(jsonResult.stderr).toMatch(
        /"message":\s*"Bailian API 500:.*intentional apply failure/,
      );
      expect(jsonResult.stderr).not.toMatch(/"message":\s*"Apply failed\."/);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("managed-agent agent create --help 展示声明和确认参数", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "agent",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--name|--model|--instructions|--skill|--skill-dir|--type|--yes/i);
    expect(stderr).toMatch(/remote Skill ID/i);
    expect(stderr).toMatch(/local Skill directory/i);
    expect(stderr).not.toMatch(/--key|--environment|--vault/i);
  });

  test("managed-agent agent create 缺少 --name 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "agent",
      "create",
      "--model",
      "qwen3.8-max",
      "--instructions",
      "help",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--name|Missing required/i);
  });

  test.each([
    ["--environment", "dev"],
    ["--vault", "secrets"],
  ])("managed-agent agent create 不接受运行时参数 %s", async (flag, value) => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "agent",
      "create",
      "--name",
      "Runtime Binding Agent",
      "--model",
      "qwen3.8-max",
      "--instructions",
      "help",
      flag,
      value,
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Unknown option|unknown flag|unexpected/i);
  });

  test("managed-agent agent create 将 official Skill ID 写为外部引用", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-agent-official-skill-e2e-"));
    const configPath = join(directory, "agents.yaml");
    await writeFile(
      configPath,
      `version: "1"
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
    base_url: \${BAILIAN_BASE_URL}
defaults:
  provider: bailian
`,
      "utf8",
    );

    try {
      const { exitCode } = await runCommandE2e(
        MANAGED_AGENT_ROUTES,
        [
          "managed-agent",
          "agent",
          "create",
          "--name",
          "Report Agent",
          "--model",
          "qwen3.8-max",
          "--instructions",
          "Create a report.",
          "--skill",
          "skill_pptx",
          "--type",
          "official",
          "--file",
          configPath,
          "--yes",
        ],
        {
          DASHSCOPE_API_KEY: "sk-e2e-agent-official-skill",
          BAILIAN_BASE_URL: "http://127.0.0.1:1/api/v1/agentstudio",
        },
      );
      expect(exitCode).toBe(1);
      const config = parse(await readFile(configPath, "utf8")) as {
        agents?: Record<string, { skills?: Array<{ type?: string; skill_id?: string }> }>;
      };
      expect(config.agents?.["report-agent"]?.skills).toEqual([
        { type: "official", skill_id: "skill_pptx" },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("managed-agent agent create 的 Skill type 默认是 custom", async () => {
    const sourceBefore = await readFile(AGENTS_YAML, "utf8");
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "agent",
      "create",
      "--dry-run",
      "--name",
      "Custom Skill Agent",
      "--model",
      "qwen3.8-max",
      "--instructions",
      "Use the custom Skill.",
      "--skill",
      "skill_custom_abc",
      "--file",
      AGENTS_YAML,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      agent?: { skills?: Array<{ type?: string; skill_id?: string }> };
      yaml_written?: boolean;
    }>(stdout);
    expect(data.agent?.skills).toEqual([{ type: "custom", skill_id: "skill_custom_abc" }]);
    expect(data.yaml_written).toBe(false);
    expect(await readFile(AGENTS_YAML, "utf8")).toBe(sourceBefore);
  });

  test("managed-agent agent create --skill-dir 离线规划 Skill 与 Agent 且不写 YAML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-agent-skill-dir-preview-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const skillDirectory = await writeLocalSkillDirectory(directory);
    const configSource = `version: "1"
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
    base_url: \${BAILIAN_BASE_URL}
defaults:
  provider: bailian
    `;
    await writeFile(configPath, configSource, "utf8");

    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
        "managed-agent",
        "agent",
        "create",
        "--dry-run",
        "--name",
        "ZIP Agent",
        "--model",
        "qwen3.8-max",
        "--instructions",
        "Use the local Skill.",
        "--skill-dir",
        skillDirectory,
        "--file",
        configPath,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        agent?: { key?: string; skills?: Array<string | Record<string, unknown>> };
        local_skills?: Array<{ key?: string; name?: string; source?: string }>;
        yaml_written?: boolean;
        actions?: Array<{
          action?: string;
          address?: { type?: string; name?: string; provider?: string };
        }>;
      }>(stdout);
      expect(data.agent).toEqual(
        expect.objectContaining({ key: "zip-agent", skills: ["local-report"] }),
      );
      expect(data.local_skills).toEqual([
        expect.objectContaining({
          key: "local-report",
          name: "local-report",
          source: "local-report",
        }),
      ]);
      expect(data.yaml_written).toBe(false);
      expect(data.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "create",
            address: expect.objectContaining({ type: "skill", name: "local-report" }),
          }),
          expect.objectContaining({
            action: "create",
            address: expect.objectContaining({ type: "agent", name: "zip-agent" }),
          }),
        ]),
      );
      expect(data.actions).toHaveLength(2);
      expect(await readFile(configPath, "utf8")).toBe(configSource);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("managed-agent agent create --skill-dir 兼容本地 ZIP", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-agent-skill-dir-zip-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const skillZipPath = await writeLocalSkillZip(directory);
    const configSource = `version: "1"
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
    base_url: \${BAILIAN_BASE_URL}
defaults:
  provider: bailian
`;
    await writeFile(configPath, configSource, "utf8");

    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
        "managed-agent",
        "agent",
        "create",
        "--dry-run",
        "--name",
        "ZIP Agent",
        "--model",
        "qwen3.8-max",
        "--instructions",
        "Use the ZIP Skill.",
        "--skill-dir",
        skillZipPath,
        "--file",
        configPath,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        agent?: { skills?: Array<string | Record<string, unknown>> };
        local_skills?: Array<{ key?: string; source?: string }>;
        yaml_written?: boolean;
      }>(stdout);
      expect(data.agent?.skills).toEqual(["local-report"]);
      expect(data.local_skills).toEqual([
        expect.objectContaining({ key: "local-report", source: "local-report.zip" }),
      ]);
      expect(data.yaml_written).toBe(false);
      expect(await readFile(configPath, "utf8")).toBe(configSource);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("managed-agent agent create --skill-dir 写入顶层 Skill 并在 Agent 中引用 key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-agent-skill-dir-write-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const skillDirectory = await writeLocalSkillDirectory(directory);
    await writeFile(
      configPath,
      `version: "1"
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
    base_url: \${BAILIAN_BASE_URL}
defaults:
  provider: bailian
`,
      "utf8",
    );
    const server = http.createServer((_request, response) => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "intentional Skill directory upload failure" }));
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address() as AddressInfo;
    const args = [
      "managed-agent",
      "agent",
      "create",
      "--name",
      "ZIP Agent",
      "--model",
      "qwen3.8-max",
      "--instructions",
      "Use the local Skill.",
      "--skill-dir",
      skillDirectory,
      "--file",
      configPath,
      "--yes",
      "--output",
      "json",
    ];
    const env = {
      DASHSCOPE_API_KEY: "sk-e2e-agent-skill-zip",
      BAILIAN_BASE_URL: `http://127.0.0.1:${address.port}/api/v1/agentstudio`,
    };

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await runCommandE2e(MANAGED_AGENT_ROUTES, args, env);
        expect(result.exitCode, result.stderr).toBe(1);
        expect(result.stderr).toContain("intentional Skill directory upload failure");
      }
      const config = parse(await readFile(configPath, "utf8")) as {
        skills?: Record<string, Record<string, unknown>>;
        agents?: Record<string, { skills?: Array<string | Record<string, unknown>> }>;
      };
      expect(config.skills?.["local-report"]).toEqual({
        name: "local-report",
        source: "local-report",
        origin: "custom",
        provider: "bailian",
      });
      expect(config.agents?.["zip-agent"]?.skills).toEqual(["local-report"]);
      expect(config.skills?.["local-report-2"]).toBeUndefined();
      expect(config.agents?.["zip-agent-2"]).toBeUndefined();
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test.each([
    ["environment create", ["environment", "create"], /--name|--pip|--yes/i],
    ["skill create", ["skill", "create"], /--source|--yes/i],
    ["vault create", ["vault", "create"], /--name|--yes/i],
    [
      "vault credential create",
      ["vault", "credential", "create"],
      /--vault|--secret-name|--secret-env|--yes/i,
    ],
    ["deployment create", ["deployment", "create"], /--name|--agent|--message|--yes/i],
  ])("managed-agent %s --help 展示资源参数", async (_label, commandArgs, expected) => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      ...commandArgs,
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(expected);
    expect(stderr).not.toMatch(/--key/i);
  });

  test.each([
    [["environment", "create"], /--name|Missing required/i],
    [["skill", "create"], /--source|Missing required/i],
    [["vault", "create"], /--name|Missing required/i],
    [["vault", "credential", "create"], /--vault|Missing required/i],
    [["deployment", "create"], /--name|Missing required/i],
  ])("managed-agent %s 缺少必填参数时退出为用法错误 (2)", async (commandArgs, expected) => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      ...commandArgs,
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(expected);
  });

  test("managed-agent agent create 默认只预览，不写 YAML", async () => {
    const sourceBefore = await readFile(AGENTS_YAML, "utf8");
    const { stdout, stderr, exitCode } = await runCommandE2e(
      MANAGED_AGENT_ROUTES,
      [
        "managed-agent",
        "agent",
        "create",
        "--name",
        "Create Confirm",
        "--model",
        "qwen3.8-max",
        "--instructions",
        "Preview before create",
        "--file",
        AGENTS_YAML,
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-e2e-agent-create" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      agent?: { key?: string; name?: string };
      yaml_written?: boolean;
      requires_confirmation?: boolean;
      ready_to_create?: boolean;
    }>(stdout);
    expect(data.agent).toEqual(
      expect.objectContaining({ key: "create-confirm", name: "Create Confirm" }),
    );
    expect(data.yaml_written).toBe(false);
    expect(data.requires_confirmation).toBe(true);
    expect(data.ready_to_create).toBe(true);
    expect(await readFile(AGENTS_YAML, "utf8")).toBe(sourceBefore);
  });

  test("managed-agent agent create 远端失败后保留 YAML，重试复用 key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-agent-create-e2e-"));
    const configPath = join(directory, "agents.yaml");
    await writeFile(configPath, await readFile(AGENTS_YAML, "utf8"), "utf8");
    const requestBodies: Array<Record<string, unknown>> = [];
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (body) requestBodies.push(JSON.parse(body) as Record<string, unknown>);
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "intentional create failure" }));
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address() as AddressInfo;
    const args = [
      "managed-agent",
      "agent",
      "create",
      "--name",
      "Retry Agent",
      "--model",
      "qwen3.8-max",
      "--instructions",
      "Retry safely",
      "--file",
      configPath,
      "--yes",
      "--output",
      "json",
    ];
    const env = {
      DASHSCOPE_API_KEY: "sk-e2e-agent-create",
      BAILIAN_BASE_URL: `http://127.0.0.1:${address.port}/api/v1/agentstudio`,
    };
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await runCommandE2e(MANAGED_AGENT_ROUTES, args, env);
        expect(result.exitCode, result.stderr).toBe(1);
        expect(result.stderr).toContain("intentional create failure");
      }
      const config = parse(await readFile(configPath, "utf8")) as {
        agents: Record<string, { name?: string }>;
      };
      expect(config.agents["retry-agent"]?.name).toBe("Retry Agent");
      expect(config.agents["retry-agent-2"]).toBeUndefined();
      expect(requestBodies).toHaveLength(2);
      expect(requestBodies.every((body) => body.name === "Retry Agent")).toBe(true);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("managed-agent environment create 远端失败后保留 YAML，重试复用 key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-environment-create-e2e-"));
    const configPath = join(directory, "agents.yaml");
    await writeFile(configPath, await readFile(AGENTS_YAML, "utf8"), "utf8");
    const requestBodies: Array<Record<string, unknown>> = [];
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (body) requestBodies.push(JSON.parse(body) as Record<string, unknown>);
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "intentional environment create failure" }));
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address() as AddressInfo;
    const args = [
      "managed-agent",
      "environment",
      "create",
      "--name",
      "Retry Environment",
      "--pip",
      "pandas",
      "--file",
      configPath,
      "--yes",
      "--output",
      "json",
    ];
    const env = {
      DASHSCOPE_API_KEY: "sk-e2e-environment-create",
      BAILIAN_BASE_URL: `http://127.0.0.1:${address.port}/api/v1/agentstudio`,
    };
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await runCommandE2e(MANAGED_AGENT_ROUTES, args, env);
        expect(result.exitCode, result.stderr).toBe(1);
        expect(result.stderr).toContain("intentional environment create failure");
      }
      const config = parse(await readFile(configPath, "utf8")) as {
        environments: Record<string, { name?: string }>;
      };
      expect(config.environments["retry-environment"]?.name).toBe("Retry Environment");
      expect(config.environments["retry-environment-2"]).toBeUndefined();
      expect(requestBodies).toHaveLength(2);
      expect(requestBodies.every((body) => body.name === "Retry Environment")).toBe(true);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("vault credential create --yes 缺少 Secret env 时不写 YAML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-vault-credential-secret-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const configSource = `version: "1"
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
    base_url: \${BAILIAN_BASE_URL}
defaults:
  provider: bailian
vaults:
  production:
    display_name: Production
    credentials: []
`;
    await writeFile(configPath, configSource, "utf8");
    try {
      const { stderr, exitCode } = await runCommandE2e(
        MANAGED_AGENT_ROUTES,
        [
          "managed-agent",
          "vault",
          "credential",
          "create",
          "--vault",
          "production",
          "--name",
          "api-token",
          "--secret-name",
          "API_TOKEN",
          "--secret-env",
          "E2E_SECRET_THAT_MUST_NOT_EXIST",
          "--file",
          configPath,
          "--yes",
        ],
        { DASHSCOPE_API_KEY: "sk-e2e-vault-credential" },
      );
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/E2E_SECRET_THAT_MUST_NOT_EXIST.*not set or is empty/i);
      expect(await readFile(configPath, "utf8")).toBe(configSource);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("vault credential create 远端失败后复用 YAML 声明且不泄露 Secret", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-vault-credential-retry-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const requestBodies: Array<Record<string, unknown>> = [];
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && requestUrl.pathname === "/vaults/vault_production_e2e") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({ id: "vault_production_e2e", type: "vault", display_name: "Production" }),
        );
        return;
      }
      if (
        request.method === "GET" &&
        requestUrl.pathname === "/vaults/vault_production_e2e/credentials"
      ) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ data: [], next_page: null }));
        return;
      }
      if (
        request.method === "POST" &&
        requestUrl.pathname === "/vaults/vault_production_e2e/credentials"
      ) {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          requestBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          response.writeHead(500, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              code: "CREDENTIAL_CREATE_FAILURE",
              message: "intentional credential create failure",
              request_id: "req_credential_create_e2e",
            }),
          );
        });
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "unexpected mock route" }));
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address() as AddressInfo;
    const configSource = `version: "1"
providers:
  bailian:
    api_key: test
    base_url: http://127.0.0.1:${address.port}
defaults:
  provider: bailian
vaults:
  production:
    display_name: Production
    credentials: []
`;
    await writeFile(configPath, configSource, "utf8");
    const args = [
      "managed-agent",
      "vault",
      "credential",
      "create",
      "--vault",
      "production",
      "--name",
      "api-token",
      "--secret-name",
      "API_TOKEN",
      "--secret-env",
      "E2E_RETRY_SECRET",
      "--file",
      configPath,
      "--yes",
      "--output",
      "json",
    ];
    const env = {
      DASHSCOPE_API_KEY: "sk-e2e-vault-credential",
      E2E_RETRY_SECRET: "credential-secret-must-not-leak",
    };
    try {
      await seedTrackedResources(configPath, [
        { type: "vault", name: "production", provider: "bailian" },
      ]);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await runCommandE2e(MANAGED_AGENT_ROUTES, args, env);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/"message":\s*"intentional credential create failure"/);
        expect(result.stderr).toMatch(/"http_status":\s*500/);
        expect(result.stderr).toMatch(/"api_code":\s*"CREDENTIAL_CREATE_FAILURE"/);
        expect(result.stderr).toMatch(/"request_id":\s*"req_credential_create_e2e"/);
        expect(`${result.stdout}\n${result.stderr}`).not.toContain(
          "credential-secret-must-not-leak",
        );
      }
      const config = parse(await readFile(configPath, "utf8")) as {
        vaults: { production: { credentials: Array<{ name?: string; secret_value?: string }> } };
      };
      expect(config.vaults.production.credentials).toEqual([
        expect.objectContaining({
          name: "api-token",
          secret_value: "${E2E_RETRY_SECRET}",
        }),
      ]);
      expect(requestBodies).toHaveLength(2);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("deployment create 拒绝非法 Event 与不完整 Schedule", async () => {
    const invalidEvent = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "deployment",
      "create",
      "--dry-run",
      "--name",
      "Invalid Event",
      "--agent",
      "assistant",
      "--event",
      '{"type":"tool.call","content":"x"}',
      "--file",
      AGENTS_YAML,
    ]);
    expect(invalidEvent.exitCode).toBe(2);
    expect(invalidEvent.stderr).toMatch(/user\.message or system\.message/i);

    const incompleteSchedule = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "deployment",
      "create",
      "--name",
      "Invalid Schedule",
      "--agent",
      "assistant",
      "--message",
      "Run",
      "--schedule",
      "0 9 * * *",
      "--quiet",
    ]);
    expect(incompleteSchedule.exitCode).toBe(2);
    expect(incompleteSchedule.stderr).toMatch(/--schedule and --timezone/i);
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

  test("managed-agent skill versions --help 展示 cursor 分页选项", async () => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "skill",
      "versions",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--skill-id|--limit|--page|--all/i);
  });
});

describe("e2e: managed-agent（--dry-run 短路，不联网不写盘）", () => {
  test("capabilities 明确区分 Session Event 与独立 Thread API", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "capabilities",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      operations?: Record<string, { supported?: boolean; auth?: string; reason?: string }>;
    }>(stdout);
    for (const operation of [
      "agent.create",
      "environment.create",
      "skill.create",
      "vault.create",
      "vault.credential.create",
      "deployment.create",
    ]) {
      expect(data.operations?.[operation]).toEqual(
        expect.objectContaining({ supported: true, auth: "api_key" }),
      );
    }
    expect(data.operations?.["session.event.list"]?.supported).toBe(true);
    expect(data.operations?.["session_thread.list"]?.supported).toBe(false);
    expect(data.operations?.["session_thread.list"]?.reason).toMatch(/no independent Thread/i);
  });

  test.each([
    ["session archive", ["session", "archive", "--session-id", "sess_e2e"]],
    ["session update", ["session", "update", "--session-id", "sess_e2e", "--title", "new"]],
    [
      "session event send",
      [
        "session",
        "event",
        "send",
        "--session-id",
        "sess_e2e",
        "--event",
        '{"type":"message","content":"hello"}',
      ],
    ],
    [
      "session export",
      ["session", "export", "--session-id", "sess_e2e", "--output-file", "debug.zip"],
    ],
    ["file upload", ["file", "upload", "--path", "missing.txt"]],
    [
      "file download",
      ["file", "download", "--file-id", "file_e2e", "--output-file", "artifact.bin"],
    ],
    ["file delete", ["file", "delete", "--file-id", "file_e2e"]],
    [
      "skill download",
      [
        "skill",
        "download",
        "--skill-id",
        "skill_e2e",
        "--skill-version",
        "1",
        "--output-file",
        "skill.zip",
      ],
    ],
    ["deployment run", ["deployment", "run", "--deployment-id", "dep_e2e"]],
    ["deployment pause", ["deployment", "pause", "--deployment-id", "dep_e2e"]],
    ["deployment unpause", ["deployment", "unpause", "--deployment-id", "dep_e2e"]],
  ])("%s --dry-run 在构建 SDK runtime 前短路", async (_label, commandArgs) => {
    const { stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      ...commandArgs,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
  });

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

  test("agent create --dry-run 自动生成 key 且不改 YAML", async () => {
    const sourceBefore = await readFile(AGENTS_YAML, "utf8");
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      "agent",
      "create",
      "--dry-run",
      "--name",
      "Create Preview",
      "--model",
      "qwen3.8-max",
      "--instructions",
      "Preview only",
      "--file",
      AGENTS_YAML,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      agent?: { key?: string; name?: string };
      yaml_written?: boolean;
      actions?: Array<{ action?: string; address?: { name?: string } }>;
    }>(stdout);
    expect(data.agent).toEqual(
      expect.objectContaining({ key: "create-preview", name: "Create Preview" }),
    );
    expect(data.yaml_written).toBe(false);
    expect(data.actions).toContainEqual(
      expect.objectContaining({
        action: "create",
        address: expect.objectContaining({ name: "create-preview" }),
      }),
    );
    expect(data.actions?.every((action) => action.address?.name === "create-preview")).toBe(true);
    expect(await readFile(AGENTS_YAML, "utf8")).toBe(sourceBefore);
  });

  test.each([
    [
      "environment",
      ["environment", "create", "--name", "Create Environment", "--pip", "pandas"],
      "environment",
      "create-environment",
    ],
    ["vault", ["vault", "create", "--name", "Create Vault"], "vault", "create-vault"],
  ])("%s create --dry-run 只规划目标资源且不改 YAML", async (_label, commandArgs, type, key) => {
    const sourceBefore = await readFile(AGENTS_YAML, "utf8");
    const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
      "managed-agent",
      ...commandArgs,
      "--dry-run",
      "--file",
      AGENTS_YAML,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      resource?: { type?: string; key?: string };
      yaml_written?: boolean;
      actions?: Array<{ action?: string; address?: { type?: string; name?: string } }>;
    }>(stdout);
    expect(data.resource).toEqual(expect.objectContaining({ type, key }));
    expect(data.yaml_written).toBe(false);
    expect(data.actions).toContainEqual(
      expect.objectContaining({
        action: "create",
        address: expect.objectContaining({ type, name: key }),
      }),
    );
    expect(
      data.actions?.every(
        (action) => action.address?.type === type && action.address?.name === key,
      ),
    ).toBe(true);
    expect(await readFile(AGENTS_YAML, "utf8")).toBe(sourceBefore);
  });

  test("skill create --dry-run 从 SKILL.md 取 name 且不改 YAML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-skill-create-e2e-"));
    const skillPath = join(directory, "SKILL.md");
    const sourceBefore = await readFile(AGENTS_YAML, "utf8");
    await writeFile(
      skillPath,
      "---\nname: create-skill\ndescription: E2E Skill\n---\n\n# Create Skill\n",
      "utf8",
    );
    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
        "managed-agent",
        "skill",
        "create",
        "--dry-run",
        "--source",
        skillPath,
        "--file",
        AGENTS_YAML,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        resource?: { type?: string; key?: string; name?: string };
        yaml_written?: boolean;
        actions?: Array<{ action?: string; address?: { type?: string; name?: string } }>;
      }>(stdout);
      expect(data.resource).toEqual(
        expect.objectContaining({ type: "skill", key: "create-skill", name: "create-skill" }),
      );
      expect(data.yaml_written).toBe(false);
      expect(data.actions).toContainEqual(
        expect.objectContaining({
          action: "create",
          address: expect.objectContaining({ type: "skill", name: "create-skill" }),
        }),
      );
      expect(await readFile(AGENTS_YAML, "utf8")).toBe(sourceBefore);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("deployment create --dry-run 只要求依赖 no-op，不检查无关资源", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-deployment-create-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const configSource = `version: "1"
providers:
  bailian:
    api_key: test
    workspace_id: ws_e2e
defaults:
  provider: bailian
agents:
  assistant:
    name: Assistant
    model: qwen3.8-max
    instructions: Help the user.
    provider: bailian
`;
    await writeFile(configPath, configSource, "utf8");
    try {
      await seedTrackedResources(configPath, [
        { type: "agent", name: "assistant", provider: "bailian" },
      ]);
      const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
        "managed-agent",
        "deployment",
        "create",
        "--dry-run",
        "--name",
        "Daily Report",
        "--agent",
        "assistant",
        "--message",
        "Generate the report",
        "--file",
        configPath,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        resource?: { type?: string; key?: string };
        yaml_written?: boolean;
        ready_to_create?: boolean;
        actions?: Array<{ action?: string; address?: { type?: string; name?: string } }>;
      }>(stdout);
      expect(data.resource).toEqual(
        expect.objectContaining({ type: "deployment", key: "daily-report" }),
      );
      expect(data.yaml_written).toBe(false);
      expect(data.ready_to_create).toBe(true);
      expect(data.actions?.filter((action) => action.action !== "no-op")).toEqual([
        expect.objectContaining({
          action: "create",
          address: expect.objectContaining({ type: "deployment", name: "daily-report" }),
        }),
      ]);
      expect(await readFile(configPath, "utf8")).toBe(configSource);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("vault credential create --dry-run 不读取远端、不要求 Secret、不写 YAML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bl-vault-credential-create-e2e-"));
    const configPath = join(directory, "agents.yaml");
    const configSource = `version: "1"
providers:
  bailian:
    api_key: test
    workspace_id: ws_e2e
defaults:
  provider: bailian
vaults:
  production:
    display_name: Production
    credentials: []
`;
    await writeFile(configPath, configSource, "utf8");
    try {
      await seedTrackedResources(configPath, [
        { type: "vault", name: "production", provider: "bailian" },
      ]);
      const { stdout, stderr, exitCode } = await runCommandE2e(MANAGED_AGENT_ROUTES, [
        "managed-agent",
        "vault",
        "credential",
        "create",
        "--dry-run",
        "--vault",
        "production",
        "--name",
        "api-token",
        "--secret-name",
        "API_TOKEN",
        "--secret-env",
        "E2E_SECRET_THAT_IS_NOT_SET",
        "--file",
        configPath,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        credential?: { name?: string; secret_name?: string; secret_env?: string };
        yaml_written?: boolean;
        remote_checked?: boolean;
        reuse_remote?: boolean;
      }>(stdout);
      expect(data.credential).toEqual({
        name: "api-token",
        secret_name: "API_TOKEN",
        secret_env: "E2E_SECRET_THAT_IS_NOT_SET",
      });
      expect(data.yaml_written).toBe(false);
      expect(data.remote_checked).toBe(false);
      expect(data.reuse_remote).toBe(false);
      expect(stdout).not.toContain("__dry_run_secret__");
      expect(await readFile(configPath, "utf8")).toBe(configSource);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
