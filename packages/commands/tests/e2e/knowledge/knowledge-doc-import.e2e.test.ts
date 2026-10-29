import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { KNOWLEDGE_DOC_IMPORT_ROUTES as routes } from "../topic-routes.ts";
const baseArgs = ["knowledge", "doc", "import", "--workspace-id", "ws_test"];

test("help exposes existing-file import and waiting", async () => {
  const result = await runCommandHelp(routes, ["knowledge", "doc", "import", "--help"]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toContain("--doc-id");
  expect(result.stderr).toContain("--category-id");
  expect(result.stderr).toContain("--wait");
});
test.each([
  ["--doc-id", "file_test"],
  ["--index-id", "index_test"],
  ["--index-id", "index_test", "--doc-id", "file_test", "--category-id", "category_test"],
])("invalid source selection fails before network: %j", async (...args) => {
  const result = await runCommandE2e(routes, [...baseArgs, ...args, "--dry-run"]);
  expect(result.exitCode, result.stderr).toBe(2);
});
test.each([
  {
    args: ["--doc-id", "first", "--doc-id", "second"],
    source: { sourceType: "DATA_CENTER_FILE", docIds: ["first", "second"] },
  },
  {
    args: ["--category-id", "category_test"],
    source: { sourceType: "DATA_CENTER_CATEGORY", categoryIds: ["category_test"] },
  },
])("dry-run has one explicit import source: $source.sourceType", async ({ args, source }) => {
  const result = await runCommandE2e(routes, [
    ...baseArgs,
    "--index-id",
    "index_test",
    ...args,
    "--dry-run",
    "--output",
    "json",
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  const body = parseStdoutJson<{ endpoint: string; request: unknown }>(result.stdout);
  expect(body.endpoint).toContain("/api/v1/indices/rag/index/job/create");
  expect(body.request).toEqual({ indexId: "index_test", ...source });
  expect(body).not.toHaveProperty("steps");
});

test("cross-flag validation renders localized text instead of an object", async () => {
  const result = await runCommandE2e(routes, [
    ...baseArgs,
    "--index-id",
    "index_test",
    "--dry-run",
    "--output",
    "json",
  ]);
  expect(result.exitCode).toBe(2);
  expect(JSON.parse(result.stderr).error.message).toBe(
    "Provide exactly one of --doc-id or --category-id.",
  );
});

test("document chunk parameters preserve explicit false and zero", async () => {
  const result = await runCommandE2e(routes, [
    ...baseArgs,
    "--index-id",
    "index_test",
    "--doc-id",
    "file_test",
    "--chunk-mode",
    "length",
    "--chunk-size",
    "600",
    "--overlap-size",
    "0",
    "--enable-headers",
    "false",
    "--dry-run",
    "--output",
    "json",
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(parseStdoutJson<{ request: unknown }>(result.stdout).request).toMatchObject({
    chunkMode: "length",
    chunkSize: 600,
    overlapSize: 0,
    enableHeaders: false,
  });
});

test("Chinese validation renders localized source selection instead of an object", async () => {
  const directory = mkdtempSync(join(tmpdir(), "rag-import-locale-"));
  try {
    writeFileSync(join(directory, "config.json"), JSON.stringify({ language: "zh-CN" }));
    const result = await runCommandE2e(
      routes,
      [...baseArgs, "--index-id", "index-test", "--dry-run"],
      { BAILIAN_CONFIG_DIR: directory },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("必须且只能指定");
    expect(result.stderr).not.toContain("[object Object]");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
