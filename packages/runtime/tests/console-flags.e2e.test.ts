import { describe, expect, test } from "vite-plus/test";
import { runCommandE2e } from "../../commands/tests/e2e/helpers.ts";

/**
 * 跨域 flag 拒绝：runtime 凭证域与命令 flag 解析边界。
 */

describe("e2e: console global flags (cross-domain rejection)", () => {
  test("跨域 flag 拒绝:model 命令传 --console-region 报 Unknown flag", async () => {
    const { stderr, exitCode } = await runCommandE2e([
      "text",
      "chat",
      "--message",
      "hi",
      "--console-region",
      "cn-hangzhou",
      "--dry-run",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Unknown flag.*--console-region/);
  });

  test("跨域 flag 拒绝:console 命令传 --api-key 报 Unknown flag", async () => {
    const { stderr, exitCode } = await runCommandE2e([
      "mcp",
      "list",
      "--api-key",
      "sk-test",
      "--dry-run",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Unknown flag.*--api-key/);
  });
});
