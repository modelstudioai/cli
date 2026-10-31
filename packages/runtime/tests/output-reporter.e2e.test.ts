import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = join(runtimeRoot, "tests/harness/output-main.ts");

test.each(["en-US", "zh-CN"])("createCli injects per-call JSON reporter (%s)", async (language) => {
  const configDir = mkdtempSync(join(tmpdir(), "bl-output-reporter-"));
  try {
    writeFileSync(join(configDir, "config.json"), JSON.stringify({ language, output: "json" }));
    writeFileSync(
      join(configDir, "update-state.json"),
      JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.0.0" }),
    );
    const result = await runNodeMain(main, ["probe", "--verbose"], {
      cwd: runtimeRoot,
      env: {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_QUIET: "1",
        DASHSCOPE_OUTPUT: "",
        DASHSCOPE_VERBOSE: "0",
        CI: "1",
      },
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ task_id: "task-demo" });
    const lines = result.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { warning: { code: "SKIPPED", message: language === "zh-CN" ? "已跳过" : "Skipped" } },
      { debug: { message: "HTTP response", details: { status: 200 } } },
    ]);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});
