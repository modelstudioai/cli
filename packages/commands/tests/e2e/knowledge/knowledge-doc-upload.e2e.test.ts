import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
    const data = parseStdoutJson<{ steps: DryRunStep[]; skipped: string[] }>(stdout);
    expect(data.steps).toHaveLength(3);
    const leaseRequest = data.steps[0]!.request as { sizeBytes?: unknown; category?: string };
    expect(typeof leaseRequest.sizeBytes).toBe("string"); // gotcha: sizeBytes must be a string
    expect(leaseRequest.category).toBe("cate_test");
    // Single file path → no skipped entries
    expect(data.skipped).toEqual([]);
  });

  test("--dry-run 带 --index-id 输出 4 步且 job 请求含扁平 docIds", async () => {
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
    const data = parseStdoutJson<{ steps: DryRunStep[]; skipped: string[] }>(stdout);
    expect(data.steps).toHaveLength(4);
    const jobRequest = data.steps[3]!.request as {
      indexId?: string;
      sourceType?: string;
      docIds?: string[];
    };
    // Live-verified: the field name is docIds (not documentIds as in the
    // public docs); omitting sourceType would import the entire data center.
    expect(jobRequest.sourceType).toBe("DATA_CENTER_FILE");
    expect(jobRequest.docIds).toEqual(["<fileId>"]);
    expect(jobRequest.indexId).toBe("idx_test");
    expect(jobRequest).not.toHaveProperty("dataSource");
  });

  test("--file <dir> dry-run 展开目录且 skipped 包含不支持的文件", async () => {
    const dirFixture = mkdtempSync(join(tmpdir(), "doc-upload-dir-e2e-"));
    writeFileSync(join(dirFixture, "readme.md"), "# dir fixture\n");
    writeFileSync(join(dirFixture, "data.csv"), "a,b,c");
    writeFileSync(join(dirFixture, "config.json"), "{}"); // unsupported
    const subDir = join(dirFixture, "sub");
    mkdirSync(subDir);
    writeFileSync(join(subDir, "notes.txt"), "hello");

    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      dirFixture,
      "--category-id",
      "cate_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ steps: DryRunStep[]; skipped: string[] }>(stdout);
    // 3 supported files × 3 steps each = 9 steps
    expect(data.steps).toHaveLength(9);
    // config.json is the only unsupported file
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped[0]).toMatch(/config\.json$/);
  });

  test("--file <dir> 仅含不支持的文件报 USAGE", async () => {
    const unsupportedDir = mkdtempSync(join(tmpdir(), "doc-upload-unsupported-"));
    writeFileSync(join(unsupportedDir, "data.json"), "{}");
    writeFileSync(join(unsupportedDir, "script.py"), "print(1)");

    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      unsupportedDir,
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/No supported files found/i);
  });

  test("--file <dir> 自动跳过 node_modules/.git，其中文件不进 steps 也不进 skipped", async () => {
    const toolingDir = mkdtempSync(join(tmpdir(), "doc-upload-tooling-"));
    writeFileSync(join(toolingDir, "guide.md"), "# business doc\n");
    const nodeModulesDir = join(toolingDir, "node_modules");
    mkdirSync(nodeModulesDir);
    writeFileSync(join(nodeModulesDir, "vendored.md"), "# should never upload\n");
    const gitDir = join(toolingDir, ".git");
    mkdirSync(gitDir);
    writeFileSync(join(gitDir, "COMMIT_EDITMSG.txt"), "message");

    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      toolingDir,
      "--category-id",
      "cate_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ steps: DryRunStep[]; skipped: string[] }>(stdout);
    // Only guide.md is planned: 1 file × 3 steps
    expect(data.steps).toHaveLength(3);
    // Tooling directories are skipped silently — not even listed as skipped
    expect(data.skipped).toEqual([]);
    expect(JSON.stringify(data.steps)).not.toMatch(/vendored\.md|COMMIT_EDITMSG/);
  });
});

// Live write artifacts (data-center files) are cleaned up in place via the file delete command.
describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge doc upload (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("0KB 空文件被服务端拒绝：非零退出且透传服务端原因", async () => {
    const emptyPath = join(fixtureDir, `empty-${Date.now()}.md`);
    writeFileSync(emptyPath, "");
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      emptyPath,
      "--workspace-id",
      workspaceId,
    ]);
    expect(exitCode).not.toBe(0);
    // Server message passed through verbatim (lease rejects an empty SizeInBytes)
    expect(stderr).toMatch(/empty|SizeInBytes|InvalidParameter/i);
  }, 60_000);

  test("目录上传 --verbose 列出跳过文件明细与汇总计数", async () => {
    const verboseDir = mkdtempSync(join(tmpdir(), "doc-upload-verbose-"));
    writeFileSync(join(verboseDir, `verbose-${Date.now()}.md`), "# e2e verbose fixture\n");
    writeFileSync(join(verboseDir, "unsupported.xyz"), "skip me");

    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      verboseDir,
      "--workspace-id",
      workspaceId,
      "--verbose",
    ]);
    expect(exitCode, stderr).toBe(0);
    // Summary line always shows both counts; --verbose adds the skipped detail list
    expect(stdout).toMatch(/Uploaded 1 file, skipped 1 unsupported\./);
    expect(stdout).toMatch(/Skipped files:/);
    expect(stdout).toMatch(/unsupported\.xyz/);

    // Extract the fileId from the text output (`<name>  <fileId>  registered`) and clean up
    const fileId = stdout.match(/\s(file_\S+)\s+registered/)?.[1];
    expect(fileId, `无法从输出提取 fileId: ${stdout}`).toBeTruthy();
    const fileDeleteRun = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "file",
      "delete",
      "--file-id",
      fileId!,
      "--yes",
      "--workspace-id",
      workspaceId,
    ]);
    expect(fileDeleteRun.exitCode, fileDeleteRun.stderr).toBe(0);
  }, 120_000);

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

  test("upload --index-id --wait --poll-interval 3 (不报错验证)", async () => {
    // P6: --poll-interval — local behavior param, verify no error
    // Grab a real index id from the workspace
    const listRun = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(listRun.exitCode, listRun.stderr).toBe(0);
    const indexId = listRun.stdout.trim().split("\n")[0];
    if (!indexId) return;

    const pollFilePath = join(fixtureDir, `poll-${Date.now()}.md`);
    writeFileSync(pollFilePath, "# e2e poll interval fixture\n");
    const uploadRun = await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      pollFilePath,
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
    expect(uploadRun.exitCode, uploadRun.stderr).toBe(0);

    // Cleanup the uploaded file
    const importData = parseStdoutJson<{
      files: Array<{ fileId: string }>;
    }>(uploadRun.stdout);
    const pollFileId = importData.files?.[0]?.fileId;
    if (pollFileId) {
      await runCommandE2e(KNOWLEDGE_DOC_UPLOAD_ROUTES, [
        "knowledge",
        "file",
        "delete",
        "--file-id",
        pollFileId,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
    }
  }, 120_000);
});
