import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_DOC_LIST_ROUTES } from "../topic-routes.ts";

describe("e2e: knowledge doc list", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(KNOWLEDGE_DOC_LIST_ROUTES, [
      "knowledge",
      "doc",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--page-number/i);
    expect(stderr).toMatch(/--page-size/i);
  });

  test("缺 --index-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_LIST_ROUTES, [
      "knowledge",
      "doc",
      "list",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--page-size 101 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_LIST_ROUTES, [
      "knowledge",
      "doc",
      "list",
      "--index-id",
      "idx_test",
      "--page-size",
      "101",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 query 参数名为 page_num (本接口坑位)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_LIST_ROUTES, [
      "knowledge",
      "doc",
      "list",
      "--dry-run",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
      "--page-number",
      "3",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string }>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/files/);
    expect(data.endpoint).toMatch(/index_id=idx_test/);
    expect(data.endpoint).toMatch(/page_num=3/);
    expect(data.endpoint).not.toMatch(/page_number/);
  });
});

describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge doc list (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("对真实库列出文档 (可为空)", async () => {
    const listRun = await runCommandE2e(KNOWLEDGE_DOC_LIST_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    const firstIndexId = listRun.stdout.trim().split("\n")[0];
    if (!firstIndexId) return;
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_LIST_ROUTES, [
      "knowledge",
      "doc",
      "list",
      "--index-id",
      firstIndexId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ code: string }>(stdout);
    expect(data.code).toBe("Success");

    // P6: --page-number + --page-size
    const pagedRun = await runCommandE2e(KNOWLEDGE_DOC_LIST_ROUTES, [
      "knowledge",
      "doc",
      "list",
      "--index-id",
      firstIndexId,
      "--page-number",
      "1",
      "--page-size",
      "10",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(pagedRun.exitCode, pagedRun.stderr).toBe(0);
    const pagedData = parseStdoutJson<{ code: string }>(pagedRun.stdout);
    expect(pagedData.code).toBe("Success");
  });
});
