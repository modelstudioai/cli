// chunk / stats / category / file / collection / import-oss commands: the static
// group covers help/missing-args/dry-run gotchas per command; the live group runs
// the full chunk chain (add → list → update → delete) plus category/file read-write chains.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  isImageKbE2EReady,
  isKbAdminE2EReady,
  isOssImportE2EReady,
  isTableKbE2EReady,
  parseStdoutJson,
  runCommandE2e,
} from "../helpers.ts";
import {
  KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES,
  KNOWLEDGE_KB_DELETE_ROUTES,
} from "../topic-routes.ts";
import { deleteKbWithRetry, pollUntil } from "./journeys/journey-helpers.ts";
import { VERIFIED_RERANK_MODEL } from "./verified-models.ts";

interface DryRunBody {
  endpoint?: string;
  request?: Record<string, unknown>;
}

const COMMON = ["--workspace-id", "ws_test", "--dry-run", "--output", "json"];

// --help smoke across all commands in this group: [command path, representative flag expected in help]
const HELP_SMOKE_CASES: Array<[string[], RegExp]> = [
  [["knowledge", "chunk", "list"], /--doc-id/i],
  [["knowledge", "chunk", "update"], /--exclude/i],
  [["knowledge", "chunk", "delete"], /--chunk-id/i],
  [["knowledge", "stats"], /--start/i],
  [["knowledge", "category", "list"], /--next-token/i],
  [["knowledge", "category", "add"], /--parent-id/i],
  [["knowledge", "category", "delete"], /--category-id/i],
  [["knowledge", "file", "list"], /--category-id/i],
  [["knowledge", "file", "get"], /--file-id/i],
  [["knowledge", "file", "delete"], /--yes/i],
  [["knowledge", "collection", "create"], /--store-type/i],
  [["knowledge", "collection", "get"], /--collection-id/i],
  [["knowledge", "doc", "import-oss"], /--oss-key/i],
];

describe("e2e: chunk/category/file 全命令 --help 冒烟", () => {
  test("12 条命令 help 退出 0 且展示代表性 flag（chunk add 单独测）", async () => {
    for (const [commandPath, flagPattern] of HELP_SMOKE_CASES) {
      const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        ...commandPath,
        "--help",
      ]);
      expect(exitCode, `${commandPath.join(" ")}: ${stderr}`).toBe(0);
      expect(stderr, commandPath.join(" ")).toMatch(flagPattern);
    }
  }, 60_000);
});

describe("e2e: knowledge chunk 组 (静态)", () => {
  test("chunk add: --help 展示双通道 flags", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--content/i);
    expect(stderr).toMatch(/--field/i);
    expect(stderr).toMatch(/--image-url/i);
  });

  test("chunk add: --content 与 --field 同传 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--content",
      "hello",
      "--field",
      "colA=1",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk add: --field 无 = 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--field",
      "novalue",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk add: 无任何内容 flag 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--content|--field/);
  });

  test("chunk add: --content 与 --content-file 同传 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--content",
      "hello",
      "--content-file",
      "/tmp/whatever.md",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk add: --content 6001 字符 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--content",
      "x".repeat(6001),
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk add: --title 51 字符 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--content",
      "hello",
      "--title",
      "x".repeat(51),
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk add: 11 个 --image-url 报 USAGE (2)", async () => {
    const imageUrlArgs = Array.from({ length: 11 }, (_, urlIndex) => [
      "--image-url",
      `https://example.com/img${urlIndex}.png`,
    ]).flat();
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      ...imageUrlArgs,
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk add: dry-run 断言 pipelineId + field 键值原样", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--field",
      "列A=v=1",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/chunk\/create/);
    expect(data.request?.pipelineId).toBe("idx_test");
    const fieldMap = data.request?.field as Record<string, string> | undefined;
    expect(fieldMap?.["列A"]).toBe("v=1");
  });

  test("chunk add: --content-file 读文件并映射为 field.content", async () => {
    const contentDir = mkdtempSync(join(tmpdir(), "chunk-add-cf-"));
    const contentPath = join(contentDir, "chunk.md");
    writeFileSync(contentPath, "content-file channel fixture body");
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--content-file",
      contentPath,
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    const fieldMap = data.request?.field as Record<string, unknown> | undefined;
    expect(fieldMap?.content).toBe("content-file channel fixture body");
  });

  test("chunk add: dry-run 断言 title/image_urls 键名映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      "idx_test",
      "--content",
      "hello",
      "--title",
      "intro",
      "--image-url",
      "https://example.com/a.png",
      "--image-url",
      "https://example.com/b.png",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    const fieldMap = data.request?.field as Record<string, unknown> | undefined;
    expect(fieldMap?.title).toBe("intro");
    // Gotcha: the request key is image_urls (snake, plural), not imageUrl
    expect(fieldMap?.image_urls).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
    expect(fieldMap).not.toHaveProperty("imageUrl");
  });

  test("chunk list: dry-run 断言 pageNum/pageSize 键名 (camelCase 坑位)", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "list",
      "--index-id",
      "idx_test",
      "--page-number",
      "2",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.pageNum).toBe(2);
    expect(data.request?.indexId).toBe("idx_test");
    expect(data.request).not.toHaveProperty("page_num");
  });

  test("chunk list: --page-size 101 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "list",
      "--index-id",
      "idx_test",
      "--page-size",
      "101",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk update: content 9 字符 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "update",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--doc-id",
      "file_test",
      "--content",
      "123456789",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk update: --content-file 内容 9 字符 dry-run 预演报 USAGE (2)", async () => {
    // Rehearsal semantics: dry-run reads the file and enforces the 10-6000 range
    const contentDir = mkdtempSync(join(tmpdir(), "chunk-upd-cf-"));
    const contentPath = join(contentDir, "short.txt");
    writeFileSync(contentPath, "123456789");
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "update",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--doc-id",
      "file_test",
      "--content-file",
      contentPath,
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk update: 无修改项 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "update",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--doc-id",
      "file_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/nothing to update/i);
  });

  test("chunk update: --content 与 --content-file 同传 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "update",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--doc-id",
      "file_test",
      "--content",
      "corrected content text",
      "--content-file",
      "/tmp/whatever.md",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk update: --title 51 字符 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "update",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--doc-id",
      "file_test",
      "--title",
      "x".repeat(51),
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk update: --exclude 与 --include 互斥 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "update",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--doc-id",
      "file_test",
      "--exclude",
      "--include",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("chunk update: dry-run 断言 isDisplayedChunkContent 缺省 true", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "update",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--doc-id",
      "file_test",
      "--content",
      "corrected content text",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.pipelineId).toBe("idx_test");
    expect(data.request?.isDisplayedChunkContent).toBe(true);
  });

  test("chunk delete: dry-run 12 个 id 分 2 批", async () => {
    const chunkIdArgs = Array.from({ length: 12 }, (_, chunkIndex) => [
      "--chunk-id",
      `chunk_${chunkIndex}`,
    ]).flat();
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "delete",
      "--index-id",
      "idx_test",
      ...chunkIdArgs,
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ batches: Array<{ request: { chunkIds: string[] } }> }>(stdout);
    expect(data.batches).toHaveLength(2);
    expect(data.batches[0]!.request.chunkIds).toHaveLength(10);
    expect(data.batches[1]!.request.chunkIds).toHaveLength(2);
  });

  test("chunk delete: 非 TTY 无 --yes 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "delete",
      "--index-id",
      "idx_test",
      "--chunk-id",
      "chunk_test",
      "--api-key",
      "sk-fake",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--yes/);
  });
});

