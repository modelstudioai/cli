import { expect, test } from "vite-plus/test";
import { planSync } from "../../src/commands/knowledge/sync/plan.ts";

const managed = { relativePath: "a.md", contentSha256: "old", docId: "doc-a", fileId: "file-a" };

test.each([
  [false, "retain"],
  [true, "delete"],
] as const)("missing managed path with delete=%s", (deleteEnabled, action) => {
  const result = planSync({
    local: [],
    managed: [managed],
    unmanaged: [{ docId: "manual" }],
    deleteEnabled,
  });
  expect(result.actions).toEqual([expect.objectContaining({ relativePath: "a.md", action })]);
  expect(JSON.stringify(result.actions)).not.toContain("manual");
  expect(result.unmanaged).toEqual([{ docId: "manual" }]);
  expect(result.risk?.reason ?? null).toBe(deleteEnabled ? "destructive" : null);
  expect(result.blocked).toBe(false);
});

test("SHA256 determines skip and replace; paths with the same content remain independent", () => {
  const result = planSync({
    local: [
      { relativePath: "z.md", contentSha256: "old" },
      { relativePath: "a.md", contentSha256: "old" },
      { relativePath: "changed.md", contentSha256: "new" },
    ],
    managed: [
      managed,
      { ...managed, relativePath: "changed.md", fileId: "file-b", docId: "doc-b" },
    ],
    deleteEnabled: false,
  });
  expect(result.actions.map(({ relativePath, action }) => [relativePath, action])).toEqual([
    ["a.md", "skip"],
    ["changed.md", "replace"],
    ["z.md", "add"],
  ]);
  expect(result.counts).toMatchObject({ skip: 1, replace: 1, add: 1, delete: 0 });
  expect(result.risk).toMatchObject({ level: "high", reason: "destructive" });
});

test("rename is add plus retain, not hash-based identity matching", () => {
  const result = planSync({
    local: [{ relativePath: "renamed.md", contentSha256: "old" }],
    managed: [managed],
    deleteEnabled: false,
  });
  expect(result.actions.map(({ action }) => action)).toEqual(["retain", "add"]);
  expect(result.risk).toBeNull();
});

test.each(["symlink", "unsupported", "excluded", "not-file"] as const)(
  "a managed path skipped as %s conflicts instead of being deleted",
  (reason) => {
    const result = planSync({
      local: [],
      managed: [managed],
      skipped: [{ relativePath: "a.md", reason, subtree: false }],
      deleteEnabled: true,
    });
    expect(result.blocked).toBe(true);
    expect(result.actions[0]).toMatchObject({ action: "conflict", reason: "managed-path-skipped" });
    expect(result.counts.delete).toBe(0);
  },
);

test("skipped subtrees block their managed descendants without prefix-matching siblings", () => {
  const result = planSync({
    local: [],
    managed: [
      { ...managed, relativePath: "docs/a.md" },
      { ...managed, relativePath: "docs2/a.md", docId: "doc-b", fileId: "file-b" },
    ],
    skipped: [{ relativePath: "docs", reason: "symlink", subtree: true }],
    deleteEnabled: true,
  });
  expect(result.actions.map(({ action }) => action)).toEqual(["conflict", "delete"]);
  expect(result.blocked).toBe(true);
});

test("incomplete evidence blocks the entire plan, even when individual actions are otherwise valid", () => {
  const result = planSync({
    local: [],
    managed: [managed],
    deleteEnabled: true,
    conflicts: [{ reason: "incomplete-remote-inventory" }],
  });
  expect(result.blocked).toBe(true);
  expect(result.conflicts).toContainEqual({ reason: "incomplete-remote-inventory" });
});

test("a remote document not ready cannot be skipped or replaced", () => {
  const result = planSync({
    local: [{ relativePath: "a.md", contentSha256: "old" }],
    managed: [{ ...managed, ready: false }],
    deleteEnabled: true,
  });
  expect(result.actions[0]).toMatchObject({
    action: "conflict",
    reason: "managed-document-not-ready",
  });
  expect(result.blocked).toBe(true);
});

