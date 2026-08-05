// chunk / stats / category / file / collection / import-oss commands: the static
// group covers help/missing-args/dry-run gotchas per command; the live group runs
// the full chunk chain (add → list → update → delete) plus category/file read-write chains.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import {
  KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES,
  KNOWLEDGE_KB_DELETE_ROUTES,
} from "../topic-routes.ts";
import { deleteKbWithRetry } from "./journeys/journey-helpers.ts";

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

  test("collection create: custom dry-run 断言 ossRegionId/ossBucket 键名映射", async () => {
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
      | { storeType?: string; ossRegionId?: string; ossBucket?: string }
      | undefined;
    expect(connectorConfig?.storeType).toBe("CUSTOM");
    expect(connectorConfig?.ossRegionId).toBe("cn-beijing");
    expect(connectorConfig?.ossBucket).toBe("my-bucket");
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
          "qwen3-rerank-hybrid",
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

        // doc delete verifies document-level delete semantics (only unlinks from this
        // base, unlike file delete)
        const docDeleteRun = await runCommandE2e(KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES, [
          "knowledge",
          "doc",
          "delete",
          "--index-id",
          indexId,
          "--doc-id",
          fileId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        expect(docDeleteRun.exitCode, docDeleteRun.stderr).toBe(0);
        expect(docDeleteRun.stdout).toMatch(new RegExp(fileId));
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
