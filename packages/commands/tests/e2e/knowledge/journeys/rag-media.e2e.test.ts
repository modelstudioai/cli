import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vite-plus/test";
import { isRagMediaWriteE2EReady } from "../../../../../e2e/src/gating.ts";
import { computeFileMd5 } from "../../../../src/commands/knowledge/upload-stream.ts";
import { parseStdoutJson } from "../../helpers.ts";
import { createJourneyReporter } from "./journey-helpers.ts";
import {
  acquireMediaLock,
  claimMediaParse,
  discoverMediaFile,
  validateMediaSample,
} from "./rag-media-budget.ts";

interface MediaPayload {
  name?: string;
  files?: Array<{ fileId?: string }>;
  answer?: string;
  docs?: Array<{ doc_id?: string; metadata?: { doc_id?: string } }>;
  data?: {
    pipelineId?: string;
    ingestionId?: string;
    agent_id?: string;
    sizeBytes?: number | string;
    md5?: string;
    rows?: Array<{ doc_id?: string }>;
    nodes?: Array<{ metadata?: { doc_id?: string } }>;
  };
}

const routes = {
  "knowledge doc upload": "knowledgeDocUpload",
  "knowledge doc import": "knowledgeDocImport",
  "knowledge create": "knowledgeKbCreate",
  "knowledge info": "knowledgeKbInfo",
  "knowledge delete": "knowledgeKbDelete",
  "knowledge doc status": "knowledgeDocStatus",
  "knowledge doc list": "knowledgeDocList",
  "knowledge chunk list": "knowledgeChunkList",
  "knowledge file get": "knowledgeFileGet",
  "knowledge file list": "knowledgeFileList",
  "knowledge file delete": "knowledgeFileDelete",
  "knowledge category list": "knowledgeCategoryList",
  "knowledge service create": "knowledgeServiceCreate",
  "knowledge service delete": "knowledgeServiceDelete",
  "knowledge search": "knowledgeSearch",
  "knowledge chat": "knowledgeChat",
};

