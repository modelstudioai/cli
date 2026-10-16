import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { describe, expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";
import type { Language } from "bailian-cli-core";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const harnessMainTs = join(runtimeRoot, "tests/harness/cross-domain-main.ts");

async function runRuntimeHarness(args: string[], language: Language) {
  const configDir = mkdtempSync(join(tmpdir(), "bl-cross-domain-e2e-"));
  try {
    writeFileSync(join(configDir, "config.json"), JSON.stringify({ language }));
    return await runNodeMain(harnessMainTs, args, {
      cwd: runtimeRoot,
      env: { BAILIAN_CONFIG_DIR: configDir, DASHSCOPE_OUTPUT: "text" },
    });
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

/**
 * 跨域 flag 拒绝：runtime 凭证域与命令 flag 解析边界（synthetic command，不依赖 commands）。
 */
describe.each([
  { language: "en-US", unknownFlag: "Unknown flag" },
  { language: "zh-CN", unknownFlag: "未知参数" },
] as const)(
  "e2e: console global flags (cross-domain rejection, $language)",
  ({ language, unknownFlag }) => {
    test("跨域 flag 拒绝:model 命令传 --console-region 报未知参数", async () => {
      const { stdout, stderr, exitCode } = await runRuntimeHarness(
        ["text", "chat", "--message", "hi", "--console-region", "cn-hangzhou", "--dry-run"],
        language,
      );
      expect(exitCode, stderr).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toMatch(new RegExp(`${unknownFlag}.*--console-region`));
    });

    test("跨域 flag 拒绝:console 命令传 --api-key 报未知参数", async () => {
      const { stdout, stderr, exitCode } = await runRuntimeHarness(
        ["mcp", "list", "--api-key", "sk-test", "--dry-run"],
        language,
      );
      expect(exitCode, stderr).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toMatch(new RegExp(`${unknownFlag}.*--api-key`));
    });
  },
);
