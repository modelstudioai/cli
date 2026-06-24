import { describe, expect, test } from "vite-plus/test";
import { runCli } from "./setup.ts";

describe("e2e: rag smoke", () => {
  test("rag --version 输出 rag 与版本号", async () => {
    const { stdout, stderr, exitCode } = await runCli(["--version"]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout.trim()).toMatch(/^rag \d+\.\d+\.\d+/);
  });

  test("rag 根 help 含 retrieve 与 auth，不含 text/image/memory", async () => {
    const { stderr, exitCode } = await runCli(["--help"]);
    expect(exitCode, stderr).toBe(0);
    const out = stderr;
    expect(out).toMatch(/\bretrieve\b/i);
    expect(out).toMatch(/auth login/i);
    expect(out).not.toMatch(/text chat/i);
    expect(out).not.toMatch(/image generate/i);
    expect(out).not.toMatch(/memory add/i);
  });

  test("rag retrieve --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["retrieve", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--query/i);
  });

  test("rag text chat 为未知命令", async () => {
    const { stderr, exitCode } = await runCli(["text", "chat"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/unknown command/i);
  });
});
