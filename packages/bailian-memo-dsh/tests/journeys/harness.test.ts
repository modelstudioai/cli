import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { MemoryClient } from "../../src/memory-client.ts";
import { CloudHarness } from "./harness.ts";

afterEach(() => vi.unstubAllGlobals());

it("deletes nodes known from terminal event results even when list is empty", async () => {
  const harness = new CloudHarness();
  const deleteNode = vi.fn(async () => ({}));
  harness.client = {
    getEvent: async () => ({
      events: [
        { status: "SUCCEEDED", result: [{ event: "ADD", memory_node_id: "synthetic-node" }] },
      ],
    }),
    deleteNode,
  } as unknown as MemoryClient;
  vi.spyOn(harness, "nodes").mockResolvedValue([]);
  await harness.settle("event");
  await harness.clearNodes();
  expect(deleteNode).toHaveBeenCalledExactlyOnceWith("synthetic-node");
});

it("records schema creation intent before transport and reports lost receipt as incomplete cleanup", async () => {
  const harness = new CloudHarness();
  harness.home = await mkdtemp(join(tmpdir(), "memo-cleanup-test-"));
  const schemaName = "journey_ambiguous_test";
  let intentRecordedBeforeFetch = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      intentRecordedBeforeFetch =
        (harness as unknown as { pendingSchemaNames?: Set<string> }).pendingSchemaNames?.has(
          schemaName,
        ) === true;
      throw new Error("lost receipt");
    }),
  );
  try {
    await expect(harness.request("POST", "profile_schemas", { name: schemaName })).rejects.toThrow(
      "lost receipt",
    );
    expect(intentRecordedBeforeFetch).toBe(true);
    await expect(harness.finish("harness-ambiguous-schema", false)).rejects.toThrow(
      /schema creation receipt/,
    );
  } finally {
    await rm(harness.home, { recursive: true, force: true });
  }
});

it("tracks a successful schema receipt before returning it to the caller", async () => {
  const harness = new CloudHarness();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ profile_schema_id: "synthetic-schema" })),
  );
  await harness.request("POST", "profile_schemas", { name: "journey_known_schema" });
  expect(harness.pendingSchemaNames.size).toBe(0);
  expect(harness.schemas.has("synthetic-schema")).toBe(true);
});

it("treats a known node's 404 as already deleted, while keeping other failures actionable", async () => {
  const harness = new CloudHarness();
  harness.knownNodes.add("synthetic-node");
  harness.client = {
    deleteNode: async () => {
      throw Object.assign(new Error("not found"), { status: 404 });
    },
  } as unknown as MemoryClient;
  vi.spyOn(harness, "nodes").mockResolvedValue([]);
  await harness.clearNodes();
  expect(harness.deletedNodes.has("synthetic-node")).toBe(true);
  harness.knownNodes.add("another-node");
  harness.client = {
    deleteNode: async () => {
      throw Object.assign(new Error("unavailable"), { status: 503 });
    },
  } as unknown as MemoryClient;
  await expect(harness.clearNodes()).rejects.toThrow("unavailable");
  expect(harness.deletedNodes.has("another-node")).toBe(false);
});