describe("e2e: kb stats / category / file / connector / import-oss (静态)", () => {
  test("kb stats: dry-run 断言秒级字符串时间戳", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "stats",
      "--index-id",
      "idx_test",
      "--start",
      "2026-07-30T00:00:00Z",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/index\/monitor/);
    expect(data.request?.startTimestamp).toBe("1785369600");
    expect(typeof data.request?.endTimestamp).toBe("string");
  });

  test("kb stats: 13 位毫秒时间戳归一为秒", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "stats",
      "--index-id",
      "idx_test",
      "--start",
      "1785369600000",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.startTimestamp).toBe("1785369600");
  });

  test("kb stats: 非法时间报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "stats",
      "--index-id",
      "idx_test",
      "--start",
      "not-a-date",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("category list: dry-run 断言 type=UNSTRUCTURED 与 maxResult 单数键名", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "category",
      "list",
      "--max-result",
      "5",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/listCategory/);
    expect(data.request?.type).toBe("UNSTRUCTURED");
    expect(data.request?.maxResult).toBe(5);
    expect(data.request).not.toHaveProperty("maxResults");
  });

  test("category add: --name 21 字符 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "category",
      "add",
      "--name",
      "x".repeat(21),
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("category add: dry-run 断言 parentCategoryId/connectorId 键名映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "category",
      "add",
      "--name",
      "sub-cate",
      "--parent-id",
      "cate_parent",
      "--collection-id",
      "conn_test",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/addCategory/);
    expect(data.request?.categoryName).toBe("sub-cate");
    expect(data.request?.categoryType).toBe("UNSTRUCTURED");
    expect(data.request?.parentCategoryId).toBe("cate_parent");
    expect(data.request?.connectorId).toBe("conn_test");
  });

  test("category delete: 非 TTY 无 --yes 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "category",
      "delete",
      "--category-id",
      "cate_test",
      "--api-key",
      "sk-fake",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--yes/);
  });

  test("file list: 缺 --category-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "file",
      "list",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("file list: dry-run 断言 fileIds 数组与 fileName/nextToken 键名透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "file",
      "list",
      "--category-id",
      "cate_test",
      "--name",
      "report",
      "--file-id",
      "file_a",
      "--file-id",
      "file_b",
      "--next-token",
      "tok_1",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/listFile/);
    expect(data.request?.fileIds).toEqual(["file_a", "file_b"]);
    expect(data.request?.nextToken).toBe("tok_1");
    // Gotcha: the filter key is fileName, not name
    expect(data.request?.fileName).toBe("report");
    expect(data.request).not.toHaveProperty("name");
  });

  test("file get: dry-run 断言 fileId", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "file",
      "get",
      "--file-id",
      "file_test",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/describeFile/);
    expect(data.request?.fileId).toBe("file_test");
  });

  test("file delete: 非 TTY 无 --yes 报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "file",
      "delete",
      "--file-id",
      "file_test",
      "--api-key",
      "sk-fake",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--yes/);
  });

  test("collection create: --name 21 字符 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "create",
      "--name",
      "x".repeat(21),
      "--description",
      "d",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("collection create: --store-type 非法值 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "create",
      "--name",
      "demo",
      "--description",
      "d",
      "--store-type",
      "oss",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("collection create: custom 缺 oss 参数 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "create",
      "--name",
      "demo",
      "--description",
      "d",
      "--store-type",
      "custom",
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("collection create: dry-run 断言 FILE + PLATFORM 缺省", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "create",
      "--name",
      "demo",
      "--description",
      "team docs",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.connectorType).toBe("FILE");
    const connectorConfig = data.request?.fileConnectorConfig as { storeType?: string } | undefined;
    expect(connectorConfig?.storeType).toBe("PLATFORM");
  });

  test("collection create: custom dry-run 断言 regionId/bucketName 键名映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "create",
      "--name",
      "oss-coll",
      "--description",
      "own bucket",
      "--store-type",
      "custom",
      "--oss-region",
      "cn-beijing",
      "--oss-bucket",
      "my-bucket",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    const connectorConfig = data.request?.fileConnectorConfig as
      | { storeType?: string; regionId?: string; bucketName?: string }
      | undefined;
    expect(connectorConfig?.storeType).toBe("CUSTOM");
    // CUSTOM fields are regionId/bucketName per add-connector.md — the earlier
    // ossRegionId/ossBucket implementation was rejected live with InvalidParameter
    expect(connectorConfig?.regionId).toBe("cn-beijing");
    expect(connectorConfig?.bucketName).toBe("my-bucket");
    expect(connectorConfig).not.toHaveProperty("ossRegionId");
    expect(connectorConfig).not.toHaveProperty("ossBucket");
  });

  test("collection get: 都缺 / 都传 均 USAGE (2)", async () => {
    const bothMissing = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "get",
      "--workspace-id",
      "ws_test",
    ]);
    expect(bothMissing.exitCode).toBe(2);
    const bothGiven = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "get",
      "--collection-id",
      "conn_test",
      "--name",
      "demo",
      "--workspace-id",
      "ws_test",
    ]);
    expect(bothGiven.exitCode).toBe(2);
  });

  test("collection get: dry-run 断言 connectorName 键名", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "get",
      "--name",
      "my-conn",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/getConnector/);
    expect(data.request?.connectorName).toBe("my-conn");
    expect(data.request).not.toHaveProperty("connectorId");
  });

  test("doc import-oss: 缺 --bucket 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "import-oss",
      "--region",
      "cn-beijing",
      "--oss-key",
      "docs/a.pdf",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
  });

  test("doc import-oss: dry-run 断言 fileDetails 派生与 tag/overwrite/category 映射", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "import-oss",
      "--bucket",
      "my-bucket",
      "--region",
      "cn-beijing",
      "--oss-key",
      "docs/a.pdf",
      "--category-id",
      "cate_x",
      "--tag",
      "alpha",
      "--overwrite",
      ...COMMON,
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/addFilesFromAuthorizedOss/);
    expect(data.request?.categoryType).toBe("UNSTRUCTURED");
    expect(data.request?.fileDetails).toEqual([{ fileName: "a.pdf", ossKey: "docs/a.pdf" }]);
    expect(data.request?.categoryId).toBe("cate_x");
    expect(data.request?.tags).toEqual(["alpha"]);
    // Gotcha: the overwrite key is overWriteFileByOssKey (capital W)
    expect(data.request?.overWriteFileByOssKey).toBe(true);
  });

  test("doc import-oss: 11 个 --tag 报 USAGE (2)", async () => {
    const tagArgs = Array.from({ length: 11 }, (_, tagIndex) => ["--tag", `t${tagIndex}`]).flat();
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "import-oss",
      "--bucket",
      "b",
      "--region",
      "cn-beijing",
      "--oss-key",
      "docs/a.pdf",
      ...tagArgs,
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });

  test("doc import-oss: 11 个 oss-key 报 USAGE (2)", async () => {
    const keyArgs = Array.from({ length: 11 }, (_, keyIndex) => [
      "--oss-key",
      `docs/f${keyIndex}.pdf`,
    ]).flat();
    const { exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "import-oss",
      "--bucket",
      "b",
      "--region",
      "cn-beijing",
      ...keyArgs,
      ...COMMON,
    ]);
    expect(exitCode).toBe(2);
  });
});

