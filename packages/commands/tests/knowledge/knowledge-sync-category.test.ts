import { expect, test, vi } from "vite-plus/test";
import type { Client, LocalizedText } from "bailian-cli-core";
import { resolveSyncCategory } from "../../src/commands/knowledge/sync/category.ts";
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
function clientFor(pages: unknown[]) {
  const requestJson = vi.fn();
  for (const page of pages) requestJson.mockResolvedValueOnce(page);
  return { client: { requestJson } as unknown as Client, requestJson };
}
test("resolves one real default ID across all pages", async () => {
  const { client, requestJson } = clientFor([
    { data: { categoryList: [{ categoryId: "custom" }], nextToken: "next" } },
    { data: { categoryList: [{ categoryId: "real-default", isDefault: true }] } },
  ]);
  expect(await resolveSyncCategory(client, "ws", undefined, localize)).toBe("real-default");
  expect(requestJson.mock.calls[1][0].body).toEqual({
    type: "UNSTRUCTURED",
    maxResult: 100,
    nextToken: "next",
  });
});
test("explicit category is checked by exact ID, not default or name", async () => {
  const { client } = clientFor([
    {
      data: {
        categoryList: [
          { categoryId: "custom", categoryName: "default" },
          { categoryId: "real-default", isDefault: true },
        ],
      },
    },
  ]);
  expect(await resolveSyncCategory(client, "ws", "custom", localize)).toBe("custom");
});
test.each([
  { categoryList: [] },
  {
    categoryList: [
      { categoryId: "one", isDefault: true },
      { categoryId: "two", isDefault: true },
    ],
  },
  { categoryList: [{ categoryId: "one", isDefault: "true" }] },
  { categoryList: [{ isDefault: true }] },
  { categoryList: [{ categoryId: "one" }, { categoryId: "one" }] },
  { categoryList: [], nextToken: "next" },
  {},
])("incomplete or ambiguous category listing fails %#", async (data) => {
  const { client } = clientFor([{ data }]);
  await expect(resolveSyncCategory(client, "ws", undefined, localize)).rejects.toThrow();
});
test("later page failure is not hidden by an earlier default", async () => {
  const { client, requestJson } = clientFor([
    { data: { categoryList: [{ categoryId: "real", isDefault: true }], nextToken: "next" } },
  ]);
  const failure = new Error("service error");
  requestJson.mockRejectedValueOnce(failure);
  await expect(resolveSyncCategory(client, "ws", undefined, localize)).rejects.toBe(failure);
});
test("repeated cursor is rejected", async () => {
  const { client } = clientFor([
    { data: { categoryList: [{ categoryId: "one" }], nextToken: "same" } },
    { data: { categoryList: [{ categoryId: "two" }], nextToken: "same" } },
  ]);
  await expect(resolveSyncCategory(client, "ws", undefined, localize)).rejects.toThrow();
});
