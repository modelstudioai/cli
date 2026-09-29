import { expect, test } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import { parseInitState } from "../../src/commands/knowledge/init-state.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const target = { endpointOrigin: "https://example.com", workspaceId: "workspace-1" };
const state = {
  schemaVersion: 1,
  target,
  name: "demo",
  operationId: "operation-1",
  phase: "prepared",
};

test("missing checkpoint represents a first execution", () => {
  expect(parseInitState(undefined, target, "demo", localize)).toBeUndefined();
});

test("valid checkpoints retain pending operations and resource IDs", () => {
  const checkpoint = {
    ...state,
    phase: "indexed",
    fileId: "file-1",
    indexId: "index-1",
    pending: { action: "create-service", startedAt: "2026-09-29T00:00:00Z" },
  };
  expect(parseInitState(checkpoint, target, "demo", localize)).toEqual(checkpoint);
});

test.each([
  null,
  [],
  {},
  { ...state, schemaVersion: 2 },
  { ...state, phase: "unknown" },
  { ...state, operationId: "" },
  { ...state, phase: "uploaded" },
  { ...state, phase: "indexed", fileId: "file-1" },
  { ...state, phase: "verified", fileId: "file-1", indexId: "index-1" },
  { ...state, pending: { action: "erase", startedAt: "2026-09-29T00:00:00Z" } },
  { ...state, pending: { action: "upload", startedAt: "invalid" } },
  { ...state, fileId: 42 },
  { ...state, apiKey: "secret" },
])("rejects malformed or incompatible checkpoint %#", (checkpoint) => {
  expect(() => parseInitState(checkpoint, target, "demo", localize)).toThrow();
});

test.each([
  { ...target, workspaceId: "workspace-2" },
  { ...target, endpointOrigin: "https://another.example.com" },
])("rejects checkpoint from a different target %#", (otherTarget) => {
  expect(() => parseInitState(state, otherTarget, "demo", localize)).toThrow(/target/);
});

test("changing the requested name cannot silently reuse the old checkpoint", () => {
  expect(() => parseInitState(state, target, "other-name", localize)).toThrow(/name/);
});
