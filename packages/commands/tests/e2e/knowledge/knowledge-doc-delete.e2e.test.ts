import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandHelp, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_DOC_DELETE_ROUTES } from "../topic-routes.ts";

describe("e2e: knowledge doc delete", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(KNOWLEDGE_DOC_DELETE_ROUTES, [
      "knowledge",
      "doc",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--doc-id/i);
    expect(stderr).toMatch(/--yes/i);
  });

  test("缺 --index-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_DELETE_ROUTES, [
      "knowledge",
      "doc",
      "delete",
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --doc-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_DOC_DELETE_ROUTES, [
      "knowledge",
      "doc",
      "delete",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 doc_ids 数组 (snake_case)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_DELETE_ROUTES, [
      "knowledge",
      "doc",
      "delete",
      "--index-id",
      "idx_test",
      "--doc-id",
      "file_a",
      "--doc-id",
      "file_b",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string; request?: Record<string, unknown> }>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/delete_file/);
    expect(data.request?.index_id).toBe("idx_test");
    expect(data.request?.doc_ids).toEqual(["file_a", "file_b"]);
  });

  test("无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_DOC_DELETE_ROUTES, [
      "knowledge",
      "doc",
      "delete",
      "--index-id",
      "idx_test",
      "--doc-id",
      "file_test",
      "--api-key",
      "sk-fake",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: {
        code: 7,
        type: "requires_confirmation",
        hint: expect.stringContaining("--yes"),
      },
    });
    expect(stderr).not.toContain("sk-fake");
  });
});

// Live coverage comes from the kb delete chain (deleting a knowledge base deletes
// its documents); a standalone doc delete live case needs a "delete documents
// without deleting the base" scenario, covered by the chunk/category/file live chain.
