import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import create, { buildDataSourceFields } from "../../src/commands/knowledge/kb-create.ts";

describe("buildDataSourceFields", () => {
  test("--doc-id 推导 DATA_CENTER_FILE + docIds", () => {
    const fields = buildDataSourceFields({ docId: ["file_1", "file_2"] });
    expect(fields).toEqual({
      sourceType: "DATA_CENTER_FILE",
      docIds: ["file_1", "file_2"],
      dataSources: [{ sourceType: "DATA_CENTER_FILE" }],
    });
  });

  test("--category-id 推导 DATA_CENTER_CATEGORY + categoryIds", () => {
    const fields = buildDataSourceFields({ categoryId: ["cate_1"] });
    expect(fields).toEqual({
      sourceType: "DATA_CENTER_CATEGORY",
      categoryIds: ["cate_1"],
      dataSources: [{ sourceType: "DATA_CENTER_CATEGORY" }],
    });
  });
});

afterEach(() => vi.restoreAllMocks());
test.each([
  {
    knowledgeType: "multimedia",
    expected: {
      embeddingModelName: "qwen3-vl-embedding",
      rerankModelName: "qwen3-vl-rerank",
      rerankMode: "similar",
    },
  },
  {
    knowledgeType: "document",
    knowledgeScene: "visual_perception_qa",
    expected: { embeddingModelName: "qwen3-vl-embedding" },
  },
  { knowledgeType: undefined, expected: { embeddingModelName: "text-embedding-v4" } },
])(
  "default model fields for $knowledgeType",
  async ({ knowledgeType, knowledgeScene, expected }) => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const requestJson = vi.fn();
    await create.run({
      flags: {
        name: "fixture",
        description: "fixture",
        docId: ["file-test"],
        knowledgeType,
        knowledgeScene,
        workspaceId: "ws_test",
      },
      settings: { dryRun: true, output: "json" },
      client: { requestJson },
    } as unknown as Parameters<typeof create.run>[0]);
    const body = JSON.parse(writes.join("")).request;
    expect(body).toMatchObject(expected);
    expect(body).not.toHaveProperty("multimodalEmbeddingModelName");
    if (knowledgeType !== "multimedia") expect(body).not.toHaveProperty("rerankModelName");
    expect(requestJson).not.toHaveBeenCalled();
  },
);

test("multimedia embedding aliases cannot silently override each other", async () => {
  expect(
    await create.validate?.({
      knowledgeType: "multimedia",
      embeddingModel: "qwen3-vl-embedding",
      multimodalEmbeddingModel: "other-model",
    } as Parameters<NonNullable<typeof create.validate>>[0]),
  ).toBeTruthy();
});
