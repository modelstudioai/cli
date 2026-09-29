import { expect, test, vi } from "vite-plus/test";
import type { Client, LocalizedText } from "bailian-cli-core";
import { deleteSyncDocument } from "../../src/commands/knowledge/sync/delete.ts";
import { syncPathTag } from "../../src/commands/knowledge/sync/tags.ts";
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
function fixture() {
  const scopeTag = `s${"a".repeat(31)}`;
  const old = {
    relativePath: "a.md",
    contentSha256: "c".repeat(64),
    contentMd5: "d".repeat(32),
    size: 1,
    mtimeMs: 1,
    fileId: "old-file",
    docId: "old-doc",
  };
  const tags = [scopeTag, syncPathTag("a.md"), old.contentMd5];
  const files = [{ fileId: old.fileId, tags }];
  const documents = [{ doc_id: old.docId, tags, status: "FINISH" }];
  const requestJson = vi.fn();
  const snapshot = (rows = documents) =>
    requestJson
      .mockResolvedValueOnce({ data: { fileList: files } })
      .mockResolvedValueOnce({ data: { rows, total_count: rows.length } });
  return {
    old,
    tags,
    files,
    documents,
    requestJson,
    snapshot,
    options: {
      client: { requestJson } as unknown as Client,
      target: { workspaceId: "ws", indexId: "index", categoryId: "category", scopeTag },
      localize,
      timeoutMs: 1000,
      intervalMs: 0,
    },
  };
}
test("deletion submits only the verified doc ID and waits for disappearance even when deleted is empty", async () => {
  const input = fixture();
  input.snapshot();
  input.requestJson.mockResolvedValueOnce({ data: { deleted: [] } });
  input.snapshot();
  input.snapshot([]);
  await deleteSyncDocument({ ...input.options, old: input.old });
  expect(input.requestJson.mock.calls[2][0].body).toEqual({
    index_id: "index",
    doc_ids: ["old-doc"],
  });
  expect(input.requestJson).toHaveBeenCalledTimes(7);
});
test("already absent document does not resubmit deletion", async () => {
  const input = fixture();
  input.snapshot([]);
  await deleteSyncDocument({ ...input.options, old: input.old });
  expect(input.requestJson).toHaveBeenCalledTimes(2);
});
test("ownership drift stops before delete", async () => {
  const input = fixture();
  input.documents[0].tags = [];
  input.snapshot();
  await expect(deleteSyncDocument({ ...input.options, old: input.old })).rejects.toThrow(
    "ownership",
  );
  expect(input.requestJson).toHaveBeenCalledTimes(2);
});
test("missing or nonready replacement stops before delete", async () => {
  const input = fixture();
  input.snapshot();
  await expect(
    deleteSyncDocument({
      ...input.options,
      old: input.old,
      replacement: { fileId: "new-file", docId: "new-doc", tags: input.tags },
    }),
  ).rejects.toThrow("replacement");
  expect(input.requestJson).toHaveBeenCalledTimes(2);
});
test("server error is preserved and write is not retried", async () => {
  const input = fixture();
  const failure = new Error("server original");
  input.snapshot();
  input.requestJson.mockRejectedValueOnce(failure);
  await expect(deleteSyncDocument({ ...input.options, old: input.old })).rejects.toBe(failure);
  expect(input.requestJson).toHaveBeenCalledTimes(3);
});

test("ready replacement is retained while old deletion becomes visible", async () => {
  const input = fixture();
  const tags = [input.options.target.scopeTag, syncPathTag("a.md"), "e".repeat(32)];
  input.files.push({ fileId: "new-file", tags });
  const replacement = { doc_id: "new-doc", tags, status: "FINISH" };
  input.documents.push(replacement);
  input.snapshot();
  input.requestJson.mockResolvedValueOnce({ data: { deleted: ["old-doc"] } });
  input.snapshot([replacement]);
  await deleteSyncDocument({
    ...input.options,
    old: input.old,
    replacement: { fileId: "new-file", docId: "new-doc", tags },
  });
  expect(input.requestJson.mock.calls[2][0].body.doc_ids).toEqual(["old-doc"]);
});

test("reported success without disappearance times out without resubmitting", async () => {
  const input = fixture();
  input.snapshot();
  input.requestJson.mockResolvedValueOnce({ data: { deleted: ["old-doc"] } });
  input.snapshot();
  await expect(
    deleteSyncDocument({ ...input.options, timeoutMs: 0, old: input.old }),
  ).rejects.toMatchObject({ exitCode: 5 });
  expect(input.requestJson).toHaveBeenCalledTimes(5);
});
