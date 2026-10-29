import { expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  ExitCode,
  RAG_PATHS,
  type Client,
  type LocalizedText,
} from "bailian-cli-core";
import { listKnowledgeFiles } from "../../src/commands/knowledge/operations/list.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
function fixture(pages: unknown[]) {
  const requestJson = vi.fn();
  for (const page of pages) requestJson.mockResolvedValueOnce(page);
  return { requestJson, client: { requestJson } as unknown as Client };
}
test("file inventory follows every cursor in the exact workspace and category", async () => {
  const { client, requestJson } = fixture([
    { data: { fileList: [{ fileId: "file-1", tags: ["tag"] }], nextToken: "page-2" } },
    { data: { fileList: [{ fileId: "file-2" }], nextToken: "page-3" } },
    { data: { fileList: [{ fileId: "file-3" }], nextToken: "" } },
  ]);
  expect(
    (await listKnowledgeFiles(client, "ws-test", "category-test", localize)).map(
      (file) => file.fileId,
    ),
  ).toEqual(["file-1", "file-2", "file-3"]);
  expect(requestJson.mock.calls.map(([request]) => request.body)).toEqual([
    { categoryId: "category-test", maxResult: 100 },
    { categoryId: "category-test", maxResult: 100, nextToken: "page-2" },
    { categoryId: "category-test", maxResult: 100, nextToken: "page-3" },
  ]);
  expect(new URL(requestJson.mock.calls[0][0].path).pathname).toBe(RAG_PATHS.listFile);
  expect(new URL(requestJson.mock.calls[0][0].path).hostname).toContain("ws-test.");
});
test.each([undefined, null, ""])(
  "an explicit empty inventory ends with terminal token %j",
  async (nextToken) => {
    const { client, requestJson } = fixture([{ data: { fileList: [], nextToken } }]);
    expect(await listKnowledgeFiles(client, "ws", "category", localize)).toEqual([]);
    expect(requestJson).toHaveBeenCalledOnce();
  },
);
test.each([
  {},
  { data: {} },
  { data: { fileList: null } },
  { data: { fileList: [{}] } },
  { data: { fileList: [{ fileId: " " }] } },
  { data: { fileList: [{ fileId: "file" }, { fileId: "file" }] } },
  { data: { fileList: [], nextToken: "more" } },
  { data: { fileList: [{ fileId: "file" }], nextToken: 4 } },
])("malformed page fails closed: %j", async (page) => {
  const { client } = fixture([page]);
  await expect(listKnowledgeFiles(client, "ws", "category", localize)).rejects.toMatchObject({
    exitCode: 1,
  });
});
test("a repeated cursor or duplicate file across pages cannot return a partial inventory", async () => {
  for (const second of [
    { fileList: [{ fileId: "file-2" }], nextToken: "again" },
    { fileList: [{ fileId: "file-1" }] },
  ]) {
    const { client, requestJson } = fixture([
      { data: { fileList: [{ fileId: "file-1" }], nextToken: "again" } },
      { data: second },
    ]);
    await expect(listKnowledgeFiles(client, "ws", "category", localize)).rejects.toMatchObject({
      exitCode: 1,
    });
    expect(requestJson).toHaveBeenCalledTimes(2);
  }
});
test("later service errors preserve the original error without returning the first page", async () => {
  const { client, requestJson } = fixture([
    { data: { fileList: [{ fileId: "file" }], nextToken: "more" } },
  ]);
  const original = new BailianError("original service failure", ExitCode.GENERAL);
  requestJson.mockRejectedValueOnce(original);
  await expect(listKnowledgeFiles(client, "ws", "category", localize)).rejects.toBe(original);
});
