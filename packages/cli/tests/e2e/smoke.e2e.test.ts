import { describe, expect, test } from "vite-plus/test";
import { runCli } from "./setup.ts";

describe("e2e: bl smoke", () => {
  test("bl --version 输出 bl 与版本号", async () => {
    const { stdout, stderr, exitCode } = await runCli(["--version"]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout.trim()).toMatch(/^bl \d+\.\d+\.\d+/);
  });

  test("bl 根 help 含各能力组代表命令", async () => {
    const { stderr, exitCode } = await runCli(["--help"]);
    expect(exitCode, stderr).toBe(0);
    const out = stderr;
    // baseCommands
    expect(out).toMatch(/auth login/i);
    expect(out).toMatch(/config show/i);
    // knowledgeCommands
    expect(out).toMatch(/knowledge retrieve/i);
    // textCommands
    expect(out).toMatch(/text chat/i);
    expect(out).toMatch(/\bomni\b/i);
    // mediaCommands
    expect(out).toMatch(/image generate/i);
    expect(out).toMatch(/video generate/i);
    expect(out).toMatch(/speech synthesize/i);
    // memoryCommands
    expect(out).toMatch(/memory add/i);
    // miscCommands
    expect(out).toMatch(/mcp list/i);
    expect(out).toMatch(/app list/i);
    expect(out).toMatch(/pipeline run/i);
    expect(out).toMatch(/search web/i);
  });

  test("bl knowledge retrieve --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["knowledge", "retrieve", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--query/i);
  });

  test("bl text chat --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["text", "chat", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--message|chat/i);
  });
});
