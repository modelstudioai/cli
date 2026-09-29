import { expect, test, vi } from "vite-plus/test";
import type { Client, LocalizedText } from "bailian-cli-core";
import {
  collectResourcePages,
  listKnowledgeIndexes,
  listKnowledgeServices,
  listKnowledgeDocuments,
} from "../../src/commands/knowledge/operations/list.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const identify = (row: { id: string }) => row.id;

test("collects every page even when the server returns fewer rows than requested", async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ id: "first" }], total: 2 })
    .mockResolvedValueOnce({ rows: [{ id: "second" }], total: 2 });
  expect(await collectResourcePages(load, identify, localize)).toEqual([
    { id: "first" },
    { id: "second" },
  ]);
  expect(load.mock.calls).toEqual([[1], [2]]);
});

test.each(
  [
    [{ rows: [], total: 1 }],
    [{ rows: [{ id: "first" }] }],
    [{ total: 0 }],
    [{ rows: [], total: -1 }],
    [{ rows: [], total: 0.5 }],
    [{ rows: [{ id: "" }], total: 1 }],
    [
      { rows: [{ id: "first" }], total: 2 },
      { rows: [{ id: "first" }], total: 2 },
    ],
    [
      { rows: [{ id: "first" }], total: 2 },
      { rows: [{ id: "second" }], total: 3 },
    ],
    [{ rows: [{ id: "first" }, { id: "second" }], total: 1 }],
  ].map((pages) => ({ pages })),
)("incomplete or inconsistent listings fail closed %#", async ({ pages }) => {
  const load = vi.fn(async (page: number) => pages[page - 1]!);
  await expect(collectResourcePages(load, identify, localize)).rejects.toMatchObject({
    exitCode: 1,
  });
  expect(load.mock.calls.length).toBeLessThanOrEqual(pages.length);
});

test("an explicitly empty complete inventory is valid", async () => {
  expect(
    await collectResourcePages(async () => ({ rows: [], total: 0 }), identify, localize),
  ).toEqual([]);
});

test("server errors are preserved and never converted into an empty inventory", async () => {
  const failure = new Error("raw denied");
  await expect(
    collectResourcePages(
      async () => {
        throw failure;
      },
      identify,
      localize,
    ),
  ).rejects.toBe(failure);
});

test("each resource endpoint uses its actual pagination and total fields", async () => {
  const requestJson = vi
    .fn()
    .mockResolvedValueOnce({ data: { rows: [{ id: "index-1", name: "demo" }], total_count: 1 } })
    .mockResolvedValueOnce({ data: { rows: [{ agent_id: "agent-1" }], total_count: 1 } })
    .mockResolvedValueOnce({
      data: { rows: [{ doc_id: "doc-1", tags: ["owned"] }], total_count: 1 },
    });
  const client = { requestJson } as unknown as Client;
  expect(await listKnowledgeIndexes(client, "ws-test", localize)).toHaveLength(1);
  expect(await listKnowledgeServices(client, "ws-test", localize)).toHaveLength(1);
  expect(await listKnowledgeDocuments(client, "ws-test", "index-1", localize)).toEqual([
    { doc_id: "doc-1", tags: ["owned"] },
  ]);
  const requests = requestJson.mock.calls.map(([request]) => request);
  expect(requests[0].method).toBe("GET");
  expect(new URL(requests[0].path).searchParams.get("page_number")).toBe("1");
  expect(new URL(requests[0].path).searchParams.get("page_size")).toBe("100");
  expect(requests[0].body).toBeUndefined();
  expect(requests[1].body).toEqual({ agent_scene: "search", page_number: 1, page_size: 100 });
  expect(requests[2].body).toEqual({ indexId: "index-1", pageNumber: 1, pageSize: 10 });
});
