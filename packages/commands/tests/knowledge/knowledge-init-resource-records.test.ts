import { expect, test } from "vite-plus/test";
import { initCreatedResources } from "../e2e/knowledge/journeys/init-resource-records.ts";

test("collects created resources from failure diagnostics without final stdout", () => {
  expect(
    initCreatedResources(
      "",
      `progress\n${JSON.stringify({ code: "KNOWLEDGE_INIT_RESOURCE", resource: { kind: "knowledge-base", id: "index", created: true } })}\n{"truncated"`,
    ),
  ).toEqual([{ kind: "knowledge-base", id: "index", created: true }]);
});
test("deduplicates final results and diagnostics, retaining separate resource types", () => {
  const resources = [
    { kind: "file", id: "shared-id", created: true },
    { kind: "service", id: "shared-id", created: true },
  ];
  expect(
    initCreatedResources(
      JSON.stringify({ resources }),
      JSON.stringify({ code: "KNOWLEDGE_INIT_RESOURCE", resource: resources[0] }),
    ),
  ).toEqual(resources);
});
test("never schedules reused, malformed, unknown or untrusted diagnostic resources for cleanup", () => {
  const resources = [
    { kind: "knowledge-base", id: "reused", created: false },
    { kind: "file", id: "missing-created" },
    { kind: "file", id: "", created: true },
    { kind: "other", id: "unknown", created: true },
  ];
  expect(
    initCreatedResources(
      JSON.stringify({ resources }),
      JSON.stringify({ resource: { kind: "file", id: "not-a-resource-event", created: true } }),
    ),
  ).toEqual([]);
});
