import { describe, expect, test } from "vite-plus/test";
import { captureRegistryHelp, deriveGroupPaths } from "e2e/registry-smoke";
import { CommandRegistry, resolve } from "bailian-cli-runtime";
import pkg from "../../package.json" with { type: "json" };
import { commands } from "../../src/commands.ts";
import { runKscli } from "./helpers.ts";

const commandPaths = Object.keys(commands).sort();
const groupPaths = deriveGroupPaths(commandPaths);
const registry = new CommandRegistry(commands, "kscli");

describe("e2e: kscli registry smoke", () => {
  test("根帮助展示 kscli 与全局 flag", async () => {
    const { stderr, exitCode } = await runKscli(["--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/\bkscli\b/i);
    expect(stderr).toMatch(/--base-url/);
    expect(stderr).not.toMatch(/^\s*--region\s/m);
  });

  test("--version 输出产品名与版本", async () => {
    const { stdout, exitCode } = await runKscli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`kscli ${pkg.version}`);
  });

  test("search --help 展示 kscli 路径与 knowledge 必填 flag", async () => {
    const { stderr, exitCode } = await runKscli(["search", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/kscli search/i);
    expect(stderr).toMatch(/--query/i);
    expect(stderr).toMatch(/--agent-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
    expect(stderr).not.toMatch(/bl knowledge search/i);
  });

  test("search 缺少 --query 时报用法错误 (2)", async () => {
    const { stderr, exitCode } = await runKscli(["search", "--agent-id", "aid_test"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--query|Missing required/i);
  });

  test.each(commandPaths)("已注册命令 %s --help 成功", (path) => {
    const commandPath = path.split(" ");

    expect(resolve([...commandPath, "--help"], registry)).toEqual({
      kind: "help",
      path: commandPath,
    });
    expect(captureRegistryHelp(registry, commandPath)).toContain(`Usage: kscli ${path}`);
  });

  test.each(groupPaths)("命令分组 %s --help 成功", (path) => {
    const commandPath = path.split(" ");

    expect(resolve([...commandPath, "--help"], registry)).toEqual({
      kind: "help",
      path: commandPath,
    });
    expect(captureRegistryHelp(registry, commandPath)).toContain(
      `Usage: kscli ${path} <command> [flags]`,
    );
  });
});
