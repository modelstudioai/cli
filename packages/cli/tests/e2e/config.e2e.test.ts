import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCli } from "./helpers.ts";

/**
 * Config 相关 E2E
 */

describe("e2e: config", () => {
  test("config 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["config"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/config|show|set|export-schema/i);
  });

  test("config show --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["config", "show", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/show|config/i);
  });

  test("config set --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["config", "set", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/set|--key|--value/i);
  });

  test("config show --output json", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "config",
      "show",
      "--non-interactive",
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

  test("config show --output text --no-color", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "config",
      "show",
      "--non-interactive",
      "--output",
      "text",
      "--no-color",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/config_file|timeout|base_url/i);
  });

  test("config set 缺少 --key / --value 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli(["config", "set", "--non-interactive"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--key|--value|required/i);
  });

  test("config set 非法 key 时退出为用法错误", async () => {
    const { stderr, exitCode } = await runCli([
      "config",
      "set",
      "--non-interactive",
      "--key",
      "not-a-real-key",
      "--value",
      "x",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid config key|not-a-real-key/i);
  });

  test("config set 非法 output", async () => {
    const { stderr, exitCode } = await runCli([
      "config",
      "set",
      "--non-interactive",
      "--key",
      "output",
      "--value",
      "yaml",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid output|text, json/i);
  });

  test("config set 非法 timeout", async () => {
    const { stderr, exitCode } = await runCli([
      "config",
      "set",
      "--non-interactive",
      "--key",
      "timeout",
      "--value",
      "0",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid timeout|positive/i);
  });

  test("config set --dry-run 不落盘（仅输出 would_set）", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "config",
      "set",
      "--dry-run",
      "--non-interactive",
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
    const { stdout, stderr, exitCode } = await runCli([
      "config",
      "set",
      "--dry-run",
      "--non-interactive",
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
});
