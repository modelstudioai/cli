import { randomUUID } from "node:crypto";
import { StateManager } from "@openagentpack/sdk";
import { expect, test } from "vite-plus/test";
import { selectResourceKey } from "../src/commands/managed-agent/_engine/scoped-create.ts";

const declaration = {
  name: "Notes",
  description: "",
  metadata: {},
  provider: "bailian",
  entries: [{ key: "notes.md", content: "Initial notes" }],
};
function selection(
  initializing: boolean,
  pendingEntries: Array<{ path: string; content_sha256: string }>,
  candidate = declaration,
) {
  const state = StateManager.initialize(`/tmp/bl-memory-create-${randomUUID()}.json`);
  state.setResource({
    address: { provider: "bailian", type: "memory_store", name: "notes" },
    remote_id: "memstore_tracked",
    content_hash: "old",
    ...(initializing ? { memory_initialization: { pending_entries: pendingEntries } } : {}),
  });
  return selectResourceKey({
    displayName: "Notes",
    provider: "bailian",
    resourceTypes: ["memory_store"],
    declarations: { notes: declaration },
    candidate,
    effectiveName: (key, entry) => (typeof entry.name === "string" ? entry.name : key),
    state,
  });
}
test.each([
  { pendingEntries: [] },
  { pendingEntries: [{ path: "/notes.md", content_sha256: "a".repeat(64) }] },
])("reuses the same pending local Store declaration with marker %p", ({ pendingEntries }) => {
  expect(selection(true, pendingEntries)).toEqual({ key: "notes", reusedPending: true });
});
test("does not adopt a completed Store solely because its display name matches", () => {
  expect(selection(false, [])).toEqual({ key: "notes-2", reusedPending: false });
});
test("does not reuse a pending Store with a changed declaration", () => {
  expect(selection(true, [], { ...declaration, description: "Changed notes" })).toEqual({
    key: "notes-2",
    reusedPending: false,
  });
});
test("reuses a pending Store when declaration object order differs", () => {
  expect(
    selection(true, [], {
      entries: [{ content: "Initial notes", key: "notes.md" }],
      provider: "bailian",
      metadata: {},
      description: "",
      name: "Notes",
    }),
  ).toEqual({ key: "notes", reusedPending: true });
});
