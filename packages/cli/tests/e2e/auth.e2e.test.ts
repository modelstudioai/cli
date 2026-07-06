import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

/**
 * Auth 相关 E2E：只验证 CLI 进程能正常解析参数并退出。
 */

describe("e2e: auth", () => {
  test("auth 分组展示子命令帮助且退出码为 0", async () => {
    const { stdout, stderr, exitCode } = await runCli(["auth"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/auth|Authentication|login|logout|status/i);
  });

  test("auth login --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["auth", "login", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/login|api-key/i);
    expect(stderr).toMatch(/--console-site/);
  });

  test("auth logout --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["auth", "logout", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/logout|dry-run|yes/i);
  });

  test("auth status --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["auth", "status", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/status|output/i);
  });

  test("auth login 缺少 --api-key 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCli(["auth", "login", "--non-interactive"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/--api-key|Usage:/i);
  });

  test("auth login --dry-run --api-key 不发起校验与落盘", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "auth",
      "login",
      "--dry-run",
      "--api-key",
      "sk-e2e-dry-run-placeholder",
      "--non-interactive",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Would validate and save API key.");
  });

  test("auth login --dry-run 覆盖全局参数 --output json --timeout", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "auth",
      "login",
      "--dry-run",
      "--api-key",
      "sk-e2e-dry-run-placeholder",
      "--non-interactive",
      "--output",
      "json",
      "--timeout",
      "120",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Would validate and save API key.");
  });

  test("auth login 缺少密钥且 --output json 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "auth",
      "login",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    const err = JSON.parse(stderr.trim()) as { error?: { code?: number; message?: string } };
    expect(err.error?.code).toBe(2);
    expect(err.error?.message).toMatch(/--api-key|console/i);
  });

  test("auth logout --dry-run 不写入配置", async () => {
    const { stdout, stderr, exitCode } = await runCli(["auth", "logout", "--dry-run"]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
    expect(stderr).not.toContain("Cleared api_key");
  });

  test("auth logout --dry-run --yes --non-interactive", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "auth",
      "logout",
      "--dry-run",
      "--yes",
      "--non-interactive",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
    expect(stderr).not.toContain("Cleared api_key");
  });

  test("auth logout --dry-run --quiet --no-color", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "auth",
      "logout",
      "--dry-run",
      "--quiet",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
  });

  test("auth logout --dry-run --output json（不清除密钥）", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "auth",
      "logout",
      "--dry-run",
      "--output",
      "json",
      "--non-interactive",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
    expect(stderr).not.toContain("Cleared api_key");
  });

  test.skipIf(!isDashScopeE2EReady())("auth status 文本输出", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "auth",
      "status",
      "--non-interactive",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(
      /Authentication Status|API key:|Console token:|DashScope API:|Console gateway:/,
    );
  });

  test.skipIf(!isDashScopeE2EReady())("auth status --output json", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "auth",
      "status",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      authenticated?: boolean;
      api_key?: { source?: string; masked?: string; base_url?: string };
    }>(stdout);
    expect(data.authenticated).toBe(true);
    expect(data.api_key?.source).toBeDefined();
  });

  test.skipIf(!isDashScopeE2EReady())(
    "auth status --output json --quiet(base_url 经 env 指定;凭证域 flag 对 status 不可见)",
    async () => {
      const { stdout, stderr, exitCode } = await runCli(
        ["auth", "status", "--non-interactive", "--output", "json", "--quiet"],
        { DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com" },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ authenticated?: boolean; api_key?: unknown }>(stdout);
      expect(data.authenticated).toBe(true);
      expect(data.api_key).toBeDefined();
    },
  );

  test("auth status 不接受凭证域覆盖 flag(--base-url 报 Unknown flag)", async () => {
    const { stderr, exitCode } = await runCli(["auth", "status", "--base-url", "https://x.test"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Unknown flag.*--base-url/);
  });
});
