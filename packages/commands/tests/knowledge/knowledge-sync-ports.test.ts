import { mkdtemp, realpath, writeFile, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as upload from "../../src/commands/knowledge/operations/upload.ts";
import { expect, test, vi } from "vite-plus/test";
import type { Client, LocalizedText, Settings } from "bailian-cli-core";
import { createSyncExecutionPorts } from "../../src/commands/knowledge/sync/ports.ts";
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
function fixture() {
  const tags = [`s${"a".repeat(31)}`, `p${"b".repeat(31)}`, "c".repeat(32)];
  const requestJson = vi.fn();
  const verify = vi.fn(async () => {});
  const ports = createSyncExecutionPorts({
    client: { requestJson } as unknown as Client,
    target: { workspaceId: "ws", indexId: "index", categoryId: "category", scopeTag: tags[0] },
    settings: { timeout: 1, quiet: true } as Settings,
    pollInterval: 0,
    localize,
    verify,
  });
  return { ports, tags, requestJson, verify };
}
test("import sends file ID and requires an actual job ID", async () => {
  const input = fixture();
  input.requestJson.mockResolvedValueOnce({ data: { ingestionId: "job" } });
  expect(await input.ports.import("file")).toBe("job");
  expect(input.requestJson.mock.calls[0][0].body).toEqual({
    indexId: "index",
    sourceType: "DATA_CENTER_FILE",
    docIds: ["file"],
  });
  input.requestJson.mockResolvedValueOnce({ data: {} });
  await expect(input.ports.import("file")).rejects.toThrow("ID");
});
test("job completion and uniquely associated ready document are both required", async () => {
  const input = fixture();
  input.requestJson.mockResolvedValueOnce({
    data: { total_count: 1, rows: [{ doc_id: "actual-doc", code: "FINISH" }] },
  });
  input.requestJson.mockResolvedValueOnce({
    data: { fileList: [{ fileId: "file", tags: input.tags }] },
  });
  input.requestJson.mockResolvedValueOnce({
    data: { total_count: 1, rows: [{ doc_id: "actual-doc", tags: input.tags, status: "FINISH" }] },
  });
  expect(await input.ports.waitReady("file", "job", input.tags)).toBe("actual-doc");
});
test("service import error message passes through unchanged", async () => {
  const input = fixture();
  input.requestJson.mockResolvedValueOnce({
    data: { total_count: 1, rows: [{ doc_id: "doc", code: "FAILED", message: "服务原始错误" }] },
  });
  await expect(input.ports.waitReady("file", "job", input.tags)).rejects.toThrow("服务原始错误");
  expect(input.requestJson).toHaveBeenCalledTimes(1);
});
test("a ready document belonging to another job cannot be accepted", async () => {
  const input = fixture();
  input.requestJson.mockResolvedValueOnce({
    data: { total_count: 1, rows: [{ doc_id: "other", code: "FINISH" }] },
  });
  input.requestJson.mockResolvedValueOnce({
    data: { fileList: [{ fileId: "file", tags: input.tags }] },
  });
  input.requestJson.mockResolvedValueOnce({
    data: { total_count: 1, rows: [{ doc_id: "doc", tags: input.tags, status: "FINISH" }] },
  });
  await expect(input.ports.waitReady("file", "job", input.tags)).rejects.toThrow("job");
});

test("upload uses verified temporary bytes and checkpoints the registered ID", async () => {
  const input = fixture();
  const directory = await realpath(await mkdtemp(join(tmpdir(), "sync-ports-")));
  const absolutePath = join(directory, "a.md");
  const content = "snapshot payload";
  await writeFile(absolutePath, content);
  let snapshotPath = "";
  const spy = vi.spyOn(upload, "uploadKnowledgeFile").mockImplementation(async (options) => {
    snapshotPath = options.filePath;
    expect(snapshotPath).not.toBe(absolutePath);
    expect(await readFile(snapshotPath, "utf8")).toBe(content);
    expect(options.tags).toEqual(input.tags);
    expect(options.categoryId).toBe("category");
    await options.checkpoint?.({ leaseId: "lease", categoryId: "category", fileId: "file" });
    return { leaseId: "lease", categoryId: "category", fileId: "file" };
  });
  const registered = vi.fn(async () => {});
  try {
    expect(
      await input.ports.upload(
        {
          absolutePath,
          relativePath: "a.md",
          size: Buffer.byteLength(content),
          mtimeMs: 0,
          contentSha256: createHash("sha256").update(content).digest("hex"),
          contentMd5: createHash("md5").update(content).digest("hex"),
        },
        input.tags,
        registered,
      ),
    ).toBe("file");
    expect(registered).toHaveBeenCalledWith("file");
    await expect(stat(snapshotPath)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    spy.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
