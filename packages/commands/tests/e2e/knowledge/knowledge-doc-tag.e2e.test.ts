import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_DOC_TAG_ROUTES } from "../topic-routes.ts";

describe("e2e: knowledge doc tag", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--doc-id/i);
    expect(stderr).toMatch(/--tag/i);
    expect(stderr).toMatch(/--mode/i);
  });

  test("缺 --doc-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--tag",
      "demo",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --tag 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("21 个 --doc-id 报 USAGE (2)", async () => {
    const docIdArgs = Array.from({ length: 21 }, (_, docIndex) => [
      "--doc-id",
      `file_${docIndex}`,
    ]).flat();
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      ...docIdArgs,
      "--tag",
      "demo",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("33 字符标签报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      "file_test",
      "--tag",
      "x".repeat(33),
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("101 个标签报 USAGE (2)", async () => {
    const tagArgs = Array.from({ length: 101 }, (_, tagIndex) => ["--tag", `t${tagIndex}`]).flat();
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      "file_test",
      ...tagArgs,
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("标签总长超 700 字符报 USAGE (2)", async () => {
    // 25 tags × 32 chars = 800 > 700, while each tag and the count stay within limits
    const tagArgs = Array.from({ length: 25 }, () => ["--tag", "x".repeat(32)]).flat();
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      "file_test",
      ...tagArgs,
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--mode 非法值报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      "file_test",
      "--tag",
      "demo",
      "--mode",
      "replace",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 updateMode 大写映射与 fileInfos 结构", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      "file_a",
      "--doc-id",
      "file_b",
      "--tag",
      "alpha",
      "--tag",
      "beta",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      endpoint?: string;
      request?: { fileInfos?: Array<{ fileId: string; tags: string[] }>; updateMode?: string };
    }>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/connector\/dash\/batchUpdateFileTag/);
    expect(data.request?.updateMode).toBe("APPEND");
    expect(data.request?.fileInfos).toEqual([
      { fileId: "file_a", tags: ["alpha", "beta"] },
      { fileId: "file_b", tags: ["alpha", "beta"] },
    ]);
  });

  test("--dry-run 断言 --mode overwrite 大写映射 OVERWRITE", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      "file_test",
      "--tag",
      "final",
      "--mode",
      "overwrite",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { updateMode?: string } }>(stdout);
    expect(data.request?.updateMode).toBe("OVERWRITE");
  });
});

describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge doc tag (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("对新上传文件打标断言 Success", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "doc-tag-e2e-"));
    const filePath = join(fixtureDir, `tag-${Date.now()}.md`);
    writeFileSync(filePath, "# doc tag e2e fixture\n");
    const uploadRun = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      filePath,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(uploadRun.exitCode, uploadRun.stderr).toBe(0);
    const fileId = uploadRun.stdout.trim();

    const tagRun = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      fileId,
      "--tag",
      "e2e-tag",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(tagRun.exitCode, tagRun.stderr).toBe(0);
    const data = parseStdoutJson<{ code: string }>(tagRun.stdout);
    expect(data.code).toBe("Success");

    // Verify the tag actually landed on the server via an independent read-back
    const tagGetRun = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "file",
      "get",
      "--file-id",
      fileId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(tagGetRun.exitCode, tagGetRun.stderr).toBe(0);
    const tagGetDetail = parseStdoutJson<{ data: { tags?: string[] } }>(tagGetRun.stdout);
    expect(tagGetDetail.data?.tags ?? []).toContain("e2e-tag");

    // overwrite mode replaces the tag set live (append above covered the default)
    const overwriteRun = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "doc",
      "tag",
      "--doc-id",
      fileId,
      "--tag",
      "e2e-tag-final",
      "--mode",
      "overwrite",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(overwriteRun.exitCode, overwriteRun.stderr).toBe(0);
    const overwriteData = parseStdoutJson<{ code: string }>(overwriteRun.stdout);
    expect(overwriteData.code).toBe("Success");

    // Verify overwrite replaced the tag set — old tag gone, new tag present
    const overwriteGetRun = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
      "knowledge",
      "file",
      "get",
      "--file-id",
      fileId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(overwriteGetRun.exitCode, overwriteGetRun.stderr).toBe(0);
    const overwriteGetDetail = parseStdoutJson<{ data: { tags?: string[] } }>(
      overwriteGetRun.stdout,
    );
    const overwriteTags = overwriteGetDetail.data?.tags ?? [];
    expect(overwriteTags).toContain("e2e-tag-final");
    expect(overwriteTags).not.toContain("e2e-tag");

    // Clean up the uploaded data-center file
    const fileDeleteRun = await runCommandE2e(KNOWLEDGE_DOC_TAG_ROUTES, [
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
  }, 120_000);
});