describe.skipIf(!isKbAdminE2EReady())(
  "e2e: chunk/category/file live (chunk 链路 + category/file 读)",
  () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

    test("file get 不存在的 file-id: 服务端错误原样透传 (非零退出)", async () => {
      const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "file",
        "get",
        "--file-id",
        "file_nonexistent_e2e_0000",
        "--workspace-id",
        workspaceId,
      ]);
      expect(exitCode).not.toBe(0);
      // Verified live: HTTP 200 + InvalidParameter with a "cant find" message
      expect(stderr).toMatch(/cant find|InvalidParameter/i);
    }, 60_000);

    test("collection get/create live: 幂等复用固定名测试集合", async () => {
      // collection has no delete API — reuse a fixed name idempotently instead of creating
      // new ones (the legacy name e2e-test-connector is kept: that idempotent resource
      // already exists server-side)
      const connectorName = "e2e-test-connector";
      const firstGetRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "collection",
        "get",
        "--name",
        connectorName,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      let connectorId = firstGetRun.exitCode === 0 ? firstGetRun.stdout.trim() : "";

      if (!connectorId) {
        const createRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "collection",
          "create",
          "--name",
          connectorName,
          "--description",
          "e2e fixture connector (PLATFORM, reused across runs)",
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(createRun.exitCode, createRun.stderr).toBe(0);
        connectorId = createRun.stdout.trim();
      }
      expect(connectorId).toBeTruthy();

      // get by id asserts the detail fields
      const getRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "collection",
        "get",
        "--collection-id",
        connectorId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(getRun.exitCode, getRun.stderr).toBe(0);
      const connectorDetail = parseStdoutJson<{
        data: { connectorId?: string; connectorName?: string };
      }>(getRun.stdout);
      expect(connectorDetail.data.connectorId).toBe(connectorId);
      expect(connectorDetail.data.connectorName).toBe(connectorName);
    }, 60_000);

    test("category list live: --max-result 1 触发 nextToken 游标翻页", async () => {
      // Cursor pagination piggybacks on existing categories — no resources created
      const firstPageRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "list",
        "--max-result",
        "1",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(firstPageRun.exitCode, firstPageRun.stderr).toBe(0);
      const firstPage = parseStdoutJson<{
        data?: { nextToken?: string; categoryList?: Array<{ categoryId?: string }> };
      }>(firstPageRun.stdout);
      const firstCategoryId = firstPage.data?.categoryList?.[0]?.categoryId;
      const nextToken = firstPage.data?.nextToken;
      expect(firstCategoryId).toBeTruthy();
      // A single-category workspace cannot paginate — nothing more to assert
      if (!nextToken) return;

      const secondPageRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "list",
        "--max-result",
        "1",
        "--next-token",
        nextToken,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(secondPageRun.exitCode, secondPageRun.stderr).toBe(0);
      const secondCategoryId = secondPageRun.stdout.trim().split("\n")[0];
      expect(secondCategoryId).toBeTruthy();
      expect(secondCategoryId).not.toBe(firstCategoryId);
    }, 60_000);

    test("隔离链路: category add → upload(--tag) → file list/get → 类目建库 → file delete → category delete", async () => {
      // Test artifacts must live in (and be cleaned from) a self-created category;
      // never touch existing data in the default category
      const categoryName = `e2e-cate-${Date.now() % 100000000}`;
      const categoryAddRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "add",
        "--name",
        categoryName,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(categoryAddRun.exitCode, categoryAddRun.stderr).toBe(0);
      const categoryId = categoryAddRun.stdout.trim();
      expect(categoryId).toMatch(/^cate_/);

      // category list asserts the new category is found via exact-name filtering
      // (categoryName is an exact match — contract gotcha)
      const categoryListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "list",
        "--name",
        categoryName,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(categoryListRun.exitCode, categoryListRun.stderr).toBe(0);
      expect(categoryListRun.stdout.trim().split("\n")).toContain(categoryId);

      try {
        const fixtureDir = mkdtempSync(join(tmpdir(), "file-chain-e2e-"));
        const filePath = join(fixtureDir, `fl-${Date.now()}.md`);
        writeFileSync(filePath, "# file chain fixture\n");
        const uploadRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "doc",
          "upload",
          "--file",
          filePath,
          "--category-id",
          categoryId,
          "--tag",
          "e2e-upload-tag",
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(uploadRun.exitCode, uploadRun.stderr).toBe(0);
        const fileId = uploadRun.stdout.trim();

        const fileListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "file",
          "list",
          "--category-id",
          categoryId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(fileListRun.exitCode, fileListRun.stderr).toBe(0);
        expect(fileListRun.stdout.trim().split("\n")).toContain(fileId);

        const getRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
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
        expect(getRun.exitCode, getRun.stderr).toBe(0);
        const fileDetail = parseStdoutJson<{ data: { category?: string; tags?: unknown } }>(
          getRun.stdout,
        );
        expect(fileDetail.data.category).toBe(categoryId);
        // tags round-trip verifies the upload --tag → addFile tags mapping live
        expect(JSON.stringify(fileDetail.data.tags ?? "")).toContain("e2e-upload-tag");

        // kb create --category-id: the only live coverage of building a base from a
        // category (all other chains use --doc-id); the base is throwaway
        const kbCreateRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
          "knowledge",
          "create",
          "--name",
          `e2e-cate-kb-${Date.now() % 100000000}`.slice(0, 20),
          "--description",
          "e2e fixture knowledge base (safe to delete)",
          "--category-id",
          categoryId,
          "--workspace-id",
          workspaceId,
          "--wait",
          "--quiet",
        ]);
        expect(kbCreateRun.exitCode, kbCreateRun.stderr).toBe(0);
        const categoryKbId = kbCreateRun.stdout.trim().split("\n")[0]!;
        expect(categoryKbId).toBeTruthy();
        const kbDeleteRun = await deleteKbWithRetry(
          (args) => runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, args),
          categoryKbId,
          workspaceId,
        );
        expect(kbDeleteRun.exitCode, kbDeleteRun.stderr).toBe(0);

        // Delete only the exact fileId we just uploaded
        const deleteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "file",
          "delete",
          "--file-id",
          fileId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        expect(deleteRun.exitCode, deleteRun.stderr).toBe(0);

        // Verify the file is actually gone from the data center via read-back
        const postFileListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "file",
          "list",
          "--category-id",
          categoryId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(postFileListRun.exitCode, postFileListRun.stderr).toBe(0);
        expect(postFileListRun.stdout.trim()).not.toContain(fileId);
      } finally {
        // Clean up the self-created category (doubles as live coverage of category delete)
        const categoryDeleteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "category",
          "delete",
          "--category-id",
          categoryId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        expect(categoryDeleteRun.exitCode, categoryDeleteRun.stderr).toBe(0);

        // Verify the category is actually gone from the server via read-back
        const postCategoryListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "category",
          "list",
          "--name",
          categoryName,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(postCategoryListRun.exitCode, postCategoryListRun.stderr).toBe(0);
        expect(postCategoryListRun.stdout.trim()).not.toContain(categoryId);
      }
      // kb create --wait adds a full import phase — generous timeout
    }, 600_000);

    test("chunk 全链路: 建库 → add → list 回读 → update → rerank 检索 → 分批 delete", async () => {
      // Create a throwaway knowledge base (upload + create --wait, reusing existing commands)
      const fixtureDir = mkdtempSync(join(tmpdir(), "chunk-chain-e2e-"));
      const filePath = join(fixtureDir, `chunk-${Date.now()}.md`);
      writeFileSync(filePath, "# chunk chain fixture: base document content\n");
      const uploadRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
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

      // Operating on an existing knowledge base would pollute it, and picking one from
      // kb list is unreliable — the chunk add → list → update → delete chain needs the
      // uploaded file in a base first, so create a throwaway base directly.
      const createRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "create",
        "--name",
        `e2e-ck-${Date.now() % 100000000}`,
        "--description",
        "e2e fixture knowledge base (safe to delete)",
        "--doc-id",
        fileId,
        "--workspace-id",
        workspaceId,
        "--wait",
        "--quiet",
      ]);
      expect(createRun.exitCode, createRun.stderr).toBe(0);
      const indexId = createRun.stdout.trim().split("\n")[0]!;

      try {
        // add
        const addRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "add",
          "--index-id",
          indexId,
          "--doc-id",
          fileId,
          "--content",
          `e2e manual chunk content ${Date.now()}`,
          "--workspace-id",
          workspaceId,
        ]);
        expect(addRun.exitCode, addRun.stderr).toBe(0);

        // list read-back to grab chunk ids
        const listRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(listRun.exitCode, listRun.stderr).toBe(0);
        const chunkIds = listRun.stdout.trim().split("\n").filter(Boolean);
        expect(chunkIds.length).toBeGreaterThan(0);
        const targetChunkId = chunkIds[chunkIds.length - 1]!;

        // update (change content)
        const updateRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "update",
          "--index-id",
          indexId,
          "--chunk-id",
          targetChunkId,
          "--doc-id",
          fileId,
          "--content",
          "e2e updated chunk content",
          "--workspace-id",
          workspaceId,
        ]);
        expect(updateRun.exitCode, updateRun.stderr).toBe(0);

        // Verify the content update landed on the server via independent read-back
        const updateVerifyRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ]);
        expect(updateVerifyRun.exitCode, updateVerifyRun.stderr).toBe(0);
        const updateVerifyData = parseStdoutJson<{
          data?: {
            nodes?: Array<{ metadata?: { _id?: string; content?: string }; text?: string }>;
          };
        }>(updateVerifyRun.stdout);
        const updatedChunk = updateVerifyData.data?.nodes?.find(
          (node) => node.metadata?._id === targetChunkId,
        );
        expect(updatedChunk?.metadata?.content ?? updatedChunk?.text).toBe(
          "e2e updated chunk content",
        );

        // update toggling --exclude only (no content — exercises the fetchChunkContent read-back path live)
        const excludeRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "update",
          "--index-id",
          indexId,
          "--chunk-id",
          targetChunkId,
          "--doc-id",
          fileId,
          "--exclude",
          "--workspace-id",
          workspaceId,
        ]);
        expect(excludeRun.exitCode, excludeRun.stderr).toBe(0);

        // Verify the exclude flag landed on the server via independent read-back
        const excludeVerifyRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ]);
        expect(excludeVerifyRun.exitCode, excludeVerifyRun.stderr).toBe(0);
        const excludeVerifyData = parseStdoutJson<{
          data?: {
            nodes?: Array<{ metadata?: { _id?: string; is_displayed_chunk_content?: boolean } }>;
          };
        }>(excludeVerifyRun.stdout);
        const excludedChunk = excludeVerifyData.data?.nodes?.find(
          (node) => node.metadata?._id === targetChunkId,
        );
        expect(excludedChunk?.metadata?.is_displayed_chunk_content).toBe(false);

        // kb stats on this base doubles as live coverage of the monitor endpoint
        // (the only indices endpoint not touched by the chain)
        const statsRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "stats",
          "--index-id",
          indexId,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ]);
        expect(statsRun.exitCode, statsRun.stderr).toBe(0);
        const statsData = parseStdoutJson<{
          data?: {
            storageMonitorData?: { indexStorageLimit?: number };
            qpsMonitorData?: { monitorData?: unknown[] };
          };
        }>(statsRun.stdout);
        // Shape verified against the live API: the monitor fields are objects,
        // not arrays as the public docs' empty-array examples suggest
        expect(typeof statsData.data?.storageMonitorData?.indexStorageLimit).toBe("number");
        expect(Array.isArray(statsData.data?.qpsMonitorData?.monitorData)).toBe(true);

        // retrieve with full rerank params — the only live call of the rerank billing
        // path (recall is not asserted: indexing lag would make it flaky; shape only)
        const rerankRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "retrieve",
          "--index-id",
          indexId,
          "--query",
          "chunk chain fixture",
          "--rerank",
          "--rerank-model",
          VERIFIED_RERANK_MODEL,
          "--rerank-mode",
          "similar",
          "--rerank-top-n",
          "5",
          "--dense-similarity-top-k",
          "20",
          "--sparse-similarity-top-k",
          "20",
          "--output",
          "json",
        ]);
        expect(rerankRun.exitCode, rerankRun.stderr).toBe(0);
        const rerankData = parseStdoutJson<{ data?: { nodes?: unknown[] } }>(rerankRun.stdout);
        expect(Array.isArray(rerankData.data?.nodes)).toBe(true);

        // 10 more chunks force the >10-id auto-batching path in the live delete
        // (sequential process spawns naturally respect the 10 req/s rate limit)
        for (let extraIndex = 0; extraIndex < 10; extraIndex++) {
          const extraAddRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
            "knowledge",
            "chunk",
            "add",
            "--index-id",
            indexId,
            "--doc-id",
            fileId,
            "--content",
            `e2e batch chunk content ${extraIndex}`,
            "--workspace-id",
            workspaceId,
            "--quiet",
          ]);
          expect(extraAddRun.exitCode, extraAddRun.stderr).toBe(0);
        }
        const fullListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--page-size",
          "100",
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(fullListRun.exitCode, fullListRun.stderr).toBe(0);
        const allChunkIds = fullListRun.stdout.trim().split("\n").filter(Boolean);
        expect(allChunkIds.length).toBeGreaterThan(10);

        // batch delete all chunks — asserts the automatic split into multiple batches
        const deleteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "delete",
          "--index-id",
          indexId,
          ...allChunkIds.flatMap((chunkId) => ["--chunk-id", chunkId]),
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        expect(deleteRun.exitCode, deleteRun.stderr).toBe(0);
        expect(deleteRun.stdout).toMatch(
          new RegExp(
            `deleted: ${allChunkIds.length} chunk\\(s\\) in ${Math.ceil(allChunkIds.length / 10)} batch\\(es\\)`,
          ),
        );

        // Verify the chunks are actually gone from the server via independent read-back
        const postDeleteListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(postDeleteListRun.exitCode, postDeleteListRun.stderr).toBe(0);
        expect(postDeleteListRun.stdout.trim()).toBe("");

        // doc delete verifies document-level delete semantics (only unlinks from this
        // base, unlike file delete). The --doc-id must be the full doc_id from doc
        // list (e.g. "file_xxx_<workspaceId>"), NOT the bare fileId ("file_xxx") —
        // passing the bare fileId returns Success but does not actually remove the
        // document.
        const preDocListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "doc",
          "list",
          "--index-id",
          indexId,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ]);
        expect(preDocListRun.exitCode, preDocListRun.stderr).toBe(0);
        const preDocListData = parseStdoutJson<{
          data?: { rows?: Array<{ doc_id?: string; doc_name?: string }> };
        }>(preDocListRun.stdout);
        const docRow = preDocListData.data?.rows?.find((row) => row.doc_id?.startsWith(fileId));
        expect(
          docRow,
          `expected doc list to contain a doc_id starting with "${fileId}"`,
        ).toBeTruthy();
        const fullDocId = docRow!.doc_id!;

        const docDeleteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "doc",
          "delete",
          "--index-id",
          indexId,
          "--doc-id",
          fullDocId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        expect(docDeleteRun.exitCode, docDeleteRun.stderr).toBe(0);
        expect(docDeleteRun.stdout).toMatch(new RegExp(fullDocId));

        // Verify the document is actually gone from the server via independent read-back.
        // doc delete is asynchronous — the server returns Success immediately but the
        // document disappears from doc list after a propagation delay (same pattern as
        // IndexStatusError on kb delete). Poll until the doc_id is gone or timeout.
        let docGone = false;
        for (let retry = 0; retry < 6; retry++) {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          const postDocListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
            "knowledge",
            "doc",
            "list",
            "--index-id",
            indexId,
            "--workspace-id",
            workspaceId,
            "--quiet",
          ]);
          expect(postDocListRun.exitCode, postDocListRun.stderr).toBe(0);
          if (!postDocListRun.stdout.trim().includes(fullDocId)) {
            docGone = true;
            break;
          }
        }
        expect(
          docGone,
          `doc delete returned Success but the document is still in doc list after 60s`,
        ).toBe(true);
      } finally {
        // Clean up the throwaway base + data-center file (same IndexStatusError retry as the kb delete chain)
        await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "file",
          "delete",
          "--file-id",
          fileId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        let cleanupRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
          "knowledge",
          "delete",
          "--index-id",
          indexId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        for (let retry = 0; retry < 5 && cleanupRun.exitCode !== 0; retry++) {
          if (!cleanupRun.stderr.includes("IndexStatusError")) break;
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          cleanupRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
            "knowledge",
            "delete",
            "--index-id",
            indexId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ]);
        }
      }
      // Observed duration varies widely (server-side parsing/indexing speed is unstable)
      // — generous timeout to absorb the jitter
    }, 600_000);
  },
);

