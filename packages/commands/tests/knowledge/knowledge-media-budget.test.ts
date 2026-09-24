import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { isRagMediaWriteE2EReady } from "../../../e2e/src/gating.ts";
import {
  acquireMediaLock,
  claimMediaParse,
  validateMediaSample,
} from "../e2e/knowledge/journeys/rag-media-budget.ts";
const directories: string[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), "rag-budget-"));
  directories.push(path);
  return path;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
test("ordinary live credentials never enable media writes", () => {
  vi.stubEnv("BAILIAN_E2E", "1");
  vi.stubEnv("DASHSCOPE_API_KEY", "test");
  vi.stubEnv("BAILIAN_WORKSPACE_ID", "ws_test");
  vi.stubEnv("BAILIAN_E2E_RAG_MEDIA_WRITE", "");
  expect(isRagMediaWriteE2EReady()).toBe(false);
});
test("parse claims survive failed calls and cannot be claimed a second time", () => {
  const path = directory();
  claimMediaParse(path, { indexId: "test" });
  expect(() => claimMediaParse(path, { indexId: "test" })).toThrow();
});
test("media lock rejects concurrent runs and can be released", () => {
  const path = join(directory(), "lock");
  const release = acquireMediaLock(path);
  expect(() => acquireMediaLock(path)).toThrow();
  release();
  const nextRelease = acquireMediaLock(path);
  nextRelease();
});
test("small sample requires a bounded positive duration", () => {
  const path = join(directory(), "sample.mp4");
  writeFileSync(path, "small fixture");
  expect(() => validateMediaSample(path, () => 5)).not.toThrow();
  expect(() => validateMediaSample(path, () => 11)).toThrow(/10/);
  expect(() => validateMediaSample(path, () => Number.NaN)).toThrow();
});

test("historical discovery follows nextToken and subcategories without mutations", async () => {
  const { discoverMediaFile } = await import("../e2e/knowledge/journeys/rag-media-budget.ts");
  const calls: string[][] = [];
  const fileId = await discoverMediaFile(
    async (args) => {
      calls.push(args);
      if (args.includes("category"))
        return {
          data: {
            categoryList: args.includes("--parent-id")
              ? [{ categoryId: "nested-test" }]
              : [{ categoryId: "category-test" }],
            nextToken: undefined,
          },
        };
      if (!args.includes("nested-test")) return { data: { fileList: [] } };
      return args.includes("--next-token")
        ? { data: { fileList: [{ fileId: "file-test", fileName: "sample.mp4" }] } }
        : { data: { fileList: [], nextToken: "next-page" } };
    },
    "collection-test",
    "sample.mp4",
  );
  expect(fileId).toBe("file-test");
  expect(calls.some((args) => args.includes("--next-token"))).toBe(true);
  expect(calls.some((args) => args.includes("--parent-id"))).toBe(true);
  expect(calls.every((args) => args.includes("list"))).toBe(true);
});
