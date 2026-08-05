import { describe, expect, test } from "vite-plus/test";
import { buildDataSourceFields } from "../../src/commands/knowledge/kb-create.ts";

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
