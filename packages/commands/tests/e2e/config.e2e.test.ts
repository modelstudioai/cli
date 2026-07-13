import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { CONFIG_ROUTES } from "./topic-routes.ts";

/**
 * Config 相关 E2E
 */

describe("e2e: config", () => {
  test("config show --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "show", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/show|config/i);
  });

  test("config set --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "set", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/set|--key|--value/i);
  });

  test("config ui --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "ui", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/ui|--port|--no-open|web/i);
  });

  test("config ui --dry-run 打印计划不起服务", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "ui",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ host?: string; routes?: string[] }>(stdout);
    expect(data.host).toBe("127.0.0.1");
    expect(Array.isArray(data.routes)).toBe(true);
  });

  test("config show --output json", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "show",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      config_file?: string;
      base_url?: string;
      timeout?: number;
    }>(stdout);
    expect(data.config_file).toBeDefined();
    expect(data.base_url).toBeDefined();
    expect(data.timeout).toBeDefined();
  });

  test("config show --output text", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "show",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/config_file|timeout|base_url/i);
  });

  test("config set 缺少 --key / --value 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "set", "--quiet"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/--key|--value|Usage:/i);
  });

  test("config set 非法 key 时退出为用法错误", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "not-a-real-key",
      "--value",
      "x",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid config key|not-a-real-key/i);
  });

  test("config set 非法 output", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "output",
      "--value",
      "yaml",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid output|text, json/i);
  });

  test("config set 非法 timeout", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "timeout",
      "--value",
      "0",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid timeout|positive/i);
  });

  test("config set --dry-run 不落盘（仅输出 would_set）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "output",
      "--value",
      "json",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_set?: { output?: string } }>(stdout);
    expect(data.would_set?.output).toBe("json");
  });

  test("config set --dry-run 支持连字符别名 key", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "default-text-model",
      "--value",
      "qwen3.7-max",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_set?: { default_text_model?: string } }>(stdout);
    expect(data.would_set?.default_text_model).toBe("qwen3.7-max");
  });

  test("config set --dry-run 支持 AccessKey 短字段别名", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "access-key-id",
      "--value",
      "LTAI-config-placeholder",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_set?: { access_key_id?: string } }>(stdout);
    expect(data.would_set?.access_key_id).toBe("LTAI-config-placeholder");
  });

  test("config set 不接受旧 OpenAPI AccessKey 字段名", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "openapi_access_key_id",
      "--value",
      "LTAI-config-placeholder",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid config key|openapi_access_key_id/);
  });
});
