import { expect, test, vi } from "vite-plus/test";
import type { Client, LocalizedText } from "bailian-cli-core";
import evidence from "./fixtures/sync-remote-contract.json" with { type: "json" };
import {
  associateSyncInventory,
  readSyncRemoteInventory,
} from "../../src/commands/knowledge/sync/remote.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
function inventory() {
  return {
    scopeTag: evidence.versions[0].tags[0],
    files: evidence.versions.map((version) => structuredClone(version.listedFile)),
    documents: evidence.versions.map((version) => structuredClone(version.document)),
  };
}

test("real verified tags associate coexisting versions without filename or ID inference", () => {
  expect(evidence.verified).toBe(true);
  const input = inventory();
  input.documents[0].doc_id = "different-document-id";
  const result = associateSyncInventory(input, localize);
  expect(result.linked).toHaveLength(2);
  expect(result.linked[0]).toMatchObject({
    fileId: "file-1",
    docId: "different-document-id",
    ready: true,
  });
  expect(result.linked[0].pathTag).toBe(result.linked[1].pathTag);
  expect(result.linked[0].contentMd5).not.toBe(result.linked[1].contentMd5);
});

test("unmanaged documents stay outside ownership; unindexed owned files remain visible for recovery", () => {
  const input = inventory();
  input.documents.pop();
  input.documents.push({ doc_id: "manual", doc_name: "same", status: "FINISH", tags: [] });
  const result = associateSyncInventory(input, localize);
  expect(result.unmanaged).toEqual([{ docId: "manual" }]);
  expect(result.unindexed).toHaveLength(1);
  expect(result.unindexed[0].fileId).toBe("file-2");
});

test.each([
  "duplicate-file",
  "duplicate-document",
  "missing-file",
  "missing-md5",
  "two-paths",
  "invalid-tags",
  "missing-id",
])("rejects %s instead of returning usable partial associations", (problem) => {
  const input = inventory();
  if (problem === "duplicate-file") input.files.push({ ...input.files[0], fileId: "duplicate" });
  if (problem === "duplicate-document")
    input.documents.push({ ...input.documents[0], doc_id: "duplicate" });
  if (problem === "missing-file") input.files.shift();
  if (problem === "missing-md5") input.documents[0].tags.pop();
  if (problem === "two-paths") input.files[0].tags.push(`p${"a".repeat(31)}`);
  if (problem === "invalid-tags") input.documents[0].tags = null as unknown as string[];
  if (problem === "missing-id") input.documents[0].doc_id = "";
  expect(() => associateSyncInventory(input, localize)).toThrow();
});

test("a pending remote document is never reported ready and inputs stay unchanged", () => {
  const input = inventory();
  input.documents[0].status = "RUNNING";
  const before = structuredClone(input);
  expect(associateSyncInventory(input, localize).linked[0].ready).toBe(false);
  expect(input).toEqual(before);
});

test("remote reader exhausts both inventories before associating", async () => {
  const input = inventory();
  const requestJson = vi
    .fn()
    .mockResolvedValueOnce({ data: { fileList: [input.files[0]], nextToken: "next" } })
    .mockResolvedValueOnce({ data: { fileList: [input.files[1]] } })
    .mockResolvedValueOnce({ data: { rows: [input.documents[0]], total_count: 2 } })
    .mockResolvedValueOnce({ data: { rows: [input.documents[1]], total_count: 2 } });
  const result = await readSyncRemoteInventory(
    { requestJson } as unknown as Client,
    {
      workspaceId: "workspace",
      indexId: "index",
      categoryId: "category",
      scopeTag: input.scopeTag,
    },
    localize,
  );
  expect(result.linked).toHaveLength(2);
  expect(requestJson.mock.calls[1][0].body.nextToken).toBe("next");
  expect(requestJson.mock.calls[3][0].body).toEqual({
    indexId: "index",
    pageNumber: 2,
    pageSize: 10,
  });
});

test.each(["missing-page", "service-error"])(
  "remote reader rejects %s without partial output",
  async (failure) => {
    const input = inventory();
    const original = new Error("original service response");
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({ data: { fileList: input.files } })
      .mockResolvedValueOnce({ data: { rows: [input.documents[0]], total_count: 2 } });
    if (failure === "service-error") requestJson.mockRejectedValueOnce(original);
    else requestJson.mockResolvedValueOnce({ data: { rows: [], total_count: 2 } });
    const result = readSyncRemoteInventory(
      { requestJson } as unknown as Client,
      {
        workspaceId: "workspace",
        indexId: "index",
        categoryId: "category",
        scopeTag: input.scopeTag,
      },
      localize,
    );
    if (failure === "service-error") await expect(result).rejects.toBe(original);
    else await expect(result).rejects.toThrow("incomplete");
  },
);

test("operation tags distinguish retained sources and repeated identical content", () => {
  const input = inventory();
  const original = input.files[0];
  const operationTag = `v${"a".repeat(31)}`;
  input.files.push({ fileId: "same-content-new-source", tags: [...original.tags, operationTag] });
  input.documents.push({
    ...input.documents[0],
    doc_id: "same-content-new-doc",
    tags: [...original.tags, operationTag],
  });
  const result = associateSyncInventory(input, localize);
  expect(result.linked).toHaveLength(3);
  expect(result.linked.find((document) => document.docId === "same-content-new-doc")).toMatchObject(
    { fileId: "same-content-new-source", operationTag },
  );
});
