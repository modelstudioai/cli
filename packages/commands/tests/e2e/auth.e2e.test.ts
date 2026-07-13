import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vite-plus/test";
import {
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import { AUTH_ROUTES } from "./topic-routes.ts";

/**
 * Auth 相关 E2E：只验证 CLI 进程能正常解析参数并退出。
 */

describe("e2e: auth", () => {
  test("auth login --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, ["auth", "login", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/login|api-key/i);
    expect(stderr).toMatch(/--console-site/);
    expect(stderr).toMatch(/--open-api/);
  });

  test("auth login 一次只能选择一种登录模式", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--console",
      "--api-key",
      "sk-e2e-placeholder",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Choose exactly one login mode/);
  });

  test("auth login 模式专属参数不能脱离对应模式", async () => {
    const openApiFlagOnly = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--access-key-id",
      "LTAI-e2e",
    ]);
    expect(openApiFlagOnly.exitCode).toBe(2);
    expect(openApiFlagOnly.stderr).toMatch(/Use --open-api with --access-key-id/);

    const baseUrlWithoutApiKey = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--console",
      "--base-url",
      "https://dashscope.aliyuncs.com",
    ]);
    expect(baseUrlWithoutApiKey.exitCode).toBe(2);
    expect(baseUrlWithoutApiKey.stderr).toMatch(/Use --base-url only with --api-key/);

    const consoleSiteWithoutConsole = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--api-key",
      "sk-e2e-placeholder",
      "--console-site",
      "international",
    ]);
    expect(consoleSiteWithoutConsole.exitCode).toBe(2);
    expect(consoleSiteWithoutConsole.stderr).toMatch(/Use --console-site only with --console/);
  });

  test("auth login --open-api 要求 AK/SK 成对输入", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--open-api",
      "--access-key-id",
      "LTAI-e2e",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Provide --access-key-id and --access-key-secret with --open-api/);
  });

  test("auth logout --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, ["auth", "logout", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/logout|dry-run|yes/i);
  });

  test("auth status --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/status|output/i);
  });

  test("auth login 缺少 --api-key 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, ["auth", "login", "--quiet"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/Choose exactly one login mode/);
  });

  test("auth login --dry-run --api-key 不发起校验与落盘", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--dry-run",
      "--api-key",
      "sk-e2e-dry-run-placeholder",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Would validate and save API key.");
  });

  test("auth login --dry-run 覆盖全局参数 --output json --timeout", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--dry-run",
      "--api-key",
      "sk-e2e-dry-run-placeholder",
      "--output",
      "json",
      "--timeout",
      "120",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Would validate and save API key.");
  });

  test("auth login 缺少密钥且 --output json 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    const err = JSON.parse(stderr.trim()) as { error?: { code?: number; message?: string } };
    expect(err.error?.code).toBe(2);
    expect(err.error?.message).toMatch(/Choose exactly one login mode/);
  });

  test("auth logout --dry-run 不写入配置", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "logout",
      "--dry-run",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
    expect(stderr).not.toContain("Cleared api_key");
  });

  test("auth logout --dry-run --quiet", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "logout",
      "--dry-run",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
  });

  test("auth logout --dry-run --output json（不清除密钥）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "logout",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
    expect(stderr).not.toContain("Cleared api_key");
  });

  test.skipIf(!isDashScopeE2EReady())("auth status 文本输出", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "status",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(
      /Authentication Status|API key:|Console token:|DashScope API:|Console gateway:/,
    );
  });

  test.skipIf(!isDashScopeE2EReady())("auth status --output json", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "status",
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
      const { stdout, stderr, exitCode } = await runCommandE2e(
        AUTH_ROUTES,
        ["auth", "status", "--output", "json", "--quiet"],
        { DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com" },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ authenticated?: boolean; api_key?: unknown }>(stdout);
      expect(data.authenticated).toBe(true);
      expect(data.api_key).toBeDefined();
    },
  );

  test("auth status 不接受凭证域覆盖 flag(--base-url 报 Unknown flag)", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "status",
      "--base-url",
      "https://x.test",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Unknown flag.*--base-url/);
  });

  test("auth status 展示 env OpenAPI AK/SK 且不接受 OpenAPI flag 覆盖", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      AUTH_ROUTES,
      ["auth", "status", "--output", "json"],
      {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "LTAI-e2e-placeholder",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-e2e-placeholder",
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      authenticated?: boolean;
      openapi?: { source?: string; access_key_id?: string; access_key_secret?: string };
    }>(stdout);
    expect(data.authenticated).toBe(true);
    expect(data.openapi?.source).toBe("env");
    expect(data.openapi?.access_key_id).not.toBe("LTAI-e2e-placeholder");
    expect(data.openapi?.access_key_secret).not.toBe("secret-e2e-placeholder");

    const denied = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--access-key-id", "ak"]);
    expect(denied.exitCode).not.toBe(0);
    expect(denied.stderr).toMatch(/Unknown flag.*--access-key-id/);
  });

  test("auth login --open-api 持久化 OpenAPI AK/SK 并支持单独 logout", async () => {
    const configDir = makeE2eOutputDir("auth-openapi-login");
    const env = {
      BAILIAN_CONFIG_DIR: configDir,
      ALIBABA_CLOUD_ACCESS_KEY_ID: "",
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
    };

    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--open-api",
        "--access-key-id",
        "LTAI-e2e-login-placeholder",
        "--access-key-secret",
        "secret-e2e-login-placeholder",
      ],
      env,
    );
    expect(login.exitCode, login.stderr).toBe(0);
    expect(login.stderr).toMatch(/OpenAPI credentials saved/);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.access_key_id).toBe("LTAI-e2e-login-placeholder");
    expect(config.access_key_secret).toBe("secret-e2e-login-placeholder");
    expect(config.openapi_access_key_id).toBeUndefined();
    expect(config.openapi_access_key_secret).toBeUndefined();

    const status = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--output", "json"], env);
    expect(status.exitCode, status.stderr).toBe(0);
    const data = parseStdoutJson<{
      authenticated?: boolean;
      openapi?: { source?: string; access_key_id?: string; access_key_secret?: string };
    }>(status.stdout);
    expect(data.authenticated).toBe(true);
    expect(data.openapi?.source).toBe("config");
    expect(data.openapi?.access_key_id).not.toBe("LTAI-e2e-login-placeholder");
    expect(data.openapi?.access_key_secret).not.toBe("secret-e2e-login-placeholder");

    const logout = await runCommandE2e(AUTH_ROUTES, ["auth", "logout", "--open-api"], env);
    expect(logout.exitCode, logout.stderr).toBe(0);
    expect(logout.stderr).toMatch(/Cleared access_key_id/);

    const after = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--output", "json"], env);
    expect(after.exitCode, after.stderr).toBe(0);
    const afterData = parseStdoutJson<{ authenticated?: boolean; openapi?: unknown }>(after.stdout);
    expect(afterData.openapi).toBeUndefined();
  });
});
