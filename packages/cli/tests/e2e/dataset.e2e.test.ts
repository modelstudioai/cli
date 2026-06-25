import { describe, expect, test } from "vite-plus/test";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dataset (fine-tune file) E2E.
 *
 * The suite exercises command discovery, help text, local dataset validation,
 * and the `--dry-run` upload preview with no network dependency. Because
 * `ensureApiKey` runs before every command (see main.ts), these cases are
 * gated by isDashScopeE2EReady() — they are skipped when no DashScope
 * credential is present (e.g. on CI) and run offline when one is. (`dataset
 * validate` itself is keyless via skipDefaultApiKeySetup, but the rest of the
 * suite needs a key, so the whole offline block is gated together.) The
 * remote list test is also gated.
 */

describe.skipIf(!isDashScopeE2EReady())("e2e: dataset (offline)", () => {
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

  test("dataset validate 自动识别 DPO 并校验 chosen/rejected", async () => {
    // No --schema: a record carrying chosen/rejected is auto-detected as DPO
    // and the valid fixture passes.
    const file = join(__dirname, ".dataset-dpo-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ valid: boolean; stats: { totalRecords?: number } }>(stdout);
    expect(data.valid).toBe(true);
    expect(data.stats.totalRecords).toBe(2);
  });

  test("dataset validate 自动识别 CPT 并校验 {text} 记录", async () => {
    // No --schema: a record carrying `text` (and no `messages`) is auto-detected
    // as CPT and the valid fixture passes.
    const file = join(__dirname, ".dataset-cpt-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ valid: boolean; stats: { totalRecords?: number } }>(stdout);
    expect(data.valid).toBe(true);
    expect(data.stats.totalRecords).toBe(2);
  });

  test("dataset validate --schema cpt 拒绝缺失 text 的记录", async () => {
    const file = join(__dirname, ".dataset-valid.jsonl"); // SFT {messages}, no text
    const { stdout, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--schema",
      "cpt",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    const data = parseStdoutJson<{ valid: boolean; errors: { code: string; path?: string }[] }>(
      stdout,
    );
    expect(data.valid).toBe(false);
    expect(data.errors.map((e) => e.code)).toContain("MISSING_TEXT");
  });

  test("dataset validate --schema dpo 拒绝缺失 rejected 的记录", async () => {
    const file = join(__dirname, ".dataset-dpo-invalid.jsonl");
    const { stdout, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--schema",
      "dpo",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    const data = parseStdoutJson<{ valid: boolean; errors: { code: string; path?: string }[] }>(
      stdout,
    );
    expect(data.valid).toBe(false);
    expect(data.errors.map((e) => e.code)).toContain("MISSING_REJECTED");
  });

  test("dataset validate --schema chatml 忽略 chosen/rejected（不报 DPO 错误）", async () => {
    // Same invalid-DPO file, but --schema chatml must not run DPO checks.
    const file = join(__dirname, ".dataset-dpo-invalid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--schema",
      "chatml",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ valid: boolean; errors: { code: string }[] }>(stdout);
    expect(data.valid).toBe(true);
    expect(data.errors.filter((c) => c.code.startsWith("MISSING_"))).toEqual([]);
  });

  test("dataset validate --schema <bad> 以非零码退出", async () => {
    const file = join(__dirname, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "validate",
      "--file",
      file,
      "--schema",
      "sft",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/Unsupported --schema/);
  });

  test("dataset upload --dry-run 转发 --schema", async () => {
    const file = join(__dirname, ".dataset-dpo-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "dataset",
      "upload",
      "--file",
      file,
      "--schema",
      "dpo",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; schema: string }>(stdout);
    expect(data.action).toBe("dataset.upload");
    expect(data.schema).toBe("dpo");
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
