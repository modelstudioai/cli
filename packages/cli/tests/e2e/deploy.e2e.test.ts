import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

/**
 * Deploy E2E.
 *
 * The suite exercises command discovery, help text, and the `--dry-run`
 * structured-output path (arg parsing + body construction) with no network
 * dependency. Because `ensureApiKey` runs before every command (see main.ts),
 * these cases are gated by isDashScopeE2EReady() — they are skipped when no
 * DashScope credential is present (e.g. on CI) and run offline when one is.
 * The remote list test is also gated and tolerates both empty accounts and
 * auth/permission failures (see the test comment).
 */

describe.skipIf(!isDashScopeE2EReady())("e2e: deploy (offline)", () => {
  test("deploy 列出子命令", async () => {
    const { stdout, stderr, exitCode } = await runCli(["deploy"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/create|list|get|delete|update|scale|models/);
  });

  test("deploy create --help 正常退出并展示必填项", async () => {
    const { stderr, exitCode } = await runCli(["deploy", "text", "create", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model|--name/i);
  });

  test("deploy create --dry-run 构造 lora 部署请求体", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      "text",
      "create",
      "--model",
      "qwen-plus-2025-12-01",
      "--name",
      "my-qwen-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        model_name: string;
        name: string;
        plan: string;
        capacity: number;
      };
    }>(stdout);
    expect(data.action).toBe("deploy.create");
    expect(data.body.model_name).toBe("qwen-plus-2025-12-01");
    expect(data.body.name).toBe("my-qwen-plus");
    expect(data.body.plan).toBe("lora");
    expect(data.body.capacity).toBe(1);
  });

  test("deploy create --plan mu --deploy-spec --dry-run 透传 deploy_spec", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      "text",
      "create",
      "--model",
      "qwen3-8b",
      "--name",
      "my-qwen3-mu",
      "--plan",
      "mu",
      "--deploy-spec",
      "MU1",
      "--capacity",
      "2",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { plan: string; deploy_spec?: string; capacity?: number };
    }>(stdout);
    expect(data.action).toBe("deploy.create");
    expect(data.body.plan).toBe("mu");
    expect(data.body.deploy_spec).toBe("MU1");
    expect(data.body.capacity).toBe(2);
  });

  test("deploy audio create --dry-run 构造 lora 部署请求体", async () => {
    // deploy create does not inspect modality; the split only changes the path.
    // The audio subcommand shares the full flag surface and run logic.
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      "audio",
      "create",
      "--model",
      "my-cosyvoice-ft",
      "--name",
      "my-tts",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; body: { plan: string; name: string } }>(stdout);
    expect(data.action).toBe("deploy.create");
    expect(data.body.plan).toBe("lora");
    expect(data.body.name).toBe("my-tts");
  });

  test("deploy scale --dry-run 转发 capacity", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      "scale",
      "--deployed-model",
      "dep-xxx",
      "--capacity",
      "8",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      deployed_model: string;
      body: { capacity: number };
    }>(stdout);
    expect(data.action).toBe("deploy.scale");
    expect(data.deployed_model).toBe("dep-xxx");
    expect(data.body.capacity).toBe(8);
  });

  test("deploy update --dry-run 转发 rate limits", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      "update",
      "--deployed-model",
      "dep-xxx",
      "--rpm-limit",
      "1000",
      "--tpm-limit",
      "200000",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { rpm_limit: number; tpm_limit: number };
    }>(stdout);
    expect(data.action).toBe("deploy.update");
    expect(data.body.rpm_limit).toBe(1000);
    expect(data.body.tpm_limit).toBe(200000);
  });

  test("deploy scale --dry-run 缺少 capacity/input-tpm/output-tpm 时报错", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      "scale",
      "--deployed-model",
      "dep-xxx",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).not.toBe(0);
    // Nothing useful emitted to stdout on a usage error.
    expect(stdout.trim()).toBe("");
  });

  test.each([
    ["list", ["--status", "RUNNING"]],
    ["get", ["--deployed-model", "dep-xxx"]],
    ["models", ["--source", "custom"]],
    ["delete", ["--deployed-model", "dep-xxx"]],
  ])("deploy %s --dry-run 发出结构化动作", async (sub, extra) => {
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      sub,
      ...extra,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string }>(stdout);
    expect(data.action).toBe(`deploy.${sub}`);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: deploy (DashScope)", () => {
  /**
   * 不同开发者的 key 状态不一：可能鉴权失败、可能账号下没有任何部署记录、
   * 也可能受区域/权限限制。因此本用例不假设"有数据"或"调用成功"：
   *   - 成功（exit 0）：响应必须可解析；deployments 可能为空数组或不存在。
   *   - 失败（非零退出）：只要 CLI 把服务端/鉴权错误优雅上抛（stderr 有内容、
   *     而非进程崩溃），即视为通过。
   */
  test("deploy list --output json 优雅返回（空账号或鉴权失败均通过）", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "deploy",
      "list",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    if (exitCode === 0) {
      const data = parseStdoutJson<{ data?: { deployments?: unknown[] } }>(stdout);
      expect(data).toBeTruthy();
      if (data.data?.deployments) {
        expect(Array.isArray(data.data.deployments)).toBe(true);
      }
    } else {
      expect(stderr.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
