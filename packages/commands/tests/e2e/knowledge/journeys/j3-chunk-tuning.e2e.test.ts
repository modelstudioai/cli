// J3 retrieval tuning: the real effect of chunk-level exclusion on recall.
// create → chunk list locates the marker chunk → chunk update --exclude → retrieve
// asserts the exclusion flag (hard) → chunk update --include restores → retrieve
// asserts restoration (soft, index-refresh lag is tolerable).
// Semantic gotcha (verified live): the legacy retrieve endpoint does not filter
// excluded chunks; it only sets metadata.is_displayed_chunk_content to false —
// that flag is the closure signal.
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { JOURNEY_J3_ROUTES } from "../../topic-routes.ts";
import {
  cleanupKbFixture,
  createJourneyReporter,
  createKbWithDocs,
  pollUntil,
  uniqueMarker,
  type KbFixture,
} from "./journey-helpers.ts";

interface ChunkListResponse {
  data?: {
    nodes?: Array<{
      text?: string;
      metadata?: { _id?: string; doc_id?: string; content?: string };
    }>;
  };
}

interface RetrieveResponse {
  data?: {
    nodes?: Array<{
      text?: string;
      metadata?: { content?: string; is_displayed_chunk_content?: boolean };
    }>;
  };
}

/** Exclusion flag of the node containing the marker; undefined when the marker is not found */
function markerNodeDisplayFlag(stdout: string, marker: string): boolean | undefined {
  let response: RetrieveResponse;
  try {
    response = parseStdoutJson<RetrieveResponse>(stdout);
  } catch {
    return undefined;
  }
  const markedNode = (response.data?.nodes ?? []).find((node) =>
    (node.metadata?.content ?? node.text ?? "").includes(marker),
  );
  if (!markedNode) return undefined;
  return markedNode.metadata?.is_displayed_chunk_content !== false;
}

describe.skipIf(!isKbAdminE2EReady())("journey J3: 检索精修 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("chunk exclude → 排除标志生效 → include 恢复", async () => {
    const reporter = createJourneyReporter(import.meta.url);
    const marker = uniqueMarker("j3");
    const fixture: Partial<KbFixture> = {};
    try {
      // 1) Create the base and confirm the marker is recallable (baseline for judging exclude)
      const kb = await createKbWithDocs(reporter, JOURNEY_J3_ROUTES, "j3", [marker], workspaceId);
      Object.assign(fixture, kb);

      // Gotcha: retrieve is a legacy DashScope-host command and does not accept --workspace-id
      const retrieveArgs = [
        "knowledge",
        "retrieve",
        "--index-id",
        kb.indexId,
        "--query",
        marker,
        "--output",
        "json",
      ];
      const baseline = await pollUntil(
        () => reporter.runStep("retrieve baseline", JOURNEY_J3_ROUTES, retrieveArgs),
        (run) => run.exitCode === 0 && run.stdout.includes(marker),
        { timeoutMs: 180_000, intervalMs: 15_000 },
      );
      expect(baseline.satisfied, `基线未召回标记词 ${marker}`).toBe(true);

      // 2) chunk list locates the chunk containing the marker (metadata._id / doc_id feed update)
      const chunkListRun = await reporter.runStep("chunk list", JOURNEY_J3_ROUTES, [
        "knowledge",
        "chunk",
        "list",
        "--index-id",
        kb.indexId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(chunkListRun.exitCode, chunkListRun.stderr).toBe(0);
      const chunkData = parseStdoutJson<ChunkListResponse>(chunkListRun.stdout);
      const markedNode = (chunkData.data?.nodes ?? []).find((node) =>
        (node.metadata?.content ?? node.text ?? "").includes(marker),
      );
      expect(markedNode, `chunk list 中未找到含 ${marker} 的切片`).toBeTruthy();
      const chunkId = markedNode!.metadata?._id ?? "";
      const chunkDocId = markedNode!.metadata?.doc_id ?? "";
      expect(chunkId).toBeTruthy();
      expect(chunkDocId).toBeTruthy();
      reporter.recordNote(`目标 chunk=${chunkId} doc=${chunkDocId}`);

      // 3) exclude → the exclusion flag takes effect on the marker node (hard)
      const excludeRun = await reporter.runStep("chunk update --exclude", JOURNEY_J3_ROUTES, [
        "knowledge",
        "chunk",
        "update",
        "--index-id",
        kb.indexId,
        "--chunk-id",
        chunkId,
        "--doc-id",
        chunkDocId,
        "--exclude",
        "--workspace-id",
        workspaceId,
      ]);
      expect(excludeRun.exitCode, excludeRun.stderr).toBe(0);

      const excluded = await pollUntil(
        () => reporter.runStep("retrieve after exclude", JOURNEY_J3_ROUTES, retrieveArgs),
        (run) => run.exitCode === 0 && markerNodeDisplayFlag(run.stdout, marker) === false,
        { timeoutMs: 180_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`exclude 生效轮询 ${excluded.attempts} 次`);
      expect(excluded.satisfied, `exclude 后 ${marker} 所在 chunk 未标记为排除`).toBe(true);

      // 4) include restores → exclusion flag cleared (soft: index-refresh lag on the
      // restore path varies a lot; result goes to the report for manual review)
      const includeRun = await reporter.runStep("chunk update --include", JOURNEY_J3_ROUTES, [
        "knowledge",
        "chunk",
        "update",
        "--index-id",
        kb.indexId,
        "--chunk-id",
        chunkId,
        "--doc-id",
        chunkDocId,
        "--include",
        "--workspace-id",
        workspaceId,
      ]);
      expect(includeRun.exitCode, includeRun.stderr).toBe(0);

      const restored = await pollUntil(
        () => reporter.runStep("retrieve after include", JOURNEY_J3_ROUTES, retrieveArgs),
        (run) => run.exitCode === 0 && markerNodeDisplayFlag(run.stdout, marker) === true,
        { timeoutMs: 120_000, intervalMs: 15_000 },
      );
      reporter.recordSoft(
        "include 恢复后排除标志解除",
        restored.satisfied,
        `attempts=${restored.attempts} exit=${restored.value.exitCode}`,
      );
    } finally {
      await cleanupKbFixture(reporter, JOURNEY_J3_ROUTES, fixture, workspaceId);
      reporter.finalize();
    }
    // Base creation plus three polling phases — timeout sized for the worst path
  }, 900_000);
});
