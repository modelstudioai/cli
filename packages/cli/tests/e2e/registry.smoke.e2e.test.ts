import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { captureRegistryHelp, deriveGroupPaths } from "e2e/registry-smoke";
import { CommandRegistry, resolve } from "bailian-cli-runtime";
import { commands } from "../../src/commands.ts";
import { runCli } from "./helpers.ts";

const commandPaths = Object.keys(commands).sort();
const groupPaths = deriveGroupPaths(commandPaths);
const registry = new CommandRegistry(commands, "bl");
const isolatedConfigDir = mkdtempSync(join(tmpdir(), "bl-registry-smoke-"));

afterAll(() => rmSync(isolatedConfigDir, { recursive: true, force: true }));

function runCliSmoke(args: string[]) {
  return runCli(args, { BAILIAN_CONFIG_DIR: isolatedConfigDir });
}

describe("e2e: bl registry smoke", () => {
  test("根帮助展示 bl、逐命令鉴权域与全局 flag", async () => {
    const { stderr, exitCode } = await runCliSmoke(["--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/\bbl\b/i);
    expect(stderr).not.toMatch(/COMMAND\s+AUTH\s+DESCRIPTION/);
    expect(stderr).toMatch(/app call\s+\[API Key\]\s+Call a Bailian application/);
    expect(stderr).toMatch(/app list\s+\[Console\]\s+List Bailian applications/);
    expect(stderr).toMatch(/token-plan create-key\s+\[AK\/SK\]\s+Create a Token Plan API key/);
    expect(stderr).toMatch(/config show\s+\[No Auth\]\s+Display current configuration/);
    expect(stderr).toMatch(/--base-url/);
    expect(stderr).toMatch(/--console-region/);
    expect(stderr).toMatch(/--console-site/);
    expect(stderr).toMatch(/--console-switch-agent/);
    expect(stderr).not.toMatch(/^\s*--region\s/m);
  });

  test("分组帮助按叶子命令展示不同鉴权域", async () => {
    const { stderr, exitCode } = await runCliSmoke(["app", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/app call\s+\[API Key\]\s+Call a Bailian application/);
    expect(stderr).toMatch(/app list\s+\[Console\]\s+List Bailian applications/);
  });

  test.each([
    [["text", "chat"], "API Key"],
    [["app", "list"], "Console"],
    [["token-plan", "list-seats"], "AK/SK"],
    [["config", "show"], "No Auth"],
  ] as const)("%s --help 明确展示鉴权域 %s", async (commandPath, authLabel) => {
    const { stderr, exitCode } = await runCliSmoke([...commandPath, "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain(`Authentication: ${authLabel}`);
  });

  test("quota check --help:Flags 含 console 域鉴权 flag,Global Flags 全量列出", async () => {
    const { stderr, exitCode } = await runCliSmoke(["quota", "check", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/Global Flags:/);
    expect(stderr).toMatch(/--console-region <region>/);
    expect(stderr).toMatch(/--model <model>/);
    expect(stderr).toMatch(/--period <minutes>/);
    expect(stderr).toMatch(/--output <format>/);
    expect(stderr).not.toMatch(/API region \(default: cn-beijing\)/);
  });

  test.each(commandPaths)("已注册命令 %s --help 成功", (path) => {
    const commandPath = path.split(" ");

    expect(resolve([...commandPath, "--help"], registry)).toEqual({
      kind: "help",
      path: commandPath,
    });
    expect(captureRegistryHelp(registry, commandPath)).toContain(`Usage: bl ${path}`);
  });

  test.each(groupPaths)("命令分组 %s --help 成功", (path) => {
    const commandPath = path.split(" ");

    expect(resolve([...commandPath, "--help"], registry)).toEqual({
      kind: "help",
      path: commandPath,
    });
    expect(captureRegistryHelp(registry, commandPath)).toContain(
      `Usage: bl ${path} <command> [flags]`,
    );
  });
});
