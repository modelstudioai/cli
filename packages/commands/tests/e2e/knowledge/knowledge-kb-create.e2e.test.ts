import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { KNOWLEDGE_KB_CREATE_ROUTES } from "../topic-routes.ts";

interface DryRunBody {
  endpoint?: string;
  request?: {
    description?: string;
    sourceType?: string;
    sinkType?: string;
    docIds?: string[];
    categoryIds?: string[];
    embeddingModelName?: string;
    chunkSize?: number;
  };
}

describe("e2e: knowledge kb create", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--name/i);
    expect(stderr).toMatch(/--description/i);
    expect(stderr).toMatch(/--doc-id/i);
    expect(stderr).toMatch(/--category-id/i);
    expect(stderr).toMatch(/--embedding-model/i);
    expect(stderr).toMatch(/--chunk-size/i);
  });

  test("缺 --name 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--description",
      "demo base",
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  // The server rejects a missing description with HTTP 400 (Index.InvalidParameter);
  // the CLI must stop it locally instead.
  test("缺 --description 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "demo",
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--description 501 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "demo",
      "--description",
      "x".repeat(501),
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("无数据源 flag 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "demo",
      "--description",
      "demo base",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("两数据源同传报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "demo",
      "--description",
      "demo base",
      "--doc-id",
      "file_test",
      "--category-id",
      "cate_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--name 21 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "x".repeat(21),
      "--description",
      "demo base",
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("--dry-run + --doc-id 断言 DATA_CENTER_FILE / docIds / BUILT_IN", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "demo",
      "--description",
      "demo base",
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/create_v2/);
    expect(data.request?.sourceType).toBe("DATA_CENTER_FILE");
    expect(data.request?.docIds).toEqual(["file_test"]);
    expect(data.request?.sinkType).toBe("BUILT_IN");
    // description is a server-required field — it must reach the request body verbatim
    expect(data.request?.description).toBe("demo base");
    // Defaults are part of the contract — the server applies no fallback of its own
    expect(data.request?.embeddingModelName).toBe("text-embedding-v4");
    expect(data.request?.chunkSize).toBe(600);
  });

  test("--dry-run 断言 --embedding-model/--chunk-size 在 body 中的映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "demo",
      "--description",
      "demo base",
      "--doc-id",
      "file_test",
      "--embedding-model",
      "text-embedding-v3",
      "--chunk-size",
      "300",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.embeddingModelName).toBe("text-embedding-v3");
    expect(data.request?.chunkSize).toBe(300);
  });

  test("--dry-run + --category-id 断言 DATA_CENTER_CATEGORY / categoryIds", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_KB_CREATE_ROUTES, [
      "knowledge",
      "create",
      "--name",
      "demo",
      "--description",
      "demo base",
      "--category-id",
      "cate_test",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.sourceType).toBe("DATA_CENTER_CATEGORY");
    expect(data.request?.categoryIds).toEqual(["cate_test"]);
  });
});

// The live self-cleaning chain lives in knowledge-kb-delete.e2e.test.ts (upload → create → delete).