test.skipIf(!isRagMediaWriteE2EReady())(
  "RAG media: one sample, one parsing task, shared read assertions",
  async () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
    const source = process.env.BAILIAN_E2E_RAG_MEDIA_FILE!;
    validateMediaSample(source);
    const workspaceKey = createHash("sha256").update(workspaceId).digest("hex").slice(0, 20);
    const runKey = createHash("sha256")
      .update(process.env.BAILIAN_E2E_RAG_MEDIA_RUN_ID!)
      .digest("hex")
      .slice(0, 20);
    const root = join(tmpdir(), "bailian-rag-media-tests");
    mkdirSync(root, { recursive: true });
    const release = acquireMediaLock(join(root, `${workspaceKey}.lock`));
    const runDirectory = join(root, `${workspaceKey}-${runKey}`);
    const reporter = createJourneyReporter(import.meta.url);
    let indexId: string | undefined, fileId: string | undefined, ingestionId: string | undefined;
    let ownsIndex = false,
      ownsFile = false,
      terminal = false;
    const serviceIds: string[] = [];
    async function query(args: string[]): Promise<MediaPayload> {
      const result = await reporter.runStep(args.slice(0, 3).join(" "), routes, [
        ...args,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(0);
      return parseStdoutJson<MediaPayload>(result.stdout);
    }
    try {
      if (existsSync(join(runDirectory, "parse-claimed.json")))
        throw new Error(
          `This run already spent its parsing budget. Inspect ${runDirectory} and query the original job; do not resubmit.`,
        );
      if (process.env.BAILIAN_E2E_RAG_MEDIA_PATH === "upload") {
        // Claim before any upload too: a lost response must not cause another media registration.
        claimMediaParse(runDirectory, { path: "upload", sourceName: basename(source) });
        const uploaded = await query([
          "knowledge",
          "doc",
          "upload",
          "--file",
          source,
          "--parser",
          "DOCMIND_LLM_VERSION_MEDIA",
        ]);
        fileId = uploaded.files?.[0]?.fileId;
        expect(typeof fileId).toBe("string");
        ownsFile = true;
        reporter.trackResource("file", fileId!);
        const created = await query([
          "knowledge",
          "create",
          "--name",
          `e2e-media-${Date.now() % 100000000}`,
          "--description",
          "isolated media journey",
          "--doc-id",
          fileId!,
          "--knowledge-type",
          "multimedia",
          ...(process.env.BAILIAN_E2E_RAG_MEDIA_EMBEDDING
            ? ["--multimodal-embedding-model", process.env.BAILIAN_E2E_RAG_MEDIA_EMBEDDING]
            : []),
        ]);
        indexId = created.data?.pipelineId;
        ingestionId = created.data?.ingestionId;
        ownsIndex = true;
        if (indexId) reporter.trackResource("index", indexId);
      } else {
        const collectionId = process.env.BAILIAN_E2E_RAG_MEDIA_COLLECTION_ID;
        indexId = process.env.BAILIAN_E2E_RAG_MEDIA_INDEX_ID;
        if (!collectionId || !indexId)
          throw new Error("existing-file requires a dedicated test collection and test index.");
        const info = await query(["knowledge", "info", "--index-id", indexId]);
        if (typeof info.name !== "string" || !info.name.startsWith("e2e-media-"))
          throw new Error("Existing target must be an e2e-media- test knowledge base.");
        fileId = await discoverMediaFile(query, collectionId, basename(source));
        const file = await query(["knowledge", "file", "get", "--file-id", fileId]);
        const checksum = await computeFileMd5(source);
        expect(Number(file.data?.sizeBytes)).toBe(statSync(source).size);
        expect([checksum, Buffer.from(checksum, "base64").toString("hex")]).toContain(
          file.data?.md5,
        );
        claimMediaParse(runDirectory, { path: "existing-file", indexId, fileId });
        const imported = await query([
          "knowledge",
          "doc",
          "import",
          "--index-id",
          indexId,
          "--doc-id",
          fileId,
        ]);
        ingestionId = imported.data?.ingestionId;
      }
      expect(typeof indexId).toBe("string");
      expect(typeof ingestionId).toBe("string");
      writeFileSync(
        join(runDirectory, "resources.json"),
        JSON.stringify({
          indexId,
          fileId,
          ingestionId,
          ownsIndex,
          ownsFile,
          report: reporter.outputDir,
        }),
      );
      await query([
        "knowledge",
        "doc",
        "status",
        "--index-id",
        indexId!,
        "--job-id",
        ingestionId!,
        "--wait",
        "--poll-interval",
        "15",
        "--timeout",
        "600",
      ]);
      terminal = true;
      await query(["knowledge", "file", "get", "--file-id", fileId!]);
      const details = await query([
        "knowledge",
        "doc",
        "list",
        "--index-id",
        indexId!,
        "--details",
      ]);
      expect(details.data?.rows?.some((row: { doc_id?: string }) => row.doc_id === fileId)).toBe(
        true,
      );
      const chunks = await query([
        "knowledge",
        "chunk",
        "list",
        "--index-id",
        indexId!,
        "--doc-id",
        fileId!,
      ]);
      expect(chunks.data?.nodes?.length).toBeGreaterThan(0);
      const configPath = join(reporter.outputDir, "agent-config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          kb_search_configs: [
            {
              id: indexId,
              dense_similarity_top_k: 50,
              sparse_similarity_top_k: 50,
              rerank_top_n: 5,
              rerank_min_score: 0.2,
              rerank: { model_name: "qwen3-vl-rerank", rerank_mode: "similar" },
            },
          ],
          hybrid_rerank: { model_name: "qwen3-vl-rerank", rerank_mode: "similar" },
          rerank_top_n: 5,
        }),
      );
      for (const scene of ["search", "chat"]) {
        const service = await query([
          "knowledge",
          "service",
          "create",
          "--name",
          `e2e-media-${scene}-${Date.now()}`,
          "--scene",
          scene,
          "--config-file",
          configPath,
        ]);
        const agentId = service.data?.agent_id;
        expect(typeof agentId).toBe("string");
        if (!agentId) throw new Error("Service response missing agent ID.");
        serviceIds.push(agentId);
        reporter.trackResource("service", agentId);
        const response = await query([
          "knowledge",
          scene,
          scene === "search" ? "--query" : "--message",
          process.env.BAILIAN_E2E_RAG_MEDIA_QUERY ?? "概述这个音视频的内容",
          "--agent-id",
          agentId,
          "--agent-version",
          "beta",
        ]);
        if (scene === "search")
          expect(
            response.data?.nodes?.some(
              (node: { metadata?: { doc_id?: string } }) => node.metadata?.doc_id === fileId,
            ),
          ).toBe(true);
        else {
          expect(response.answer?.length).toBeGreaterThan(0);
          expect(
            response.docs?.some(
              (doc: { doc_id?: string; metadata?: { doc_id?: string } }) =>
                (doc.metadata?.doc_id ?? doc.doc_id) === fileId,
            ),
          ).toBe(true);
        }
      }
    } finally {
      try {
        for (const agentId of serviceIds) {
          const result = await reporter.runStep("cleanup service", routes, [
            "knowledge",
            "service",
            "delete",
            "--agent-id",
            agentId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ]);
          if (result.exitCode === 0) reporter.markCleaned(agentId);
        }
        // Unknown or running jobs are retained for inspection, not deleted and recreated on retry.
        if (terminal && ownsIndex && indexId) {
          const result = await reporter.runStep("cleanup index", routes, [
            "knowledge",
            "delete",
            "--index-id",
            indexId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ]);
          if (result.exitCode === 0) reporter.markCleaned(indexId);
        }
        if (
          terminal &&
          ownsFile &&
          fileId &&
          (!indexId || !reporter.uncleanedResources().some((resource) => resource.id === indexId))
        ) {
          const result = await reporter.runStep("cleanup file", routes, [
            "knowledge",
            "file",
            "delete",
            "--file-id",
            fileId,
            "--yes",
            "--workspace-id",
            workspaceId,
          ]);
          if (result.exitCode === 0) reporter.markCleaned(fileId);
        }
      } finally {
        try {
          reporter.finalize();
        } finally {
          release();
        }
      }
    }
  },
  720_000,
);
