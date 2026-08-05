import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_DOC_UPLOAD_ROUTES } from "../topic-routes.ts";

const fixtureDir = mkdtempSync(join(tmpdir(), "doc-upload-e2e-"));
const smallMd = join(fixtureDir, "small.md");
writeFileSync(smallMd, "# e2e fixture\n");

interface DryRunStep {
  step: string;
  endpoint: string;
  request: unknown;
}

describe("e2e: knowledge doc upload", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--file/i);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--category-id/i);
    expect(stderr).toMatch(/--tag/i);
    expect(stderr).toMatch(/--wait/i);
  });

  test("缺 --file 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--wait 无 --index-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      smallMd,
      "--wait",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("文件不存在非零退出且 hint 含 errno", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      join(fixtureDir, "missing.md"),
      "--workspace-id",
      "ws_test",
      "--dry-run",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/ENOENT|Cannot read file/i);
  });

  test(".zip 扩展名报 USAGE 并列出支持格式", async () => {
    const zipPath = join(fixtureDir, "bad.zip");
    writeFileSync(zipPath, "PK");
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      zipPath,
      "--workspace-id",
      "ws_test",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/\.pdf/);
  });

  test("--dry-run 不带 --index-id 输出 3 步编排计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      smallMd,
      "--category-id",
      "cate_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ steps: DryRunStep[] }>(stdout);
    expect(data.steps).toHaveLength(3);
    const leaseRequest = data.steps[0]!.request as { sizeBytes?: unknown; category?: string };
    expect(typeof leaseRequest.sizeBytes).toBe("string"); // gotcha: sizeBytes must be a string
    expect(leaseRequest.category).toBe("cate_test");
  });

  test("--dry-run 带 --index-id 输出 4 步且 job 请求含显式 sourceType", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      smallMd,
      "--category-id",
      "cate_test",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ steps: DryRunStep[] }>(stdout);
    expect(data.steps).toHaveLength(4);
    const jobRequest = data.steps[3]!.request as {
      indexId?: string;
      dataSource?: { sourceType?: string; fileIds?: string[] };
    };
    // Live-verified gotcha: job/create requires the nested dataSource shape, and
    // omitting sourceType would import the entire data center
    expect(jobRequest.dataSource?.sourceType).toBe("DATA_CENTER_FILE");
    expect(jobRequest.indexId).toBe("idx_test");
    expect(jobRequest).not.toHaveProperty("documentIds");
  });
});

// Live write artifacts (data-center files) are cleaned up in place via the file delete command.
describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge doc upload (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("上传 2 个 md 返回各自 file_ 前缀 fileId (多文件 happy path)", async () => {
    const livePathA = join(fixtureDir, `live-a-${Date.now()}.md`);
    const livePathB = join(fixtureDir, `live-b-${Date.now()}.md`);
    writeFileSync(livePathA, "# e2e live upload fixture A\n");
    writeFileSync(livePathB, "# e2e live upload fixture B\n");
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      livePathA,
      "--file",
      livePathB,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const fileIds = stdout.trim().split("\n").filter(Boolean);
    expect(fileIds).toHaveLength(2);
    for (const fileId of fileIds) {
      expect(fileId).toMatch(/^file_/);
    }

    // Clean up both uploaded data-center files
    for (const fileId of fileIds) {
      const fileDeleteRun = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
        "knowledge",
        "file",
        "delete",
        "--file-id",
        fileId,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
      expect(fileDeleteRun.exitCode, fileDeleteRun.stderr).toBe(0);
    }
  }, 120_000);
});
