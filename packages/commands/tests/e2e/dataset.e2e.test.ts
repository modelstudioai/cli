import { describe, expect, test } from "vite-plus/test";
import { join } from "path";
import {
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  e2eFixturesDir,
} from "./helpers.ts";
import { DATASET_ROUTES } from "./topic-routes.ts";

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
  test("dataset upload --help 正常退出并展示 --file", async () => {
    const { stderr, exitCode } = await runCommandHelp(DATASET_ROUTES, [
      "dataset",
      "upload",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--file|jsonl/i);
  });

  test("dataset validate 通过合法 JSONL", async () => {
    const file = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-invalid.jsonl");
    const { stdout, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-invalid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-dpo-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-cpt-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-valid.jsonl"); // SFT {messages}, no text
    const { stdout, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-dpo-invalid.jsonl");
    const { stdout, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-dpo-invalid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
    const file = join(e2eFixturesDir, ".dataset-dpo-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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

  test("dataset upload --schema image --no-validate --dry-run 采用 1GB 媒体上限", async () => {
    // image schema raises the upload cap to 1 GiB (vs 300 MB for text).
    // --no-validate keeps this offline (the jsonl fixture is not a real zip).
    const file = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
      "dataset",
      "upload",
      "--file",
      file,
      "--schema",
      "image",
      "--no-validate",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; schema: string; max_bytes: number }>(stdout);
    expect(data.action).toBe("dataset.upload");
    expect(data.schema).toBe("image");
    expect(data.max_bytes).toBe(1024 * 1024 * 1024);
  });

  test.each(["tts", "image"])("dataset upload --dry-run 接受媒体 schema %s", async (schema) => {
    const file = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
      "dataset",
      "upload",
      "--file",
      file,
      "--schema",
      schema,
      "--no-validate",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; schema: string }>(stdout);
    expect(data.action).toBe("dataset.upload");
    expect(data.schema).toBe(schema);
  });

  test("dataset validate --schema video 拒绝（视频生成入口已隐藏）", async () => {
    const file = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
      "dataset",
      "validate",
      "--file",
      file,
      "--schema",
      "video",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/--schema video is not supported/);
  });

  test("dataset upload --schema video 拒绝（视频生成入口已隐藏）", async () => {
    const file = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
      "dataset",
      "upload",
      "--file",
      file,
      "--schema",
      "video",
      "--no-validate",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/--schema video is not supported/);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: dataset (DashScope)", () => {
  test("dataset list --output json 返回结构化结果", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DATASET_ROUTES, [
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
