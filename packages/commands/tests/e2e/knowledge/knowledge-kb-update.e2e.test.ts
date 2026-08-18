import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_KB_UPDATE_ROUTES } from "../topic-routes.ts";

describe("e2e: knowledge kb update", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_UPDATE_ROUTES, [
      "knowledge",
      "update",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--name/i);
    expect(stderr).toMatch(/--description/i);
    expect(stderr).toMatch(/--rerank-min-score/i);
  });

  test("缺 --index-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_UPDATE_ROUTES, [
      "knowledge",
      "update",
      "--description",
      "x",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("无修改项报 USAGE (2) 'Nothing to update'", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_UPDATE_ROUTES, [
      "knowledge",
      "update",
      "--index-id",
      "idx_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/nothing to update/i);
  });

  test("--rerank-min-score 1.5 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_UPDATE_ROUTES, [
      "knowledge",
      "update",
      "--index-id",
      "idx_test",
      "--rerank-min-score",
      "1.5",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--name 21 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_UPDATE_ROUTES, [
      "knowledge",
      "update",
      "--index-id",
      "idx_test",
      "--name",
      "x".repeat(21),
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run 断言 body 键名为 id (本接口坑位)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_UPDATE_ROUTES, [
      "knowledge",
      "update",
      "--index-id",
      "idx_test",
      "--description",
      "new desc",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string; request?: Record<string, unknown> }>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/update/);
    expect(data.request?.id).toBe("idx_test");
    expect(data.request).not.toHaveProperty("index_id");
    expect(data.request?.description).toBe("new desc");
  });

  test("--dry-run 断言 rerankMinScore body 键名映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_UPDATE_ROUTES, [
      "knowledge",
      "update",
      "--index-id",
      "idx_test",
      "--rerank-min-score",
      "0.3",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: Record<string, unknown> }>(stdout);
    expect(data.request?.rerankMinScore).toBe(0.3);
  });
});

// Live coverage: the kb delete self-cleaning chain (knowledge-kb-delete.e2e.test.ts)
// runs a live update step between create and delete.
