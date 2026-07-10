import { describe, expect, test } from "vite-plus/test";
import { commands } from "../../src/commands.ts";
import { runCli } from "./helpers.ts";

/** 从命令 map 推导有子命令的分组路径 */
function deriveGroupPaths(commandPaths: string[]): string[] {
  const groups = new Set<string>();
  for (const path of commandPaths) {
    const parts = path.split(" ");
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join(" ");
      const hasChildren = commandPaths.some(
        (candidate) => candidate.startsWith(`${prefix} `) && candidate !== prefix,
      );
      if (hasChildren) groups.add(prefix);
    }
  }
  return [...groups].sort();
}

const commandPaths = Object.keys(commands).sort();
const groupPaths = deriveGroupPaths(commandPaths);

describe("e2e: bl registry smoke", () => {
  test("根帮助展示 bl 与全局 flag", async () => {
    const { stderr, exitCode } = await runCli(["--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/\bbl\b/i);
    expect(stderr).toMatch(/--base-url/);
    expect(stderr).toMatch(/--console-region/);
    expect(stderr).toMatch(/--console-site/);
    expect(stderr).toMatch(/--console-switch-agent/);
    expect(stderr).not.toMatch(/^\s*--region\s/m);
  });

  test("quota check --help:Flags 含 console 域鉴权 flag,Global Flags 全量列出", async () => {
    const { stderr, exitCode } = await runCli(["quota", "check", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/Global Flags:/);
    expect(stderr).toMatch(/--console-region <region>/);
    expect(stderr).toMatch(/--model <model>/);
    expect(stderr).toMatch(/--period <minutes>/);
    expect(stderr).toMatch(/--output <format>/);
    expect(stderr).not.toMatch(/API region \(default: cn-beijing\)/);
  });

  test.each(commandPaths)("已注册命令 %s --help 成功", async (path) => {
    const { stderr, exitCode } = await runCli([...path.split(" "), "--help"]);
    expect(exitCode, stderr).toBe(0);
  });

  test.each(groupPaths)("命令分组 %s --help 成功", async (path) => {
    const { stderr, exitCode } = await runCli([...path.split(" "), "--help"]);
    expect(exitCode, stderr).toBe(0);
  });
});
