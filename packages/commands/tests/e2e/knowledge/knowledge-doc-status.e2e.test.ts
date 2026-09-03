import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_DOC_STATUS_ROUTES } from "../topic-routes.ts";

// Live coverage depends on a real job_id produced by doc upload; it is exercised
// as part of the upload live chain.

describe("e2e: knowledge doc status", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(KNOWLEDGE_DOC_STATUS_ROUTES, [
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

// Live: --wait + --poll-interval on a real job_id produced by upload --index-id --wait
describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge doc status (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("不存在的 index/job: 服务端错误原样透传 (非零退出)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
      "knowledge",
      "doc",
      "status",
      "--index-id",
      "idx_nonexistent_e2e",
      "--job-id",
      "job_nonexistent_e2e",
      "--workspace-id",
      workspaceId,
    ]);
    expect(exitCode).not.toBe(0);
    // Verified live: Index.IndexNotExist for an unknown index; a real index with
    // an unknown job id reports Index.IndexJobNotExist — both pass through verbatim
    expect(stderr).toMatch(/not exist/i);
  }, 60_000);

  test("status --wait --poll-interval → 返回 COMPLETED", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "doc-status-e2e-"));
    const filePathA = join(fixtureDir, `status-a-${Date.now()}.md`);
    writeFileSync(filePathA, "# doc status e2e fixture A\n");

    // 1) Upload file A to data center
    const uploadRunA = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      filePathA,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(uploadRunA.exitCode, uploadRunA.stderr).toBe(0);
    const fileIdA = uploadRunA.stdout.trim();
    expect(fileIdA).toMatch(/^file_/);

    let indexId = "";
    let fileIdB = "";
    try {
      // 2) Create a throwaway base (gives us an index_id)
      const createRun = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
        "knowledge",
        "create",
        "--name",
        `e2e-st-${Date.now() % 100000000}`,
        "--description",
        "e2e fixture knowledge base (safe to delete)",
        "--doc-id",
        fileIdA,
        "--workspace-id",
        workspaceId,
        "--wait",
        "--quiet",
      ]);
      expect(createRun.exitCode, createRun.stderr).toBe(0);
      indexId = createRun.stdout.trim().split("\n")[0]!;
      expect(indexId).toBeTruthy();

      // 3) Upload file B to the base (--index-id --wait --output json) → ingestion_id
      const filePathB = join(fixtureDir, `status-b-${Date.now()}.md`);
      writeFileSync(filePathB, "# doc status e2e fixture B\n");
      const uploadRunB = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
        "knowledge",
        "doc",
        "upload",
        "--file",
        filePathB,
        "--index-id",
        indexId,
        "--wait",
        "--poll-interval",
        "3",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(uploadRunB.exitCode, uploadRunB.stderr).toBe(0);
      const importData = parseStdoutJson<{
        files: Array<{ fileId: string }>;
        ingestion_id?: string;
        final_status?: string;
      }>(uploadRunB.stdout);
      const jobId = importData.ingestion_id;
      expect(jobId).toBeTruthy();
      fileIdB = importData.files?.[0]?.fileId ?? "";

      // 4) status --wait --poll-interval: verify COMPLETED
      //    (upload --wait already ensured completion, so this should return immediately)
      const statusRun = await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
        "knowledge",
        "doc",
        "status",
        "--index-id",
        indexId,
        "--job-id",
        jobId!,
        "--wait",
        "--poll-interval",
        "3",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(statusRun.exitCode, statusRun.stderr).toBe(0);
      // JSON mode passes the server response through — the job state field is
      // ingestion_status (final_status only exists in doc upload's own output)
      const statusData = parseStdoutJson<{
        data?: { ingestion_status?: string };
      }>(statusRun.stdout);
      expect(statusData.data?.ingestion_status).toBe("COMPLETED");
    } finally {
      // Cleanup base + data-center files
      if (fileIdB) {
        await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
          "knowledge",
          "file",
          "delete",
          "--file-id",
          fileIdB,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
      }
      if (indexId) {
        await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
          "knowledge",
          "delete",
          "--index-id",
          indexId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
      }
      await runCommandE2e(KNOWLEDGE_DOC_STATUS_ROUTES, [
        "knowledge",
        "file",
        "delete",
        "--file-id",
        fileIdA,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
    }
    // kb create --wait adds a full import phase — generous timeout
  }, 600_000);
});
