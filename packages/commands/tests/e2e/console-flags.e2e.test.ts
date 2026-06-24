import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCli } from "./setup.ts";

type ConsoleDryRunMeta = {
  consoleRegion?: string;
  consoleSite?: string;
  consoleSwitchAgent?: number;
};

/**
 * E2E for global console flags (`--console-region`, `--console-site`,
 * `--console-switch-agent`) and DashScope `--base-url`.
 */

describe("e2e: console global flags", () => {
  test("根帮助展示 --base-url 与 console 全局标志", async () => {
    const { stderr, exitCode } = await runCli(["--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--base-url/);
    expect(stderr).toMatch(/--console-region/);
    expect(stderr).toMatch(/--console-site/);
    expect(stderr).toMatch(/--console-switch-agent/);
    expect(stderr).not.toMatch(/^\s*--region\s/m);
  });

  test("quota check --help 不重复命令级 region，并提示全局 flags", async () => {
    const { stderr, exitCode } = await runCli(["quota", "check", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/Global flags.*always available/i);
    expect(stderr).toMatch(/--model <model>/);
    expect(stderr).toMatch(/--period <minutes>/);
    expect(stderr).not.toMatch(/API region \(default: cn-beijing\)/);
  });

  test("console call --help 不暴露命令级 region/site，示例使用 --console-region", async () => {
    const { stderr, exitCode } = await runCli(["console", "call", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--api <api>/);
    expect(stderr).toMatch(/--data <json>/);
    expect(stderr).not.toMatch(/^\s*--region\s/m);
    expect(stderr).not.toMatch(/^\s*--site\s/m);
    expect(stderr).toMatch(/--console-region cn-beijing/);
  });

  test("auth login --help 描述 --console 与 --console-site 配合", async () => {
    const { stderr, exitCode } = await runCli(["auth", "login", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--console-site/);
    expect(stderr).toMatch(/--console.*console-site|console-site.*domestic|international/i);
  });

  test("console call --dry-run 默认 consoleRegion 为 cn-beijing", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "console",
      "call",
      "--api",
      "some.api.name",
      "--data",
      "{}",
      "--dry-run",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ConsoleDryRunMeta>(stdout);
    expect(data.consoleRegion).toBe("cn-beijing");
    expect(data.consoleSite).toBe("domestic");
  });

  test("console call --dry-run --console-region / --console-site / --console-switch-agent 透传", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "console",
      "call",
      "--api",
      "some.api.name",
      "--data",
      "{}",
      "--dry-run",
      "--non-interactive",
      "--output",
      "json",
      "--console-region",
      "ap-southeast-1",
      "--console-site",
      "international",
      "--console-switch-agent",
      "12345",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ConsoleDryRunMeta>(stdout);
    expect(data.consoleRegion).toBe("ap-southeast-1");
    expect(data.consoleSite).toBe("international");
    expect(data.consoleSwitchAgent).toBe(12345);
  });

  test("console call 拒绝未知全局 flag --region", async () => {
    const { stderr, exitCode } = await runCli([
      "console",
      "call",
      "--api",
      "some.api.name",
      "--data",
      "{}",
      "--dry-run",
      "--non-interactive",
      "--region",
      "cn",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Unknown flag.*--region/);
  });

  test("mcp list --dry-run --console-region 透传", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "mcp",
      "list",
      "--dry-run",
      "--non-interactive",
      "--output",
      "json",
      "--console-region",
      "cn-hangzhou",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ConsoleDryRunMeta>(stdout);
    expect(data.consoleRegion).toBe("cn-hangzhou");
  });

  test("quota check --dry-run --console-region 透传", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "quota",
      "check",
      "--dry-run",
      "--non-interactive",
      "--output",
      "json",
      "--console-region",
      "cn-hangzhou",
      "--console-site",
      "international",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ConsoleDryRunMeta>(stdout);
    expect(data.consoleRegion).toBe("cn-hangzhou");
    expect(data.consoleSite).toBe("international");
  });
});