test.each(["add", "replace", "delete"] as const)(
  "pending %s produces only recovery, before planning new changes",
  (action) => {
    const result = planSync({
      local: [{ relativePath: "new.md", contentSha256: "new" }],
      managed: [managed],
      deleteEnabled: false,
      pending: [
        {
          operationId: "operation",
          relativePath: "a.md",
          action,
          phase: "intent",
          ...(action === "add" ? {} : { oldDocId: "doc-a" }),
        },
      ],
    });
    expect(result.actions).toEqual([
      expect.objectContaining({
        action: "recover",
        relativePath: "a.md",
        operationId: "operation",
      }),
    ]);
    expect(result.requiresReplan).toBe(true);
    expect(result.risk?.reason ?? null).toBe(action === "add" ? null : "destructive");
  },
);

test("duplicate paths or shared remote IDs cannot silently overwrite an association", () => {
  for (const input of [
    {
      local: [
        { relativePath: "a.md", contentSha256: "new" },
        { relativePath: "a.md", contentSha256: "other" },
      ],
      managed: [managed],
    },
    { local: [], managed: [managed, { ...managed, relativePath: "b.md" }] },
  ]) {
    expect(planSync({ ...input, deleteEnabled: true }).blocked).toBe(true);
  }
});

test("planning is deterministic, copies its inputs and handles an empty directory", () => {
  const input = {
    local: [{ relativePath: "a.md", contentSha256: "new" }],
    managed: [managed],
    deleteEnabled: false,
  };
  const before = structuredClone(input);
  const first = planSync(input);
  expect(planSync(input)).toEqual(first);
  expect(input).toEqual(before);
  first.actions[0].relativePath = "mutated.md";
  expect(input).toEqual(before);
  const empty = planSync({ local: [], managed: [], deleteEnabled: true });
  expect(empty.actions).toEqual([]);
  expect(empty.blocked).toBe(false);
  expect(empty.risk).toBeNull();
});

test("mtime and size do not substitute for content hashes; plans omit absolute local paths", () => {
  const file = {
    relativePath: "a.md",
    contentSha256: "new",
    contentMd5: "digest",
    size: 12,
    mtimeMs: 10,
    absolutePath: "/private/user/a.md",
  };
  const result = planSync({
    local: [file],
    managed: [{ ...managed, size: 12, mtimeMs: 10 }],
    deleteEnabled: false,
  });
  expect(result.actions[0].action).toBe("replace");
  expect(result.actions[0].fingerprint).toEqual({
    relativePath: "a.md",
    contentSha256: "new",
    contentMd5: "digest",
    size: 12,
    mtimeMs: 10,
  });
  expect(JSON.stringify(result)).not.toContain("/private/user");
  const changedTime = planSync({
    local: [{ ...file, contentSha256: "old", mtimeMs: 20 }],
    managed: [managed],
    deleteEnabled: false,
  });
  expect(changedTime.actions[0].action).toBe("skip");
});

test.each(["../outside.md", "/absolute.md", "folder/../a.md"])(
  "invalid path %s cannot be scheduled",
  (relativePath) => {
    const result = planSync({
      local: [{ relativePath, contentSha256: "new" }],
      managed: [],
      deleteEnabled: false,
    });
    expect(result.blocked).toBe(true);
    expect(result.actions[0]).toMatchObject({
      action: "conflict",
      reason: "invalid-relative-path",
    });
  },
);

test("a skipped pending path blocks recovery, and recovery data does not alias the input", () => {
  const pending = {
    operationId: "operation",
    relativePath: "a.md",
    action: "replace" as const,
    phase: "ready" as const,
    oldDocId: "doc-a",
    newDocId: "doc-new",
  };
  const result = planSync({
    local: [],
    managed: [managed],
    deleteEnabled: false,
    pending: [pending],
    skipped: [{ relativePath: "a.md", reason: "symlink", subtree: false }],
  });
  expect(result.blocked).toBe(true);
  expect(result.conflicts).toContainEqual({ relativePath: "a.md", reason: "pending-path-skipped" });
  result.actions[0].pending!.newDocId = "mutated";
  expect(pending.newDocId).toBe("doc-new");
});
