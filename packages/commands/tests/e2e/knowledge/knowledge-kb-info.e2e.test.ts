import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_KB_INFO_ROUTES } from "../topic-routes.ts";

describe("e2e: knowledge kb info", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_INFO_ROUTES, [
      "knowledge",
      "info",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --index-id 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_INFO_ROUTES, [
      "knowledge",
      "info",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--index-id|Usage:/i);
  });

  test("--dry-run 输出 list endpoint (含 pipeline_id 过滤)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_INFO_ROUTES, [
      "knowledge",
      "info",
      "--dry-run",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string }>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/list/);
    expect(data.endpoint).toMatch(/pipeline_id=idx_test/);
  });
});

interface KbListQuietResult {
  stdout: string;
}

describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge kb info (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("先 list 取 id 再 info 断言分组字段", async () => {
    const listRun: KbListQuietResult = await runCommandE2e(KNOWLEDGE_KB_INFO_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    const firstId = listRun.stdout.trim().split("\n")[0];
    if (!firstId) return; // skip assertions when the workspace has no knowledge bases
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_INFO_ROUTES, [
      "knowledge",
      "info",
      "--index-id",
      firstId,
      "--workspace-id",
      workspaceId,
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/Basic:/);
    expect(stdout).toMatch(/Indexing:/);
    expect(stdout).toMatch(/immutable/);
    expect(stdout).toMatch(/Retrieval:/);
  });

  test("不存在的 id 非零退出并给 hint", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_INFO_ROUTES, [
      "knowledge",
      "info",
      "--index-id",
      "idx-not-exist-e2e",
      "--workspace-id",
      workspaceId,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/not found/i);
  });
});
