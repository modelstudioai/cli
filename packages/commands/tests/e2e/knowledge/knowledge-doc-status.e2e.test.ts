import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_DOC_STATUS_ROUTES } from "../topic-routes.ts";

// Live coverage depends on a real job_id produced by doc upload; it is exercised
// as part of the upload live chain.

describe("e2e: knowledge doc status", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
      "knowledge",
      "doc",
      "status",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--job-id/i);
    expect(stderr).toMatch(/--wait/i);
    expect(stderr).toMatch(/--poll-interval/i);
  });

  test("缺 --index-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
      "knowledge",
      "doc",
      "status",
      "--job-id",
      "job_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --job-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
      "knowledge",
      "doc",
      "status",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 query 同时含两个 id (双必填坑位)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
      "knowledge",
      "doc",
      "status",
      "--dry-run",
      "--index-id",
      "idx_test",
      "--job-id",
      "job_test",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string }>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index_job\/status/);
    expect(data.endpoint).toMatch(/index_id=idx_test/);
    expect(data.endpoint).toMatch(/job_id=job_test/);
  });

  test("--dry-run 断言分页参数 query 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
      "knowledge",
      "doc",
      "status",
      "--dry-run",
      "--index-id",
      "idx_test",
      "--job-id",
      "job_test",
      "--page-number",
      "2",
      "--page-size",
      "50",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string }>(stdout);
    expect(data.endpoint).toMatch(/page_number=2/);
    expect(data.endpoint).toMatch(/page_size=50/);
  });
});
