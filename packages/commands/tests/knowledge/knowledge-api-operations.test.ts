import { expect, test, vi } from "vite-plus/test";
import {
  ragEndpoint,
  RAG_PATHS,
  knowledgeSearchEndpoint,
  type Client,
  type LocalizedText,
} from "bailian-cli-core";
import {
  createKnowledgeService,
  getKnowledgeService,
  updateKnowledgeService,
} from "../../src/commands/knowledge/operations/service.ts";
import { searchKnowledge } from "../../src/commands/knowledge/operations/search.ts";
import {
  createKnowledgeIndex,
  importKnowledgeFiles,
} from "../../src/commands/knowledge/operations/index.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);

test("service operations preserve names, beta version and whole configuration", async () => {
  const response = { data: { agent_id: "agent-1" } };
  const requestJson = vi.fn().mockResolvedValue(response);
  const client = { requestJson } as unknown as Client;
  const config = {
    kb_search_configs: [{ id: "index-1", enable_reranking: false }],
    custom: "preserved",
  };
  const createBody = { agent_name: "demo", agent_scene: "search", agent_config: config };
  expect(await createKnowledgeService(client, "ws-test", createBody)).toBe(response);
  expect(await getKnowledgeService(client, "ws-test", "agent-1", "beta")).toBe(response);
  const updateBody = { agent_id: "agent-1", agent_version: "beta", agent_config: config };
  expect(await updateKnowledgeService(client, "ws-test", updateBody)).toBe(response);
  expect(requestJson.mock.calls.map(([request]) => request)).toEqual([
    { path: ragEndpoint("ws-test", RAG_PATHS.agentCreate), method: "POST", body: createBody },
    {
      path: ragEndpoint("ws-test", RAG_PATHS.agentGet),
      method: "POST",
      body: { agent_id: "agent-1", agent_version: "beta" },
    },
    { path: ragEndpoint("ws-test", RAG_PATHS.agentUpdate), method: "POST", body: updateBody },
  ]);
});

test("search returns the raw envelope and forwards beta and online filters", async () => {
  const response = { data: { nodes: [{ text: "sample", score: 0.9 }] } };
  const requestJson = vi.fn().mockResolvedValue(response);
  const body = {
    agent_id: "agent-1",
    agent_version: "beta",
    query: "sample?",
    kb_search_configs: [{ id: "index-1", search_filters: [] }],
  };
  expect(await searchKnowledge({ requestJson } as unknown as Client, "ws-test", body)).toBe(
    response,
  );
  expect(requestJson).toHaveBeenCalledExactlyOnceWith({
    path: knowledgeSearchEndpoint("ws-test"),
    method: "POST",
    body,
  });
});

test("index creation preserves its payload and file import always specifies the narrow source", async () => {
  const response = { data: { pipelineId: "index-1", ingestionId: "job-1" } };
  const requestJson = vi.fn().mockResolvedValue(response);
  const client = { requestJson } as unknown as Client;
  const body = {
    name: "demo",
    description: "sample",
    docIds: ["file-1"],
    sourceType: "DATA_CENTER_FILE",
  };
  expect(await createKnowledgeIndex(client, "ws-test", body)).toBe(response);
  await importKnowledgeFiles(client, "ws-test", "index-1", ["file-1", "file-2"], localize);
  expect(requestJson.mock.calls.map(([request]) => request)).toEqual([
    { path: ragEndpoint("ws-test", RAG_PATHS.indexCreateV2), method: "POST", body },
    {
      path: ragEndpoint("ws-test", RAG_PATHS.indexJobCreate),
      method: "POST",
      body: { indexId: "index-1", sourceType: "DATA_CENTER_FILE", docIds: ["file-1", "file-2"] },
    },
  ]);
});

test.each([[], [""], ["  "]].map((fileIds) => ({ fileIds })))(
  "empty file selection cannot accidentally broaden the import scope %#",
  async ({ fileIds }) => {
    const requestJson = vi.fn().mockResolvedValue({});
    await expect(
      importKnowledgeFiles(
        { requestJson } as unknown as Client,
        "ws-test",
        "index-1",
        fileIds,
        localize,
      ),
    ).rejects.toMatchObject({ exitCode: 2 });
    expect(requestJson).not.toHaveBeenCalled();
  },
);

test("operation failures remain the original server error with no retries", async () => {
  const failure = new Error("raw service failure");
  const requestJson = vi.fn().mockRejectedValue(failure);
  await expect(
    createKnowledgeService({ requestJson } as unknown as Client, "ws-test", {
      agent_name: "demo",
      agent_scene: "search",
    }),
  ).rejects.toBe(failure);
  expect(requestJson).toHaveBeenCalledTimes(1);
});
