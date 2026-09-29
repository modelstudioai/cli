import { expect, test } from "vite-plus/test";
import {
  syncTags,
  syncPathTag,
  validSyncId,
  validRelativePath,
} from "../../src/commands/knowledge/sync/tags.ts";

const target = { endpointOrigin: "https://example.com", workspaceId: "ws-1", indexId: "index-1" };
const syncId = "3c4e5635-7b2e-4a1d-813b-c848586e0ea9";
test("three bounded tags contain scope, path hash and complete MD5 but no path text", () => {
  const tags = syncTags(target, syncId, "私人资料/a b.md", "a".repeat(32));
  expect(tags).toHaveLength(3);
  expect(tags[0]).toMatch(/^s[0-9a-f]{31}$/);
  expect(tags[1]).toMatch(/^p[0-9a-f]{31}$/);
  expect(tags[2]).toBe("a".repeat(32));
  expect(JSON.stringify(tags)).not.toContain("私人资料");
});
test("scope binds endpoint, workspace, index and synchronization ID", () => {
  const baseline = syncTags(target, syncId, "a.md", "b".repeat(32))[0];
  for (const changed of [
    { ...target, endpointOrigin: "https://other.example.com" },
    { ...target, workspaceId: "ws-2" },
    { ...target, indexId: "index-2" },
  ]) {
    expect(syncTags(changed, syncId, "a.md", "b".repeat(32))[0]).not.toBe(baseline);
  }
  expect(
    syncTags(target, "3c4e5635-7b2e-4a1d-813b-c848586e0eaa", "a.md", "b".repeat(32))[0],
  ).not.toBe(baseline);
});
test("path hashing preserves directories, case and Unicode normalization differences", () => {
  const paths = ["one/a.md", "two/a.md", "A.md", "a.md", "é.md", "e\u0301.md"];
  expect(new Set(paths.map(syncPathTag)).size).toBe(paths.length);
});
test.each([
  "../a.md",
  "/a.md",
  "a/../b.md",
  "a//b.md",
  "./a.md",
  "a\\b.md",
  "",
  "C:/a.md",
  "a\0.md",
])("unsafe relative path is rejected: %s", (path) => {
  expect(validRelativePath(path)).toBe(false);
});
test("only UUID synchronization IDs are accepted", () => {
  expect(validSyncId(syncId)).toBe(true);
  expect(validSyncId("my-docs")).toBe(false);
});