// Live parameter coverage: file-list 4 params + category-list 2 params +
// chunk add/update --content-file + chunk list --doc-id. All in one self-cleaning
// chain to minimize API calls.
describe.skipIf(!isKbAdminE2EReady())("e2e: chunk/category/file 参数补全 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("file list(name/file-id/max-result/next-token) + category list(parent-id/collection-id) + chunk add/update --content-file + chunk list --doc-id", async () => {
    // ── setup: create category → upload file ──
    const categoryName = `e2e-param-${Date.now() % 100000000}`;
    const categoryAddRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "category",
      "add",
      "--name",
      categoryName,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(categoryAddRun.exitCode, categoryAddRun.stderr).toBe(0);
    const categoryId = categoryAddRun.stdout.trim();
    expect(categoryId).toMatch(/^cate_/);

    // ── empty-result contract: a freshly created category has no files —
    // text mode prints the friendly empty line and exits 0 (empty ≠ error) ──
    const emptyCategoryListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "file",
      "list",
      "--category-id",
      categoryId,
      "--workspace-id",
      workspaceId,
    ]);
    expect(emptyCategoryListRun.exitCode, emptyCategoryListRun.stderr).toBe(0);
    expect(emptyCategoryListRun.stdout).toMatch(/No files found\./);

    const fixtureDir = mkdtempSync(join(tmpdir(), "param-e2e-"));
    // Server contract (verified live): listFile fileName filters by the exact
    // file name WITHOUT extension — keep the stem for the --name assertion below
    const fileStem = `param-${Date.now()}`;
    const filePath = join(fixtureDir, `${fileStem}.md`);
    writeFileSync(filePath, "# e2e param file\n");
    const uploadRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "upload",
      "--file",
      filePath,
      "--category-id",
      categoryId,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(uploadRun.exitCode, uploadRun.stderr).toBe(0);
    const fileId = uploadRun.stdout.trim();
    let indexId: string | undefined;

    try {
      // ── P2: file list --name —— exact match on the extension-less file name
      // (e.g. a.md → pass a); fuzzy/partial keywords return an empty set.
      // Poll to absorb list-visibility lag right after upload ──
      const fileListByNamePoll = await pollUntil(
        () =>
          runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
            "knowledge",
            "file",
            "list",
            "--category-id",
            categoryId,
            "--name",
            fileStem,
            "--workspace-id",
            workspaceId,
            "--quiet",
          ]),
        (run) => run.exitCode === 0 && run.stdout.trim().split("\n").includes(fileId),
        { timeoutMs: 60_000, intervalMs: 5_000 },
      );
      expect(
        fileListByNamePoll.satisfied,
        `file list --name 未包含 ${fileId} (attempts=${fileListByNamePoll.attempts})`,
      ).toBe(true);

      // ── P2: file list --file-id ──
      const fileListByFileIdRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "file",
        "list",
        "--category-id",
        categoryId,
        "--file-id",
        fileId,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(fileListByFileIdRun.exitCode, fileListByFileIdRun.stderr).toBe(0);
      expect(fileListByFileIdRun.stdout.trim().split("\n")).toContain(fileId);

      // ── P2: file list --max-result 1 ──
      const fileListMaxResultRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "file",
        "list",
        "--category-id",
        categoryId,
        "--max-result",
        "1",
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(fileListMaxResultRun.exitCode, fileListMaxResultRun.stderr).toBe(0);
      const maxResultLines = fileListMaxResultRun.stdout.trim().split("\n").filter(Boolean);
      expect(maxResultLines.length).toBeLessThanOrEqual(1);

      // ── P2: file list --next-token (if paginated) ──
      const fileListJsonRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "file",
        "list",
        "--category-id",
        categoryId,
        "--max-result",
        "1",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(fileListJsonRun.exitCode, fileListJsonRun.stderr).toBe(0);
      const fileListData = parseStdoutJson<{
        data?: { nextToken?: string };
      }>(fileListJsonRun.stdout);
      const fileNextToken = fileListData.data?.nextToken;
      if (fileNextToken) {
        const fileListNextTokenRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "file",
          "list",
          "--category-id",
          categoryId,
          "--next-token",
          fileNextToken,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(fileListNextTokenRun.exitCode, fileListNextTokenRun.stderr).toBe(0);
      }

      // ── P3: category list --parent-id (using existing categoryId) ──
      const listByParentRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "list",
        "--parent-id",
        categoryId,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(listByParentRun.exitCode, listByParentRun.stderr).toBe(0);

      // ── P3: category list --collection-id — an unknown collection id is rejected
      // by the server (Invalid connectorId, verified live) and the error passes
      // through verbatim with a non-zero exit ──
      const listByCollectionRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "list",
        "--collection-id",
        "col_nonexistent_e2e",
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(listByCollectionRun.exitCode, "不存在的 collection id 应被服务端拒绝").not.toBe(0);
      expect(listByCollectionRun.stderr).toMatch(/Invalid connectorId|InvalidParameter/i);

      // ── create kb for chunk tests ──
      const kbCreateRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
        "knowledge",
        "create",
        "--name",
        `e2e-pk-${Date.now() % 100000000}`.slice(0, 20),
        "--description",
        "e2e fixture knowledge base (safe to delete)",
        "--doc-id",
        fileId,
        "--workspace-id",
        workspaceId,
        "--wait",
        "--quiet",
      ]);
      expect(kbCreateRun.exitCode, kbCreateRun.stderr).toBe(0);
      indexId = kbCreateRun.stdout.trim().split("\n")[0]!;
      expect(indexId).toBeTruthy();

      try {
        // ── P4: chunk add --content-file ──
        const chunkContentFile = join(fixtureDir, `chunk-${Date.now()}.txt`);
        const chunkMarker = `e2e chunk content file marker ${Date.now()}`;
        writeFileSync(chunkContentFile, chunkMarker);

        const chunkAddFileRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "add",
          "--index-id",
          indexId,
          "--doc-id",
          fileId,
          "--content-file",
          chunkContentFile,
          "--workspace-id",
          workspaceId,
        ]);
        expect(chunkAddFileRun.exitCode, chunkAddFileRun.stderr).toBe(0);

        // chunk list read-back: verify content came from file
        const chunkListAfterAddRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ]);
        expect(chunkListAfterAddRun.exitCode, chunkListAfterAddRun.stderr).toBe(0);
        const chunkListAfterAddData = parseStdoutJson<{
          data?: {
            nodes?: Array<{
              metadata?: { _id?: string; content?: string };
              text?: string;
            }>;
          };
        }>(chunkListAfterAddRun.stdout);
        const addedChunk = chunkListAfterAddData.data?.nodes?.find(
          (node) => (node.metadata?.content ?? node.text) === chunkMarker,
        );
        expect(addedChunk?.metadata?.content ?? addedChunk?.text).toBe(chunkMarker);
        const addedChunkId = addedChunk?.metadata?._id;
        expect(addedChunkId).toBeTruthy();

        // ── P6: chunk list --doc-id ──
        const chunkListByDocRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--doc-id",
          fileId,
          "--workspace-id",
          workspaceId,
          "--output",
          "json",
        ]);
        expect(chunkListByDocRun.exitCode, chunkListByDocRun.stderr).toBe(0);
        const chunkListByDocData = parseStdoutJson<{
          data?: {
            nodes?: Array<{
              metadata?: { doc_id?: string };
            }>;
          };
        }>(chunkListByDocRun.stdout);
        // All returned chunks should belong to the specified doc
        for (const node of chunkListByDocData.data?.nodes ?? []) {
          expect(node.metadata?.doc_id).toContain(fileId);
        }

        // ── empty-result contract: a page far past the end returns no chunks —
        // text mode prints the friendly empty line and exits 0 (empty ≠ error) ──
        const chunkListEmptyPageRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "list",
          "--index-id",
          indexId,
          "--page-number",
          "99",
          "--workspace-id",
          workspaceId,
        ]);
        expect(chunkListEmptyPageRun.exitCode, chunkListEmptyPageRun.stderr).toBe(0);
        expect(chunkListEmptyPageRun.stdout).toMatch(/No chunks found\./);

        // ── contract: updating a nonexistent chunk id — the server currently
        // reports success (silent upsert-like semantics, verified live). The CLI
        // passes the server result through without an existence pre-check; this
        // assertion pins the known server behavior so a future server-side change
        // (rejecting unknown ids) surfaces here immediately ──
        const chunkUpdateMissingRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "chunk",
          "update",
          "--index-id",
          indexId,
          "--chunk-id",
          "chunk_nonexistent_e2e_0000",
          "--doc-id",
          fileId,
          "--content",
          "content for a chunk id that should not exist",
          "--workspace-id",
          workspaceId,
        ]);
        expect(chunkUpdateMissingRun.exitCode, chunkUpdateMissingRun.stderr).toBe(0);
        expect(chunkUpdateMissingRun.stdout).toMatch(/updated: chunk_nonexistent_e2e_0000/);

        // ── P4: chunk update --content-file ──
        if (addedChunkId) {
          const updateContentFile = join(fixtureDir, `chunk-update-${Date.now()}.txt`);
          const updateMarker = `e2e chunk update content file marker ${Date.now()}`;
          writeFileSync(updateContentFile, updateMarker);

          const chunkUpdateFileRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
            "knowledge",
            "chunk",
            "update",
            "--index-id",
            indexId,
            "--chunk-id",
            addedChunkId,
            "--doc-id",
            fileId,
            "--content-file",
            updateContentFile,
            "--workspace-id",
            workspaceId,
          ]);
          expect(chunkUpdateFileRun.exitCode, chunkUpdateFileRun.stderr).toBe(0);

          // chunk list read-back: verify content changed
          const chunkListAfterUpdateRun = await runCommandE2e(
            KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES,
            [
              "knowledge",
              "chunk",
              "list",
              "--index-id",
              indexId,
              "--workspace-id",
              workspaceId,
              "--output",
              "json",
            ],
          );
          expect(chunkListAfterUpdateRun.exitCode, chunkListAfterUpdateRun.stderr).toBe(0);
          const chunkListAfterUpdateData = parseStdoutJson<{
            data?: {
              nodes?: Array<{
                metadata?: { _id?: string; content?: string };
                text?: string;
              }>;
            };
          }>(chunkListAfterUpdateRun.stdout);
          const updatedChunk = chunkListAfterUpdateData.data?.nodes?.find(
            (node) => node.metadata?._id === addedChunkId,
          );
          expect(updatedChunk?.metadata?.content ?? updatedChunk?.text).toBe(updateMarker);
        }
      } finally {
        // cleanup kb (retry for IndexStatusError)
        if (indexId) {
          let cleanupRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
            "knowledge",
            "delete",
            "--index-id",
            indexId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ]);
          for (let retry = 0; retry < 5 && cleanupRun.exitCode !== 0; retry++) {
            if (!cleanupRun.stderr.includes("IndexStatusError")) break;
            await new Promise((resolve) => setTimeout(resolve, 10_000));
            cleanupRun = await runCommandE2e(KNOWLEDGE_KB_DELETE_ROUTES, [
              "knowledge",
              "delete",
              "--index-id",
              indexId,
              "--yes",
              "--workspace-id",
              workspaceId,
            ]);
          }
        }
      }
    } finally {
      // cleanup file + category
      await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "file",
        "delete",
        "--file-id",
        fileId,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
      await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "delete",
        "--category-id",
        categoryId,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
    }
    // kb create --wait adds a full import phase — generous timeout
  }, 600_000);
});

