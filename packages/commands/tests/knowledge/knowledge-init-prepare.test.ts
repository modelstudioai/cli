import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { ragEndpoint, RAG_PATHS, type Client, type LocalizedText } from "bailian-cli-core";
import { prepareKnowledgeInit, initOwnership } from "../../src/commands/knowledge/init-prepare.ts";
import { INIT_SAMPLE } from "../../src/commands/knowledge/init-sample.ts";
import { writeStateFile } from "../../src/commands/knowledge/state-store.ts";

const directories: string[] = [];
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const target = {
  workspaceId: "ws-test",
  endpointOrigin: new URL(ragEndpoint("ws-test", RAG_PATHS.indexList)).origin,
};
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "init-prepare-"));
  directories.push(directory);
  const stateFile = join(directory, ".bailian", "init.json");
  const ownership = initOwnership(target, "demo");
  const inventories = {
    indexes: [] as Array<Record<string, unknown>>,
    services: [] as Array<Record<string, unknown>>,
    documents: [
      {
        doc_id: "file-1",
        ingestion_id: "job-1",
        tags: [ownership.marker, "BAILIAN_CLI_INIT_SAMPLE_V1"],
      },
    ],
    file: {
      fileId: "file-1",
      tags: [ownership.marker, "BAILIAN_CLI_INIT_SAMPLE_V1"],
      md5: createHash("md5").update(INIT_SAMPLE.content).digest("hex"),
    },
    service: {
      agent_id: "agent-1",
      agent_name: ownership.serviceName,
      agent_scene: "search",
      agent_desc: ownership.marker,
      agent_details: [
        { agent_version: "beta", agent_config: { kb_search_configs: [{ id: "index-1" }] } },
      ],
    },
  };
  const requestJson = vi.fn(async (request) => {
    const path = new URL(request.path).pathname;
    if (path === RAG_PATHS.indexList)
      return { data: { rows: inventories.indexes, total_count: inventories.indexes.length } };
    if (path === RAG_PATHS.agentList)
      return { data: { rows: inventories.services, total_count: inventories.services.length } };
    if (path === RAG_PATHS.indexFileDetails)
      return { data: { rows: inventories.documents, total_count: inventories.documents.length } };
    if (path === RAG_PATHS.describeFile) return { data: inventories.file };
    if (path === RAG_PATHS.agentGet) return { data: inventories.service };
    throw new Error(`unexpected mutation or request: ${path}`);
  });
  const options = {
    client: { requestJson } as unknown as Client,
    workspaceId: target.workspaceId,
    name: "demo",
    stateFile,
    localize,
  };
  const state = {
    schemaVersion: 1,
    target,
    name: "demo",
    operationId: ownership.operationId,
    phase: "verified",
    fileId: "file-1",
    indexId: "index-1",
    agentId: "agent-1",
    ingestionId: "job-1",
  };
  const populate = () => {
    inventories.indexes.push({
      id: "index-1",
      name: "demo",
      description: ownership.marker,
      knowledgeType: "document",
    });
    inventories.services.push({ agent_id: "agent-1", agent_name: ownership.serviceName });
  };
  return { directory, options, inventories, ownership, requestJson, state, populate };
}

test("first prepare plans creation with billing risk without writing local or remote state", async () => {
  const { directory, options, requestJson } = await fixture();
  const prepared = await prepareKnowledgeInit(options);
  expect(prepared.risk).toMatchObject({ level: "high", reason: "billing" });
  expect(prepared.notices[0]?.code).toBe("KNOWLEDGE_BILLING");
  expect(prepared.data.state.phase).toBe("prepared");
  expect(prepared.data.state.indexId).toBeUndefined();
  expect(prepared.preview.steps).toContainEqual(
    expect.objectContaining({ action: "create-index" }),
  );
  expect(await readdir(directory)).toEqual([]);
  expect(requestJson).toHaveBeenCalledTimes(2);
});

test("verified resource ownership permits reuse without new billing confirmation", async () => {
  const { options, state, populate } = await fixture();
  populate();
  await writeStateFile(options.stateFile, state);
  const prepared = await prepareKnowledgeInit(options);
  expect(prepared.risk).toBeNull();
  expect(prepared.data.state).toEqual(state);
  expect(prepared.preview.steps.map((step) => step.action)).not.toContain("create-index");
});

test("missing local state recovers only with index marker, sample identity and service binding", async () => {
  const { options, populate, directory } = await fixture();
  populate();
  const prepared = await prepareKnowledgeInit(options);
  expect(prepared.risk).toBeNull();
  expect(prepared.data.state).toMatchObject({
    fileId: "file-1",
    indexId: "index-1",
    agentId: "agent-1",
    phase: "service-ready",
  });
  expect(await readdir(directory)).toEqual([]);
});

test("ownership tags respect the 32-character API limit", () => {
  expect(initOwnership(target, "demo").marker.length).toBeLessThanOrEqual(32);
});

test("reuse does not depend on an optional remote MD5 field", async () => {
  const { options, inventories, populate } = await fixture();
  populate();
  Reflect.deleteProperty(inventories.file, "md5");
  expect((await prepareKnowledgeInit(options)).risk).toBeNull();
});

test.each([
  "unmarked-index",
  "wrong-sample",
  "wrong-binding",
  "unmarked-service",
  "missing-known-index",
  "duplicate-sample",
])("unsafe reuse is rejected: %s", async (scenario) => {
  const { options, inventories, state, populate } = await fixture();
  populate();
  await writeStateFile(options.stateFile, state);
  if (scenario === "unmarked-index") inventories.indexes[0]!.description = "user documents";
  if (scenario === "wrong-sample") inventories.file.tags = ["another-sample"];
  if (scenario === "wrong-binding")
    inventories.service.agent_details[0]!.agent_config.kb_search_configs[0]!.id = "other-index";
  if (scenario === "unmarked-service") inventories.service.agent_desc = "user service";
  if (scenario === "missing-known-index") inventories.indexes = [];
  if (scenario === "duplicate-sample")
    inventories.documents.push({ ...inventories.documents[0]!, doc_id: "file-2" });
  await expect(prepareKnowledgeInit(options)).rejects.toMatchObject({ exitCode: 1 });
});

test("an uncertain create request cannot be retried merely because its resource is not listed", async () => {
  const { options, state } = await fixture();
  await writeStateFile(options.stateFile, {
    ...state,
    phase: "uploaded",
    indexId: undefined,
    agentId: undefined,
    ingestionId: undefined,
    pending: { action: "create-index", startedAt: "2026-09-29T00:00:00Z" },
  });
  await expect(prepareKnowledgeInit(options)).rejects.toThrow(/uncertain/);
});

test("same service name conflicts even when the knowledge base has not been created", async () => {
  const { options, inventories, ownership } = await fixture();
  inventories.services.push({ agent_id: "user-agent", agent_name: ownership.serviceName });
  await expect(prepareKnowledgeInit(options)).rejects.toMatchObject({ exitCode: 1 });
});
