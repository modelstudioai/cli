import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  RAG_PATHS,
  BailianError,
  ExitCode,
  type Client,
  type LocalizedText,
  type Settings,
} from "bailian-cli-core";
import { prepareKnowledgeInit } from "../../src/commands/knowledge/init-prepare.ts";
import { runKnowledgeInit } from "../../src/commands/knowledge/init-workflow.ts";
import { INIT_SAMPLE } from "../../src/commands/knowledge/init-sample.ts";
import * as stateStore from "../../src/commands/knowledge/state-store.ts";
import * as transfer from "../../src/commands/knowledge/upload-stream.ts";

const directories: string[] = [];
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "init-workflow-"));
  directories.push(directory);
  const stateFile = join(directory, "init.json");
  const remote = {
    indexes: [] as Array<Record<string, unknown>>,
    services: [] as Array<Record<string, unknown>>,
    file: undefined as Record<string, unknown> | undefined,
    config: {} as Record<string, unknown>,
    description: "",
    serviceName: "",
    importFailure: false,
    expiredImportJob: false,
    serviceFailure: undefined as Error | undefined,
    searchFailure: undefined as Error | undefined,
    emptySearch: false,
    emptySearchesRemaining: 0,
    searchCount: 0,
    unknownIndexResult: false,
  };
  const calls: string[] = [];
  vi.spyOn(transfer, "putFileStream").mockResolvedValue(new Response("", { status: 200 }));
  const requestJson = vi.fn(async (request) => {
    const path = new URL(request.path).pathname;
    calls.push(path);
    const body = request.body ?? {};
    if (path === RAG_PATHS.indexList)
      return { data: { rows: remote.indexes, total_count: remote.indexes.length } };
    if (path === RAG_PATHS.agentList)
      return { data: { rows: remote.services, total_count: remote.services.length } };
    if (path === RAG_PATHS.applyFileUploadLease)
      return { data: { leaseId: "lease-1", param: { url: "https://example.com/upload" } } };
    if (path === RAG_PATHS.addFile) {
      remote.file = {
        fileId: "file-1",
        tags: body.tags,
        md5: createHash("md5").update(INIT_SAMPLE.content).digest("hex"),
      };
      return { data: { fileId: "file-1" } };
    }
    if (path === RAG_PATHS.describeFile) return { data: remote.file };
    if (path === RAG_PATHS.indexCreateV2) {
      if (remote.unknownIndexResult) throw new Error("connection lost before response");
      remote.indexes.push({
        id: "index-1",
        name: body.name,
        description: body.description,
        knowledgeType: "document",
      });
      return { data: { pipelineId: "index-1", ingestionId: "job-1" } };
    }
    if (path === RAG_PATHS.indexJobStatus && remote.expiredImportJob)
      throw new Error("old import job expired");
    if (path === RAG_PATHS.indexJobStatus)
      return {
        data: {
          ingestion_status: "COMPLETED",
          total_count: 1,
          rows: [
            {
              doc_id: "file-1",
              code: remote.importFailure ? "PARSE_FAILED" : "FINISH",
              ...(remote.importFailure ? { message: "raw parser failure" } : {}),
            },
          ],
        },
      };
    if (path === RAG_PATHS.indexFileDetails)
      return {
        data: {
          total_count: 1,
          rows: [
            { doc_id: "file-1", status: "FINISH", ingestion_id: "job-1", tags: remote.file?.tags },
          ],
        },
      };
    if (path === RAG_PATHS.agentCreate) {
      if (remote.serviceFailure) throw remote.serviceFailure;
      remote.config = body.agent_config;
      remote.description = body.agent_desc;
      remote.serviceName = body.agent_name;
      remote.services.push({ agent_id: "agent-1", agent_name: body.agent_name });
      return { data: { agent_id: "agent-1" } };
    }
    if (path === RAG_PATHS.agentGet)
      return {
        data: {
          agent_id: "agent-1",
          agent_scene: "search",
          agent_name: remote.serviceName,
          agent_desc: remote.description,
          agent_details: [{ agent_version: "beta", agent_config: remote.config }],
        },
      };
    if (path === RAG_PATHS.agentUpdate) {
      remote.config = body.agent_config;
      return { data: { agent_id: "agent-1" } };
    }
    if (body.query !== undefined) {
      if (remote.searchFailure) throw remote.searchFailure;
      expect(body.agent_version).toBe("beta");
      remote.searchCount += 1;
      if (remote.emptySearchesRemaining-- > 0)
        return { request_id: "not-ready", data: { nodes: [] } };
      return {
        request_id: "search-request-1",
        data: { nodes: remote.emptySearch ? [] : [{ text: INIT_SAMPLE.content, score: 0.9 }] },
      };
    }
    throw new Error(`unexpected API: ${path}`);
  });
  const options = {
    client: { requestJson } as unknown as Client,
    workspaceId: "ws-test",
    name: "demo",
    stateFile,
    localize,
  };
  const report = vi.fn();
  const execute = async () => {
    const preparation = await prepareKnowledgeInit(options);
    return runKnowledgeInit({
      ...options,
      prepared: preparation.data,
      settings: { timeout: 0.2, quiet: true } as Settings,
      pollInterval: 0.005,
      report,
    });
  };
  return { options, remote, calls, report, execute, requestJson };
}