interface ChunkListNodes {
  data?: { nodes?: Array<{ metadata?: Record<string, unknown> }> };
}

// Long-lived console-created fixture: the CLI can only create document-type bases,
// so the field channel (table/image bases) rides on BAILIAN_E2E_TABLE_INDEX_ID.
describe.skipIf(!isTableKbE2EReady())("e2e: chunk --field 表格库 live (常驻 fixture)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
  const tableIndexId = process.env.BAILIAN_E2E_TABLE_INDEX_ID!;

  test("field 闭环: 取 doc_id → add --field → list 回读命中 → delete", async () => {
    // Gotcha (verified live): dataId must be the document-level id from doc list;
    // the per-row doc_id in chunk metadata (with a _<row> suffix) is rejected with
    // Index.InvalidParameter
    const docListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "list",
      "--index-id",
      tableIndexId,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(docListRun.exitCode, docListRun.stderr).toBe(0);
    const tableDocId = docListRun.stdout.trim().split("\n")[0];
    expect(tableDocId, "表格 fixture 库应至少有 1 个文档").toBeTruthy();

    // Server gotcha (verified live): table bases reject field chunks without --doc-id
    // — HTTP 500 "dataId不能为空", passed through verbatim as a server error
    const noDocIdRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      tableIndexId,
      "--field",
      "ZH=missing-doc-id-probe",
      "--workspace-id",
      workspaceId,
    ]);
    expect(noDocIdRun.exitCode).not.toBe(0);

    // add a row via the field channel (ZH/KO are the fixture table's Excel headers)
    const marker = `e2e-field-${Date.now()}`;
    const addRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "add",
      "--index-id",
      tableIndexId,
      "--doc-id",
      tableDocId!,
      "--field",
      `ZH=${marker}`,
      "--field",
      "KO=e2e-probe",
      "--workspace-id",
      workspaceId,
    ]);
    expect(addRun.exitCode, addRun.stderr).toBe(0);

    // read back by sweeping pages until the marker row shows up, grab its chunk id
    let markerChunkId = "";
    for (let pageNumber = 1; pageNumber <= 5 && !markerChunkId; pageNumber++) {
      const pageRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "chunk",
        "list",
        "--index-id",
        tableIndexId,
        "--page-number",
        String(pageNumber),
        "--page-size",
        "100",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(pageRun.exitCode, pageRun.stderr).toBe(0);
      const pageNodes = parseStdoutJson<ChunkListNodes>(pageRun.stdout).data?.nodes ?? [];
      const match = pageNodes.find((node) => node.metadata?.ZH === marker);
      if (match) markerChunkId = (match.metadata?._id as string | undefined) ?? "";
      if (pageNodes.length < 100) break;
    }
    expect(markerChunkId, `field 新增行未在 list 中回读到 (marker=${marker})`).toBeTruthy();

    // clean up the exact row we added — the fixture base itself is never touched
    const deleteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "delete",
      "--index-id",
      tableIndexId,
      "--chunk-id",
      markerChunkId,
      "--yes",
      "--workspace-id",
      workspaceId,
    ]);
    expect(deleteRun.exitCode, deleteRun.stderr).toBe(0);
  }, 120_000);
});

