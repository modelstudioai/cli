import { createHash } from "node:crypto";
import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type LocalizedText,
  type RagDescribeFileResponse,
} from "bailian-cli-core";
import { knowledgeBillingNotice, knowledgeCreationRisk } from "./billing.ts";
import { parseInitState, type InitState, type InitTarget } from "./init-state.ts";
import { readStateFile } from "./state-store.ts";
import {
  listKnowledgeDocuments,
  listKnowledgeIndexes,
  listKnowledgeServices,
} from "./operations/list.ts";
import { getKnowledgeService } from "./operations/service.ts";

export interface InitOptions {
  client: Client;
  workspaceId: string;
  name: string;
  stateFile: string;
  localize: (text: LocalizedText) => string;
}

export interface InitPrepared {
  state: InitState;
  snapshot: string | undefined;
  stateFile: string;
  ownership: ReturnType<typeof initOwnership>;
}

export function initOwnership(target: InitTarget, name: string, operationId?: string) {
  const stableId =
    operationId ??
    createHash("sha256")
      .update(
        JSON.stringify([
          target.endpointOrigin,
          target.workspaceId,
          name,
          "BAILIAN_CLI_INIT_SAMPLE_V1",
        ]),
      )
      .digest("hex")
      .slice(0, 24);
  return {
    operationId: stableId,
    marker: `i${createHash("sha256").update(stableId).digest("hex").slice(0, 31)}`,
    serviceName: `${name}-retrieval`,
  };
}

/** Only reads local state and cloud resources; never persists recovered IDs here. */
export async function prepareKnowledgeInit(options: InitOptions) {
  const { client, workspaceId, name, stateFile, localize } = options;
  const target = {
    workspaceId,
    endpointOrigin: new URL(ragEndpoint(workspaceId, RAG_PATHS.indexList)).origin,
  };
  const rawState = await readStateFile(stateFile, localize);
  const saved = parseInitState(rawState, target, name, localize);
  const ownership = initOwnership(target, name, saved?.operationId);
  const state: InitState = saved
    ? structuredClone(saved)
    : {
        schemaVersion: 1,
        target,
        name,
        operationId: ownership.operationId,
        phase: "prepared",
      };
  const conflict = () =>
    new BailianError(
      localize({
        "en-US":
          "Initialization resource ownership could not be verified. Check the saved IDs, sample and service binding; use a different name and state file for an independent setup.",
        "zh-CN":
          "无法确认初始化资源的归属。请核对记录中的 ID、样例文件与服务绑定；如需独立初始化，请使用其他名称和状态文件。",
      }),
      ExitCode.GENERAL,
    );
  const uncertain = () =>
    new BailianError(
      localize({
        "en-US":
          "A previous resource creation has an uncertain result. Reconcile the existing resources before retrying; initialization will not repeat that request.",
        "zh-CN": "上次资源创建结果不确定。请先核对已有资源；初始化不会直接重复该请求。",
      }),
      ExitCode.GENERAL,
    );
  const [indexes, services] = await Promise.all([
    listKnowledgeIndexes(client, workspaceId, localize),
    listKnowledgeServices(client, workspaceId, localize),
  ]);
  const namedIndexes = indexes.filter((index) => index.name === name);
  if (namedIndexes.length > 1) throw conflict();
  const index = state.indexId
    ? indexes.find((entry) => entry.id === state.indexId)
    : namedIndexes[0];
  if (state.indexId && !index) throw conflict();
  if (
    index &&
    (index.name !== name ||
      index.description !== ownership.marker ||
      (index.knowledgeType != null && index.knowledgeType !== "document"))
  )
    throw conflict();
  if (!index && state.pending?.action === "create-index") throw uncertain();

  if (index) {
    const documents = await listKnowledgeDocuments(client, workspaceId, index.id, localize);
    const samples = documents.filter(
      (document) =>
        Array.isArray(document.tags) &&
        document.tags.includes(ownership.marker) &&
        document.tags.includes("BAILIAN_CLI_INIT_SAMPLE_V1"),
    );
    if (samples.length !== 1) throw conflict();
    const sample = samples[0]!;
    // Initial create imports use the data-center ID. Never strip suffixes or
    // infer a mapping by filename; verify this exact ID with describeFile below.
    if (state.fileId && state.fileId !== sample.doc_id) throw conflict();
    state.fileId = sample.doc_id;
    state.indexId = index.id;
    if (!state.ingestionId && typeof sample.ingestion_id === "string" && sample.ingestion_id)
      state.ingestionId = sample.ingestion_id;
  }
  if (state.fileId) {
    const response = await client.requestJson<RagDescribeFileResponse>({
      path: ragEndpoint(workspaceId, RAG_PATHS.describeFile),
      method: "POST",
      body: { fileId: state.fileId },
    });
    const file = response.data;
    if (
      file?.fileId !== state.fileId ||
      !Array.isArray(file.tags) ||
      !file.tags.includes(ownership.marker) ||
      !file.tags.includes("BAILIAN_CLI_INIT_SAMPLE_V1")
    )
      throw conflict();
  } else if (state.pending?.action === "upload") throw uncertain();

  const namedServices = services.filter((service) => service.agent_name === ownership.serviceName);
  if (namedServices.length > 1) throw conflict();
  const service = state.agentId
    ? services.find((entry) => entry.agent_id === state.agentId)
    : namedServices[0];
  if (state.agentId && !service) throw conflict();
  if (service) {
    if (!state.indexId || service.agent_name !== ownership.serviceName || !service.agent_id)
      throw conflict();
    const response = await getKnowledgeService(client, workspaceId, service.agent_id, "beta");
    const detail = response.data;
    const drafts = detail?.agent_details?.filter((entry) => entry.agent_version === "beta") ?? [];
    const bindings =
      drafts[0]?.agent_config?.kb_search_configs?.filter((entry) => entry.id === state.indexId) ??
      [];
    if (
      detail?.agent_id !== service.agent_id ||
      detail.agent_name !== ownership.serviceName ||
      detail.agent_desc !== ownership.marker ||
      detail.agent_scene !== "search" ||
      detail.agent_status === "deleted" ||
      drafts.length !== 1 ||
      bindings.length !== 1
    )
      throw conflict();
    state.agentId = service.agent_id;
  } else if (state.pending?.action === "create-service") throw uncertain();

  delete state.pending;
  state.phase = state.agentId
    ? saved?.phase === "verified"
      ? "verified"
      : "service-ready"
    : state.indexId
      ? "indexed"
      : state.fileId
        ? "uploaded"
        : "prepared";
  const steps: Array<{ action: string; resource?: unknown }> = [];
  if (!state.fileId) steps.push({ action: "upload-sample" });
  if (!state.indexId)
    steps.push({
      action: "create-index",
      resource: { fromStep: "create-index", field: "pipelineId" },
    });
  else steps.push({ action: "reuse-index", resource: state.indexId });
  steps.push({ action: "wait-import" });
  if (!state.agentId)
    steps.push({
      action: "create-service",
      resource: { fromStep: "create-service", field: "agent_id" },
    });
  else steps.push({ action: "reuse-service", resource: state.agentId });
  steps.push({ action: "complete-retrieval-config" }, { action: "verify-sample" });
  const data: InitPrepared = { state, snapshot: JSON.stringify(rawState), stateFile, ownership };
  return {
    data,
    preview: { target, name, stateFile, steps },
    risk: state.indexId ? null : knowledgeCreationRisk,
    notices: [knowledgeBillingNotice],
  };
}
