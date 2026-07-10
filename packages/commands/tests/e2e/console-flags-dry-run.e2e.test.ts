import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { CONSOLE_FLAGS_DRY_RUN_ROUTES } from "./topic-routes.ts";

type ConsoleDryRunMeta = {
  consoleRegion?: string;
  consoleSite?: string;
  consoleSwitchAgent?: number;
};

describe("e2e: console global flags (dry-run)", () => {
  test("console call --help 不暴露命令级 region/site，示例使用 --console-region", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONSOLE_FLAGS_DRY_RUN_ROUTES, [
      "console",
      "call",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--api <api>/);
    expect(stderr).toMatch(/--data <json>/);
    expect(stderr).not.toMatch(/^\s*--region\s/m);
    expect(stderr).not.toMatch(/^\s*--site\s/m);
    expect(stderr).toMatch(/--console-region cn-beijing/);
  });

  test("auth login --help:自有 flag 含 --console-site,不含其余 console 域 flag", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONSOLE_FLAGS_DRY_RUN_ROUTES, [
      "auth",
      "login",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--api-key <key>/);
    expect(stderr).toMatch(/--base-url <url>/);
    expect(stderr).toMatch(/--console-site <site>/);
    expect(stderr).not.toMatch(/--console-region/);
    expect(stderr).not.toMatch(/--workspace-id/);
  });

  test("console call --dry-run 默认 consoleRegion 为 cn-beijing", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONSOLE_FLAGS_DRY_RUN_ROUTES, [
      "console",
      "call",
      "--api",
      "some.api.name",
      "--data",
      "{}",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ConsoleDryRunMeta>(stdout);
    expect(data.consoleRegion).toBe("cn-beijing");
    expect(data.consoleSite).toBe("domestic");
  });

  test("console call --dry-run --console-region / --console-site / --console-switch-agent 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONSOLE_FLAGS_DRY_RUN_ROUTES, [
      "console",
      "call",
      "--api",
      "some.api.name",
      "--data",
      "{}",
      "--dry-run",
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
    const { stderr, exitCode } = await runCommandE2e(CONSOLE_FLAGS_DRY_RUN_ROUTES, [
      "console",
      "call",
      "--api",
      "some.api.name",
      "--data",
      "{}",
      "--dry-run",
      "--region",
      "cn",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Unknown flag.*--region/);
  });

  test("mcp list --dry-run --console-region 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONSOLE_FLAGS_DRY_RUN_ROUTES, [
      "mcp",
      "list",
      "--dry-run",
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
    const { stdout, stderr, exitCode } = await runCommandE2e(CONSOLE_FLAGS_DRY_RUN_ROUTES, [
      "quota",
      "check",
      "--dry-run",
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
