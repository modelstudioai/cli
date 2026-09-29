import { expect, test } from "vite-plus/test";
import { exactIndexInventory } from "../e2e/knowledge/journeys/exact-index-inventory.ts";

test("exact inventory proves new version and original sentinel both survived", () => {
  expect(
    exactIndexInventory(
      { data: { rows: [{ doc_id: "new" }, { doc_id: "sentinel" }], total_count: 2 } },
      ["sentinel", "new"],
    ),
  ).toBe(true);
});
test.each([
  { rows: [{ doc_id: "new" }, { doc_id: "unrelated" }], total_count: 2 },
  { rows: [{ doc_id: "new" }, { doc_id: "new" }], total_count: 2 },
  { rows: [{ doc_id: "new" }], total_count: 2 },
  { rows: [{ doc_id: "new" }, { doc_id: "sentinel" }], total_count: 3 },
  { rows: [{ doc_id: "new" }, {}], total_count: 2 },
  { rows: [{ doc_id: "new" }, { doc_id: "sentinel" }] },
  null,
])("incomplete or incorrect evidence cannot pass: %j", (data) => {
  expect(exactIndexInventory({ data }, ["sentinel", "new"])).toBe(false);
});
test("duplicated expected IDs are not a valid inventory contract", () => {
  expect(
    exactIndexInventory(
      { data: { rows: [{ doc_id: "new" }, { doc_id: "new" }], total_count: 2 } },
      ["new", "new"],
    ),
  ).toBe(false);
});
