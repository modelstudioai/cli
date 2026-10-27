import { expect, test } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import { parseSyncState } from "../../src/commands/knowledge/sync/state.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const target = {
  endpointOrigin: "https://example.com",
  workspaceId: "ws-1",
  indexId: "index-1",
  categoryId: "category-1",
};
const syncId = "3c4e5635-7b2e-4a1d-813b-c848586e0ea9";
const entry = {
  relativePath: "a.md",
  contentSha256: "a".repeat(64),
  contentMd5: "b".repeat(32),
  size: 1,
  mtimeMs: 1,
  fileId: "file-1",
  docId: "doc-1",
};
const state = { schemaVersion: 1, syncId, target, entries: { "a.md": entry }, pending: [] };

test("missing state is distinct from a valid existing checkpoint", () => {
  expect(parseSyncState(undefined, target, undefined, localize)).toBeUndefined();
  expect(parseSyncState(state, target, syncId, localize)).toEqual(state);
});

test.each(
  [
    { ...state, schemaVersion: 2 },
    { ...state, syncId: "docs" },
    { ...state, apiKey: "secret" },
    { ...state, target: { ...target, signedUrl: "secret" } },
    { ...state, entries: { "../a.md": { ...entry, relativePath: "../a.md" } } },
    { ...state, entries: { "a.md": { ...entry, absolutePath: "/home/private/a.md" } } },
    { ...state, entries: { "a.md": { ...entry, relativePath: "b.md" } } },
    { ...state, entries: { "a.md": { ...entry, contentSha256: "partial" } } },
    { ...state, entries: { "a.md": { ...entry, contentMd5: "partial" } } },
    { ...state, entries: { "a.md": { ...entry, size: -1 } } },
    { ...state, entries: { "a.md": { ...entry, mtimeMs: NaN } } },
    { ...state, entries: { "a.md": entry, "b.md": { ...entry, relativePath: "b.md" } } },
    {
      ...state,
      pending: [{ operationId: "op", relativePath: "a.md", action: "replace", phase: "ready" }],
    },
    {
      ...state,
      pending: [
        {
          operationId: "op",
          relativePath: "a.md",
          action: "delete",
          phase: "registered",
          fileId: "file-2",
        },
      ],
    },
  ].map((checkpoint) => ({ checkpoint })),
)("rejects unsafe checkpoint %#", ({ checkpoint }) => {
  expect(() => parseSyncState(checkpoint, target, undefined, localize)).toThrow();
});

test.each(["endpointOrigin", "workspaceId", "indexId", "categoryId"] as const)(
  "changing target %s rejects state reuse",
  (field) => {
    expect(() =>
      parseSyncState(state, { ...target, [field]: `${target[field]}-other` }, undefined, localize),
    ).toThrow(/target/);
  },
);

test("explicit synchronization ID must match the saved ID", () => {
  expect(() =>
    parseSyncState(state, target, "3c4e5635-7b2e-4a1d-813b-c848586e0eaa", localize),
  ).toThrow(/sync/);
});

test("pending replacement retains both versions and survives parsing", () => {
  const checkpoint = {
    ...state,
    pending: [
      {
        operationId: "op-1",
        relativePath: "a.md",
        action: "replace",
        phase: "ready",
        contentSha256: "c".repeat(64),
        fileId: "file-2",
        ingestionId: "job-2",
        newDocId: "doc-2",
        oldDocId: "doc-1",
      },
    ],
  };
  expect(parseSyncState(checkpoint, target, undefined, localize)).toEqual(checkpoint);
});

test("pending deletion must identify the current managed document", () => {
  const pending = {
    operationId: "op-1",
    relativePath: "a.md",
    action: "delete",
    phase: "deleting",
    oldDocId: "doc-1",
  };
  expect(
    parseSyncState({ ...state, pending: [pending] }, target, undefined, localize),
  ).toMatchObject({ pending: [pending] });
  expect(() =>
    parseSyncState(
      { ...state, pending: [{ ...pending, oldDocId: "unmanaged" }] },
      target,
      undefined,
      localize,
    ),
  ).toThrow();
});

test.each(["ready", "deleting"])(
  "recovered %s checkpoint can retain verified document IDs without a lost job ID",
  (phase) => {
    const pending = {
      operationId: "op",
      relativePath: "a.md",
      action: "replace",
      phase,
      contentSha256: "c".repeat(64),
      fileId: "file-2",
      newDocId: "doc-2",
      oldDocId: "doc-1",
    };
    expect(
      parseSyncState({ ...state, pending: [pending] }, target, undefined, localize),
    ).toMatchObject({ pending: [pending] });
    expect(() =>
      parseSyncState(
        { ...state, pending: [{ ...pending, phase: "submitted" }] },
        target,
        undefined,
        localize,
      ),
    ).toThrow();
  },
);