test("first execution creates and verifies resources; second execution performs no creation or update", async () => {
  const { execute, calls, options, report, requestJson } = await fixture();
  const first = await execute();
  expect(first).toMatchObject({
    indexId: "index-1",
    fileId: "file-1",
    agentId: "agent-1",
    agentVersion: "beta",
    sampleMatched: true,
    sampleSearch: {
      query: INIT_SAMPLE.query,
      response: {
        request_id: "search-request-1",
        data: { nodes: [{ text: INIT_SAMPLE.content, score: 0.9 }] },
      },
    },
  });
  expect(await stateStore.readStateFile(options.stateFile, localize)).toMatchObject({
    phase: "verified",
    fileId: "file-1",
    indexId: "index-1",
    agentId: "agent-1",
  });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "knowledge-base", id: "index-1", created: true }),
  );
  expect(
    requestJson.mock.calls.filter(([request]) => request.body?.query !== undefined),
  ).toHaveLength(1);
  const previousLength = calls.length;
  expect(await execute()).toMatchObject({
    indexId: first.indexId,
    agentId: first.agentId,
    sampleMatched: true,
  });
  expect(
    requestJson.mock.calls.filter(([request]) => request.body?.query !== undefined),
  ).toHaveLength(2);
  expect(calls.slice(previousLength)).not.toEqual(
    expect.arrayContaining([RAG_PATHS.indexCreateV2]),
  );
  for (const endpoint of [
    RAG_PATHS.applyFileUploadLease,
    RAG_PATHS.addFile,
    RAG_PATHS.indexCreateV2,
    RAG_PATHS.agentCreate,
    RAG_PATHS.agentUpdate,
  ])
    expect(calls.filter((path) => path === endpoint)).toHaveLength(1);
});

test("verified initialization can be reused after the original import job expires", async () => {
  const { execute, remote } = await fixture();
  await execute();
  remote.expiredImportJob = true;
  expect(await execute()).toMatchObject({ sampleMatched: true, indexId: "index-1" });
});

test("document import failure preserves the created knowledge base and prevents service creation", async () => {
  const { execute, remote, calls, options, report } = await fixture();
  remote.importFailure = true;
  await expect(execute()).rejects.toMatchObject({ message: "raw parser failure", exitCode: 1 });
  expect(calls).not.toContain(RAG_PATHS.agentCreate);
  expect(await stateStore.readStateFile(options.stateFile, localize)).toMatchObject({
    indexId: "index-1",
    phase: "indexed",
  });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "knowledge-base", id: "index-1" }),
  );
});

test("service failure keeps the original error and an uncertain checkpoint; rerun does not create again", async () => {
  const { execute, remote, options, calls } = await fixture();
  const failure = new BailianError("raw create denied", ExitCode.GENERAL);
  remote.serviceFailure = failure;
  await expect(execute()).rejects.toBe(failure);
  expect(await stateStore.readStateFile(options.stateFile, localize)).toMatchObject({
    indexId: "index-1",
    pending: { action: "create-service" },
  });
  await expect(execute()).rejects.toThrow(/uncertain/);
  expect(calls.filter((path) => path === RAG_PATHS.agentCreate)).toHaveLength(1);
});

test("unknown knowledge base creation outcome is never retried automatically", async () => {
  const { execute, remote, options, calls } = await fixture();
  remote.unknownIndexResult = true;
  await expect(execute()).rejects.toThrow("connection lost before response");
  expect(await stateStore.readStateFile(options.stateFile, localize)).toMatchObject({
    pending: { action: "create-index" },
    fileId: "file-1",
  });
  await expect(execute()).rejects.toThrow(/uncertain/);
  expect(calls.filter((path) => path === RAG_PATHS.indexCreateV2)).toHaveLength(1);
});

test("empty search results time out without declaring success", async () => {
  const { execute, remote, options } = await fixture();
  remote.emptySearch = true;
  await expect(execute()).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
  expect(await stateStore.readStateFile(options.stateFile, localize)).toMatchObject({
    phase: "service-ready",
    agentId: "agent-1",
  });
});

test("search API errors are not swallowed as eventual consistency", async () => {
  const { execute, remote } = await fixture();
  const failure = new BailianError("raw search denied", ExitCode.GENERAL);
  remote.searchFailure = failure;
  await expect(execute()).rejects.toBe(failure);
});

test("a failed post-create checkpoint still reports the billable resource and stops further writes", async () => {
  const { execute, report, calls } = await fixture();
  const originalWrite = stateStore.writeStateFile;
  const failure = new Error("disk full");
  vi.spyOn(stateStore, "writeStateFile").mockImplementation(async (path, state) => {
    if ((state as { indexId?: string }).indexId) throw failure;
    await originalWrite(path, state);
  });
  await expect(execute()).rejects.toBe(failure);
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "knowledge-base", id: "index-1" }),
  );
  expect(calls).not.toContain(RAG_PATHS.agentCreate);
});

test("state changes between prepare and execution stop before any cloud mutation", async () => {
  const { options, requestJson } = await fixture();
  const preparation = await prepareKnowledgeInit(options);
  await stateStore.writeStateFile(options.stateFile, preparation.data.state);
  requestJson.mockClear();
  await expect(
    runKnowledgeInit({
      ...options,
      prepared: preparation.data,
      settings: { timeout: 1, quiet: true } as Settings,
      pollInterval: 0.01,
      report: vi.fn(),
    }),
  ).rejects.toThrow(/changed/);
  expect(requestJson).not.toHaveBeenCalled();
});

test("returns the successful polling response without another search and does not persist it", async () => {
  const { execute, remote, options } = await fixture();
  remote.emptySearchesRemaining = 1;
  const result = await execute();
  expect(result.sampleSearch.response.request_id).toBe("search-request-1");
  expect(result.sampleSearch.response.data.nodes[0].text).toBe(INIT_SAMPLE.content);
  expect(remote.searchCount).toBe(2);
  expect(await stateStore.readStateFile(options.stateFile, localize)).not.toHaveProperty(
    "sampleSearch",
  );
});
