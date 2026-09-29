import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BailianError, ExitCode, type Settings } from "bailian-cli-core";
import type { InitOptions, InitPrepared } from "./init-prepare.ts";
import type { InitState } from "./init-state.ts";
import { INIT_SAMPLE, matchesInitSample } from "./init-sample.ts";
import { completeInitRetrievalConfig } from "./init-service-config.ts";
import { readStateFile, withStateLock, writeStateFile } from "./state-store.ts";
import { uploadKnowledgeFile } from "./operations/upload.ts";
import { createKnowledgeIndex } from "./operations/index.ts";
import {
  createKnowledgeService,
  getKnowledgeService,
  updateKnowledgeService,
} from "./operations/service.ts";
import { listKnowledgeDocuments } from "./operations/list.ts";
import { searchKnowledge } from "./operations/search.ts";
import {
  agentMutationField,
  failedImportDocs,
  importJobStatusUrl,
  pollImportJob,
} from "./shared.ts";

export interface InitResource {
  kind: "file" | "knowledge-base" | "service";
  id: string;
  created: boolean;
}

export interface InitRunOptions extends InitOptions {
  prepared: InitPrepared;
  settings: Settings;
  pollInterval: number;
  report: (resource: InitResource) => void;
}

/** Execute only after the runtime has accepted the prepared plan's risk. */
export async function runKnowledgeInit(options: InitRunOptions) {
  const { client, workspaceId, localize, settings, prepared, stateFile, report } = options;
  const startedAt = Date.now();
  return withStateLock(stateFile, localize, async () => {
    if (JSON.stringify(await readStateFile(stateFile, localize)) !== prepared.snapshot) {
      throw new BailianError(
        localize({
          "en-US":
            "Initialization state changed after preview. Run the command again to prepare a fresh plan.",
          "zh-CN": "初始化记录在预览后发生变化。请重新运行命令以生成最新计划。",
        }),
        ExitCode.GENERAL,
      );
    }
    const state: InitState = structuredClone(prepared.state);
    const resources: InitResource[] = [];
    const recordResource = (kind: InitResource["kind"], id: string, created: boolean) => {
      const resource = { kind, id, created };
      resources.push(resource);
      report(resource);
    };
    for (const [kind, id] of [
      ["file", state.fileId],
      ["knowledge-base", state.indexId],
      ["service", state.agentId],
    ] as const) {
      if (id) recordResource(kind, id, false);
    }
    const checkpoint = () => writeStateFile(stateFile, state);
    const begin = async (action: NonNullable<InitState["pending"]>["action"]) => {
      state.pending = { action, startedAt: new Date().toISOString() };
      await checkpoint();
    };
    const invalidResponse = () =>
      new BailianError(
        localize({
          "en-US":
            "Initialization response is missing a required resource ID or binding. The operation may have succeeded; reconcile the saved resources before retrying.",
          "zh-CN":
            "初始化响应缺少必要的资源 ID 或绑定信息。操作可能已经成功；请先核对已记录的资源再重试。",
        }),
        ExitCode.GENERAL,
      );
    await checkpoint();
    if (!state.fileId) {
      const temporaryDirectory = await mkdtemp(join(tmpdir(), "bailian-init-"));
      try {
        const filePath = join(temporaryDirectory, INIT_SAMPLE.filename);
        await writeFile(filePath, INIT_SAMPLE.content, { mode: 0o600 });
        await begin("upload");
        await uploadKnowledgeFile({
          client,
          workspaceId,
          filePath,
          sizeBytes: Buffer.byteLength(INIT_SAMPLE.content),
          categoryId: "default",
          tags: [prepared.ownership.marker, "BAILIAN_CLI_INIT_SAMPLE_V1"],
          timeout: settings.timeout,
          localize,
          checkpoint: async (record) => {
            state.leaseId = record.leaseId;
            if (record.fileId) {
              recordResource("file", record.fileId, true);
              state.fileId = record.fileId;
              state.phase = "uploaded";
              delete state.pending;
            }
            await checkpoint();
          },
        });
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
    if (!state.fileId) throw invalidResponse();
    if (!state.indexId) {
      await begin("create-index");
      const response = await createKnowledgeIndex(client, workspaceId, {
        name: state.name,
        description: prepared.ownership.marker,
        structureType: "unstructured",
        sinkType: "BUILT_IN",
        knowledgeType: "document",
        knowledgeScene: "basic_document_qa",
        embeddingModelName: "text-embedding-v4",
        chunkSize: 600,
        sourceType: "DATA_CENTER_FILE",
        docIds: [state.fileId],
        dataSources: [{ sourceType: "DATA_CENTER_FILE" }],
      });
      const indexId = response.data?.pipelineId;
      if (!indexId) throw invalidResponse();
      recordResource("knowledge-base", indexId, true);
      state.indexId = indexId;
      state.ingestionId = response.data?.ingestionId;
      state.phase = "indexed";
      delete state.pending;
      await checkpoint();
    }

    // A verified owned service was created only after import succeeded. On
    // reuse, verify current retrieval rather than depending on old job retention.
    if (state.ingestionId && !state.agentId) {
      const response = await pollImportJob(client, settings, {
        statusUrl: importJobStatusUrl(workspaceId, state.indexId, state.ingestionId).toString(),
        intervalSec: options.pollInterval,
      });
      const failures = failedImportDocs(response);
      if (failures.length)
        throw new BailianError(
          failures[0]!.message ??
            failures[0]!.code ??
            localize({
              "en-US": "Sample import failed.",
              "zh-CN": "样例导入失败。",
            }),
          ExitCode.GENERAL,
        );
      if (
        !response.data?.rows?.some(
          (row) => row.doc_id === state.fileId && (row.code ?? row.status) === "FINISH",
        )
      )
        throw invalidResponse();
    } else if (!state.agentId) {
      // Recovered resources may not retain the original job ID. Require the
      // exact initial document to reach a verified terminal state instead.
      await waitForSample(async () => {
        const documents = await listKnowledgeDocuments(
          client,
          workspaceId,
          state.indexId!,
          localize,
        );
        const sample = documents.find((document) => document.doc_id === state.fileId);
        if (sample?.status?.includes("FAILED"))
          throw new BailianError(
            typeof sample.message === "string" ? sample.message : sample.status,
            ExitCode.GENERAL,
          );
        return sample?.status === "FINISH";
      }, options);
    }
    if (!state.agentId) {
      await begin("create-service");
      const response = await createKnowledgeService(client, workspaceId, {
        agent_name: prepared.ownership.serviceName,
        agent_scene: "search",
        agent_desc: prepared.ownership.marker,
        agent_config: { kb_search_configs: [{ id: state.indexId }] },
      });
      const agentId = agentMutationField(response, "agent_id");
      if (!agentId) throw invalidResponse();
      recordResource("service", agentId, true);
      state.agentId = agentId;
      state.phase = "service-ready";
      delete state.pending;
      await checkpoint();
    }
    const service = (await getKnowledgeService(client, workspaceId, state.agentId, "beta")).data;
    const drafts =
      service?.agent_details?.filter((detail) => detail.agent_version === "beta") ?? [];
    if (
      service?.agent_id !== state.agentId ||
      service.agent_desc !== prepared.ownership.marker ||
      service.agent_name !== prepared.ownership.serviceName ||
      service.agent_scene !== "search" ||
      drafts.length !== 1 ||
      !drafts[0]?.agent_config
    )
      throw invalidResponse();
    const completed = completeInitRetrievalConfig(
      drafts[0].agent_config,
      state.indexId,
      true,
      localize,
    );
    if (completed.changed)
      await updateKnowledgeService(client, workspaceId, {
        agent_id: state.agentId,
        agent_version: "beta",
        agent_config: completed.config,
      });
    await waitForSample(
      async () =>
        matchesInitSample(
          await searchKnowledge(client, workspaceId, {
            agent_id: state.agentId!,
            agent_version: "beta",
            query: INIT_SAMPLE.query,
          }),
        ),
      options,
    );
    state.phase = "verified";
    await checkpoint();
    return {
      indexId: state.indexId,
      agentId: state.agentId,
      fileId: state.fileId,
      agentVersion: "beta" as const,
      sampleMatched: true as const,
      resources,
      stateFile,
      timeToFirstValueMs: Date.now() - startedAt,
    };
  });
}

async function waitForSample(
  check: () => Promise<boolean>,
  options: InitRunOptions,
): Promise<void> {
  const deadline = Date.now() + options.settings.timeout * 1000;
  while (Date.now() < deadline) {
    if (await check()) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(options.pollInterval * 1000, remaining)),
    );
  }
  throw new BailianError(
    options.localize({
      "en-US":
        "Timed out waiting for the initialization sample. Created resources still exist; check their status or clean them up.",
      "zh-CN": "等待初始化样例超时。已创建的资源仍然存在，请查看其状态或清理资源。",
    }),
    ExitCode.TIMEOUT,
  );
}
