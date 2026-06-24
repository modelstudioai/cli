import { describe, expect, test } from "vite-plus/test";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dataset (fine-tune file) E2E.
 *
 * The local validation tests have no network dependency and run in the
 * default suite. The remote upload/list/delete tests require DashScope
 * credentials and are gated by isDashScopeE2EReady().
 */

describe("e2e: dataset (offline)", () => {
  test("dataset --help 列出子命令", async () => {
    const { stdout, stderr, exitCode } = await runCli(["dataset"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/upload|list|get|delete|validate/);
  });

  test("dataset upload --help 正常退出并展示 --file", async () => {
    const { stderr, exitCode } = await runCli(["dataset", "upload", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--file|jsonl/i);
  });

  test("dataset validate 通过合法 JSONL", async () => {
    const file = join(__dirname, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ valid: boolean; format: string }>(stdout);
    expect(data.valid).toBe(true);
    expect(data.format).toBe("jsonl");
  });

  test("dataset validate 拒绝 pretty-printed JSON 并以非零码退出", async () => {
    const file = join(__dirname, ".dataset-invalid.jsonl");
    const { stdout, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    // The structured result is still emitted to stdout before the error throws.
    if (stdout.trim().length > 0) {
      const data = parseStdoutJson<{ valid: boolean; errors: unknown[] }>(stdout);
      expect(data.valid).toBe(false);
      expect(Array.isArray(data.errors)).toBe(true);
    }
  });

  test("dataset upload --no-validate --dry-run 跳过本地校验", async () => {
    const file = join(__dirname, ".dataset-invalid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "upload",
      "--file",
      file,
      "--no-validate",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; validate: boolean }>(stdout);
    expect(data.action).toBe("dataset.upload");
    expect(data.validate).toBe(false);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: dataset (DashScope)", () => {
  test("dataset list --output json 返回结构化结果", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "list",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ data?: { files?: unknown[] } }>(stdout);
    expect(data).toBeTruthy();
    if (data.data?.files) {
      expect(Array.isArray(data.data.files)).toBe(true);
    }
  }, 60_000);
});
