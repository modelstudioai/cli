import { syncTags } from "../../src/commands/knowledge/sync/tags.ts";
import { mkdtemp, realpath, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { RAG_PATHS, type Client, type LocalizedText } from "bailian-cli-core";
import { prepareSync } from "../../src/commands/knowledge/sync/prepare.ts";
import { writeStateFile } from "../../src/commands/knowledge/state-store.ts";
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "sync-prepare-")));
  directories.push(directory);
  await writeFile(join(directory, "a.md"), "hello");
  const requestJson = vi.fn(async (request): Promise<any> => {
    const path = new URL(request.path).pathname;
    if (path.endsWith(RAG_PATHS.indexList))
      return {
        data: {
          rows: ["index", "other-index"].map((id) => ({ id, name: id, knowledgeType: "document" })),
          total_count: 2,
        },
      };
    if (path.endsWith(RAG_PATHS.listCategory))
      return { data: { categoryList: [{ categoryId: "real-category", isDefault: true }] } };
    if (path.endsWith(RAG_PATHS.listFile)) return { data: { fileList: [] } };
    if (path.endsWith(RAG_PATHS.indexFileDetails)) return { data: { rows: [], total_count: 0 } };
    throw new Error("unexpected mutation or endpoint");
  });
  return {
    directory,
    workspaceId: "ws",
    indexId: "index",
    client: { requestJson } as unknown as Client,
    localize,
    requestJson,
  };
}
test("first preview binds actual category and revision without creating checkpoint directory", async () => {
  const input = await fixture();
  const prepared = await prepareSync(input);
  expect(prepared.state.target.categoryId).toBe("real-category");
  expect(prepared.stateRevision).toBeNull();
  expect(prepared.plan.actions[0].action).toBe("add");
  expect(prepared.plan.risk).toBeNull();
  expect(prepared.notices[0].code).toBe("KNOWLEDGE_SYNC_MODEL_BILLING");
  await expect(stat(join(input.directory, ".bailian"))).rejects.toMatchObject({ code: "ENOENT" });
});
test("bad explicit synchronization ID fails before networking", async () => {
  const input = await fixture();
  await expect(prepareSync({ ...input, syncId: "bad" })).rejects.toThrow();
  expect(input.requestJson).not.toHaveBeenCalled();
});
test("checkpoint target mismatch stops before networking", async () => {
  const input = await fixture();
  const prepared = await prepareSync(input);
  const stateFile = join(input.directory, "saved.json");
  await writeFile(stateFile, JSON.stringify(prepared.state));
  input.requestJson.mockClear();
  await expect(prepareSync({ ...input, stateFile, indexId: "different" })).rejects.toThrow(
    "different target",
  );
  expect(input.requestJson).not.toHaveBeenCalled();
});
test("existing checkpoint preserves actual category and synchronization ID", async () => {
  const input = await fixture();
  const prepared = await prepareSync(input);
  const stateFile = join(input.directory, "saved.json");
  await writeFile(stateFile, JSON.stringify(prepared.state));
  const repeated = await prepareSync({ ...input, stateFile });
  expect(repeated.state.syncId).toBe(prepared.state.syncId);
  expect(repeated.stateRevision).toMatch(/^[a-f0-9]{64}$/);
  expect(repeated.scan.files.map((file) => file.relativePath)).toEqual(["a.md"]);
});

test.each(["ws", "other-ws"])(
  "default checkpoints isolate indexes and restore each synchronization when switching back in %s",
  async (workspaceId) => {
    const input = await fixture();
    const first = await prepareSync(input);
    await writeStateFile(first.stateFile, first.state);
    const second = await prepareSync({ ...input, workspaceId, indexId: "other-index" });
    expect(second.stateFile).not.toBe(first.stateFile);
    expect(second.stateRevision).toBeNull();
    expect(second.state.syncId).not.toBe(first.state.syncId);
    await writeStateFile(second.stateFile, second.state);

    for (const saved of [first, second]) {
      const restored = await prepareSync({
        ...input,
        workspaceId: saved.state.target.workspaceId,
        indexId: saved.state.target.indexId,
      });
      expect(restored.stateFile).toBe(saved.stateFile);
      expect(restored.state).toEqual(saved.state);
      expect(restored.stateRevision).not.toBeNull();
      expect(restored.scan.files.map((file) => file.relativePath)).toEqual(["a.md"]);
    }
  },
);

test("default sync path depends only on index ID within its source directory", async () => {
  const input = await fixture();
  const first = await prepareSync(input);
  const otherWorkspace = await prepareSync({ ...input, workspaceId: "other-ws" });
  expect(otherWorkspace.stateFile).toBe(first.stateFile);
  await expect(stat(join(input.directory, ".bailian"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("legacy default checkpoint is not read or migrated", async () => {
  const input = await fixture();
  const legacyPath = join(input.directory, ".bailian", "sync-state.json");
  await writeStateFile(legacyPath, { obsolete: true });
  const prepared = await prepareSync(input);
  expect(prepared.stateFile).not.toBe(legacyPath);
  expect(prepared.stateRevision).toBeNull();
  await expect(stat(prepared.stateFile)).rejects.toMatchObject({ code: "ENOENT" });
});

test("verified existing document produces replacement risk after local changes", async () => {
  const input = await fixture();
  const first = await prepareSync(input);
  const local = first.scan.files[0];
  first.state.entries[local.relativePath] = {
    relativePath: local.relativePath,
    contentSha256: "d".repeat(64),
    contentMd5: "e".repeat(32),
    size: 3,
    mtimeMs: 0,
    fileId: "old-file",
    docId: "old-doc",
  };
  const stateFile = join(input.directory, "saved.json");
  await writeFile(stateFile, JSON.stringify(first.state));
  const tags = syncTags(first.state.target, first.state.syncId, local.relativePath, "e".repeat(32));
  const original = input.requestJson.getMockImplementation()!;
  input.requestJson.mockImplementation(async (request) => {
    const path = new URL(request.path).pathname;
    if (path.endsWith(RAG_PATHS.listFile))
      return { data: { fileList: [{ fileId: "old-file", tags }] } };
    if (path.endsWith(RAG_PATHS.indexFileDetails))
      return { data: { rows: [{ doc_id: "old-doc", status: "FINISH", tags }], total_count: 1 } };
    return original(request);
  });
  const prepared = await prepareSync({ ...input, stateFile });
  expect(prepared.plan.blocked).toBe(false);
  expect(prepared.plan.actions[0]).toMatchObject({ action: "replace", oldDocId: "old-doc" });
  expect(prepared.plan.risk).toMatchObject({ level: "high", reason: "destructive" });
});
