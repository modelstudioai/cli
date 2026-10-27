/** Subprocess-only fake backend. Every fetch is intercepted; no network fallback. */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RAG_PATHS } from "bailian-cli-core";
import { createCli } from "bailian-cli-runtime";
import init from "../../src/commands/knowledge/init.ts";
import deleteIndex from "../../src/commands/knowledge/kb-delete.ts";
import deleteService from "../../src/commands/knowledge/service-delete.ts";
import deleteFile from "../../src/commands/knowledge/file-delete.ts";
import search from "../../src/commands/knowledge/search.ts";
import { INIT_SAMPLE } from "../../src/commands/knowledge/init-sample.ts";

const directory = process.env.INIT_TEST_DIRECTORY;
if (!directory) throw new Error("INIT_TEST_DIRECTORY required");
const remoteFile = join(directory, "fake-remote.json");
interface Remote {
  indexes: Record<string, unknown>[];
  services: Record<string, unknown>[];
  file?: { fileId: string; tags: string[] };
  config?: Record<string, unknown>;
  name?: string;
  description?: string;
}
const remote: Remote = existsSync(remoteFile)
  ? JSON.parse(readFileSync(remoteFile, "utf8"))
  : { indexes: [], services: [] };
const response = (data: unknown) => Response.json({ data });
globalThis.fetch = async (input, options) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const path = url.pathname;
  appendFileSync(
    join(directory, "requests.jsonl"),
    `${JSON.stringify({ path, method: options?.method ?? "GET" })}\n`,
  );
  const body = typeof options?.body === "string" ? JSON.parse(options.body) : {};
  let result: Response;
  if (path === RAG_PATHS.indexList)
    return response({ rows: remote.indexes, total_count: remote.indexes.length });
  if (path === RAG_PATHS.agentList)
    return response({ rows: remote.services, total_count: remote.services.length });
  if (path === RAG_PATHS.applyFileUploadLease)
    return response({
      leaseId: "lease-test",
      param: { url: "https://upload.invalid/fixture-upload" },
    });
  if (path === "/fixture-upload") {
    if (new Headers(options?.headers).has("Authorization"))
      throw new Error("API credential leaked to upload");
    const uploaded = await new Response(options?.body).text();
    if (uploaded !== INIT_SAMPLE.content) throw new Error("Unexpected sample content");
    return new Response("", { status: 200 });
  }
  if (path === RAG_PATHS.addFile) {
    remote.file = { fileId: "file-test", tags: body.tags };
    result = response({ fileId: "file-test" });
  } else if (path === RAG_PATHS.describeFile) {
    return response(remote.file);
  } else if (path === RAG_PATHS.indexCreateV2) {
    remote.indexes.push({
      id: "index-test",
      name: body.name,
      description: body.description,
      knowledgeType: "document",
    });
    result = response({ pipelineId: "index-test", ingestionId: "job-test" });
  } else if (path === RAG_PATHS.indexJobStatus) {
    return response({
      ingestion_status: "COMPLETED",
      total_count: 1,
      rows: [{ doc_id: "file-test", code: "FINISH" }],
    });
  } else if (path === RAG_PATHS.indexFileDetails) {
    return response({
      total_count: 1,
      rows: [
        {
          doc_id: "file-test",
          status: "FINISH",
          ingestion_id: "job-test",
          tags: remote.file?.tags,
        },
      ],
    });
  } else if (path === RAG_PATHS.agentCreate) {
    if (process.env.INIT_TEST_FAILURE === "service")
      return Response.json({ message: "original service creation failure" }, { status: 400 });
    remote.config = body.agent_config;
    remote.name = body.agent_name;
    remote.description = body.agent_desc;
    remote.services.push({ agent_id: "agent-test", agent_name: body.agent_name });
    result = response({ agent_id: "agent-test" });
  } else if (path === RAG_PATHS.agentGet) {
    return response({
      agent_id: "agent-test",
      agent_scene: "search",
      agent_name: remote.name,
      agent_desc: remote.description,
      agent_details: [{ agent_version: "beta", agent_config: remote.config }],
    });
  } else if (path === RAG_PATHS.agentUpdate) {
    remote.config = body.agent_config;
    result = response({ agent_id: "agent-test" });
  } else if (path === "/api/v1/indices/knowledge/search") {
    if (body.agent_version !== "beta") throw new Error("Expected beta retrieval");
    return response({ nodes: [{ text: INIT_SAMPLE.content, score: 0.9 }] });
  } else {
    throw new Error(`Unexpected request blocked: ${path}`);
  }
  writeFileSync(remoteFile, JSON.stringify(remote));
  return result;
};

void createCli(
  {
    "knowledge init": init,
    "knowledge delete": deleteIndex,
    "knowledge service delete": deleteService,
    "knowledge file delete": deleteFile,
    "knowledge search": search,
  },
  { binName: "bl", version: "0.0.0-test", npmPackage: "bailian-cli", clientName: "init-test" },
).run();
