import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type LocalizedText,
  type RagListCategoryResponse,
  type RagCategory,
} from "bailian-cli-core";

/** Resolve aliases before binding state; never persist the movable default alias. */
export async function resolveSyncCategory(
  client: Client,
  workspaceId: string,
  requested: string | undefined,
  localize: (text: LocalizedText) => string,
): Promise<string> {
  const invalid = () =>
    new BailianError(
      localize({
        "en-US":
          "Cannot resolve a unique data-center category from a complete listing. Specify an existing category ID and retry.",
        "zh-CN": "无法从完整清单中确定唯一的数据中心类目。请指定已存在的类目 ID 后重试。",
      }),
      ExitCode.GENERAL,
    );
  const categories: RagCategory[] = [];
  const identifiers = new Set<string>();
  const cursors = new Set<string>();
  let nextToken: string | undefined;
  for (let page = 0; page < 10000; page++) {
    const response = await client.requestJson<RagListCategoryResponse>({
      path: ragEndpoint(workspaceId, RAG_PATHS.listCategory),
      method: "POST",
      body: { type: "UNSTRUCTURED", maxResult: 100, ...(nextToken ? { nextToken } : {}) },
    });
    const rows = response.data?.categoryList;
    const cursor = response.data?.nextToken;
    if (!Array.isArray(rows) || (cursor != null && typeof cursor !== "string")) throw invalid();
    for (const row of rows) {
      if (
        !row ||
        typeof row.categoryId !== "string" ||
        !row.categoryId.trim() ||
        identifiers.has(row.categoryId) ||
        (row.isDefault !== undefined && typeof row.isDefault !== "boolean")
      )
        throw invalid();
      identifiers.add(row.categoryId);
      categories.push(row);
    }
    if (cursor == null || cursor === "") {
      const matches = categories.filter((category) =>
        requested && requested !== "default"
          ? category.categoryId === requested
          : category.isDefault === true,
      );
      if (matches.length !== 1 || matches[0].categoryId === "default") throw invalid();
      return matches[0].categoryId!;
    }
    if (!rows.length || cursors.has(cursor)) throw invalid();
    cursors.add(cursor);
    nextToken = cursor;
  }
  throw invalid();
}
