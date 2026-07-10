import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const harnessMainTs = join(runtimeRoot, "tests/harness/cross-domain-main.ts");

async function runRuntimeHarness(args: string[]) {
  return runNodeMain(harnessMainTs, args, { cwd: runtimeRoot });
}

/**
 * 跨域 flag 拒绝：runtime 凭证域与命令 flag 解析边界（synthetic command，不依赖 commands）。
 */
describe("e2e: console global flags (cross-domain rejection)", () => {
  test("跨域 flag 拒绝:model 命令传 --console-region 报 Unknown flag", async () => {
    const { stderr, exitCode } = await runRuntimeHarness([
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
    const { stderr, exitCode } = await runRuntimeHarness([
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