describe.skipIf(!isImageKbE2EReady())("e2e: 图片库 chunk 回读 live (常驻 fixture)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
  const imageIndexId = process.env.BAILIAN_E2E_IMAGE_INDEX_ID!;

  test("chunk list 返回 image_url 数组与可见性标志", async () => {
    const listRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "chunk",
      "list",
      "--index-id",
      imageIndexId,
      "--page-size",
      "2",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(listRun.exitCode, listRun.stderr).toBe(0);
    const nodes = parseStdoutJson<ChunkListNodes>(listRun.stdout).data?.nodes ?? [];
    expect(nodes.length).toBeGreaterThan(0);
    // Image-type chunks carry image_url arrays (shape verified against the live fixture)
    const firstMeta = nodes[0]?.metadata ?? {};
    expect(Array.isArray(firstMeta.image_url)).toBe(true);
    expect((firstMeta.image_url as string[]).length).toBeGreaterThan(0);
    expect(typeof firstMeta.is_displayed_chunk_content).toBe("boolean");
  }, 60_000);
});

// Requires a bucket pre-authorized to the platform service role with a fixed test
// object in place (see .env BAILIAN_E2E_OSS_BUCKET/REGION/KEY)
describe.skipIf(!isOssImportE2EReady())("e2e: doc import-oss live (授权 bucket fixture)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
  const ossBucket = process.env.BAILIAN_E2E_OSS_BUCKET!;
  const ossRegion = process.env.BAILIAN_E2E_OSS_REGION!;
  const ossKey = process.env.BAILIAN_E2E_OSS_KEY!;

  test("导入 → overwrite 重导(新 fileId, 旧 id 作废) → file delete 自清理", async () => {
    // 1) first import returns a fileId (locks the addFileResultList response shape:
    //    the docs' flat fileIds field is not returned — live-verified)
    const importRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "import-oss",
      "--bucket",
      ossBucket,
      "--region",
      ossRegion,
      "--oss-key",
      ossKey,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(importRun.exitCode, importRun.stderr).toBe(0);
    const firstFileId = importRun.stdout.trim();
    expect(firstFileId).toMatch(/^file_/);

    // 2) re-import with --overwrite: the server replaces the file and issues a NEW
    //    fileId; the old one becomes invalid (live-verified semantics)
    const overwriteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "doc",
      "import-oss",
      "--bucket",
      ossBucket,
      "--region",
      ossRegion,
      "--oss-key",
      ossKey,
      "--overwrite",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(overwriteRun.exitCode, overwriteRun.stderr).toBe(0);
    const overwriteFileId = overwriteRun.stdout.trim();
    expect(overwriteFileId).toMatch(/^file_/);
    expect(overwriteFileId).not.toBe(firstFileId);

    // the pre-overwrite id is gone — file get on it fails
    const staleGetRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "file",
      "get",
      "--file-id",
      firstFileId,
      "--workspace-id",
      workspaceId,
    ]);
    expect(staleGetRun.exitCode).not.toBe(0);

    // 3) clean up the surviving imported file
    const deleteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "file",
      "delete",
      "--file-id",
      overwriteFileId,
      "--yes",
      "--workspace-id",
      workspaceId,
    ]);
    expect(deleteRun.exitCode, deleteRun.stderr).toBe(0);
  }, 120_000);

  test("collection create custom live: 幂等复用固定名自有存储集合", async () => {
    // No collection delete API — fixed-name idempotent reuse, same pattern as the
    // platform collection test. Requires the bucket tag
    // bailian-connector-access=ReadAndWrite (tag-based access control).
    const connectorName = "e2e-test-custom-conn"; // exactly 20 chars (server name limit)
    const firstGetRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "get",
      "--name",
      connectorName,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    let connectorId = firstGetRun.exitCode === 0 ? firstGetRun.stdout.trim() : "";

    if (!connectorId) {
      const createRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "collection",
        "create",
        "--name",
        connectorName,
        "--description",
        "e2e fixture custom connector (own OSS bucket, reused across runs)",
        "--store-type",
        "custom",
        "--oss-region",
        process.env.BAILIAN_E2E_OSS_REGION!,
        "--oss-bucket",
        process.env.BAILIAN_E2E_OSS_BUCKET!,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(createRun.exitCode, createRun.stderr).toBe(0);
      connectorId = createRun.stdout.trim();
    }
    expect(connectorId).toBeTruthy();

    // get by id: identity fields only — live-verified getConnector does NOT echo
    // fileConnectorConfig (storeType/regionId/bucketName are absent from readback)
    const getRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "collection",
      "get",
      "--collection-id",
      connectorId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);
    expect(getRun.exitCode, getRun.stderr).toBe(0);
    const customDetail = parseStdoutJson<{
      data: { connectorId?: string; connectorName?: string; connectorType?: string };
    }>(getRun.stdout);
    expect(customDetail.data.connectorId).toBe(connectorId);
    expect(customDetail.data.connectorName).toBe(connectorName);
    expect(customDetail.data.connectorType).toBe("FILE");
  }, 60_000);

  test("import-oss --category-id --tag → file list + file get 读回验证", async () => {
    // P5: verify --category-id and --tag params land on the server via read-back
    const categoryName = `e2e-oss-cat-${Date.now() % 100000000}`;
    const categoryAddRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
      "knowledge",
      "category",
      "add",
      "--name",
      categoryName,
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(categoryAddRun.exitCode, categoryAddRun.stderr).toBe(0);
    const categoryId = categoryAddRun.stdout.trim();
    expect(categoryId).toMatch(/^cate_/);

    try {
      const importRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "doc",
        "import-oss",
        "--bucket",
        ossBucket,
        "--region",
        ossRegion,
        "--oss-key",
        ossKey,
        "--category-id",
        categoryId,
        "--tag",
        "e2e-oss-tag",
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(importRun.exitCode, importRun.stderr).toBe(0);
      const fileId = importRun.stdout.trim();
      expect(fileId).toMatch(/^file_/);

      try {
        // file list --category-id read-back: file is under the category
        const fileListRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "file",
          "list",
          "--category-id",
          categoryId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ]);
        expect(fileListRun.exitCode, fileListRun.stderr).toBe(0);
        expect(fileListRun.stdout.trim().split("\n")).toContain(fileId);

        // file get read-back: tags contain "e2e-oss-tag"
        const fileGetRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
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
        expect(fileGetRun.exitCode, fileGetRun.stderr).toBe(0);
        const fileDetail = parseStdoutJson<{
          data: { category?: string; tags?: unknown };
        }>(fileGetRun.stdout);
        expect(fileDetail.data.category).toBe(categoryId);
        expect(JSON.stringify(fileDetail.data.tags ?? "")).toContain("e2e-oss-tag");
      } finally {
        await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "file",
          "delete",
          "--file-id",
          fileId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
      }
    } finally {
      await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
        "knowledge",
        "category",
        "delete",
        "--category-id",
        categoryId,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
    }
  }, 120_000);
});
