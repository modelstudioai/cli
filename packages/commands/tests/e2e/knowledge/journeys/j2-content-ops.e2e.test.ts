// J2 content operations: routine document add/remove and the visibility loop.
// create (doc1+doc2) → doc list/status checks → doc tag → retrieve hits both markers
// → doc delete doc2 → retrieve verifies markerB is gone and markerA remains.
// Note: there is no "append documents to an existing base" command (kb update takes
// no doc-id), so incremental semantics are expressed as a two-document create + deleting one.
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { JOURNEY_J2_ROUTES } from "../../topic-routes.ts";
import {
  cleanupKbFixture,
  createJourneyReporter,
  createKbWithDocs,
  nodesRecallMarker,
  pollUntil,
  uniqueMarker,
  type KbFixture,
} from "./journey-helpers.ts";

describe.skipIf(!isKbAdminE2EReady())("journey J2: 内容运维 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("建库(双文档) → list/status/tag → 删除其一 → 召回可见性闭环", async () => {
    const reporter = createJourneyReporter(import.meta.url);
    const markerA = uniqueMarker("j2a");
    const markerB = uniqueMarker("j2b");
    const fixture: Partial<KbFixture> = {};
    try {
      // 1) Create the base with two documents
      const kb = await createKbWithDocs(
        reporter,
        JOURNEY_J2_ROUTES,
        "j2",
        [markerA, markerB],
        workspaceId,
      );
      Object.assign(fixture, kb);
      const [fileIdA, fileIdB] = kb.fileIds as [string, string];

      // 2) doc list contains both documents (hard); doc status terminal state COMPLETED (hard)
      const docListRun = await reporter.runStep("doc list", JOURNEY_J2_ROUTES, [
        "knowledge",
        "doc",
        "list",
        "--index-id",
        kb.indexId,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(docListRun.exitCode, docListRun.stderr).toBe(0);
      const listedDocIds = docListRun.stdout.trim().split("\n");
      expect(listedDocIds).toContain(fileIdA);
      expect(listedDocIds).toContain(fileIdB);

      const docStatusRun = await reporter.runStep("doc status", JOURNEY_J2_ROUTES, [
        "knowledge",
        "doc",
        "status",
        "--index-id",
        kb.indexId,
        "--job-id",
        kb.jobId,
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(docStatusRun.exitCode, docStatusRun.stderr).toBe(0);
      expect(docStatusRun.stdout.trim()).toBe("COMPLETED");

      // 2.5) knowledge stats — monitor endpoint returns valid structure (hard)
      const statsRun = await reporter.runStep("kb stats", JOURNEY_J2_ROUTES, [
        "knowledge",
        "stats",
        "--index-id",
        kb.indexId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(statsRun.exitCode, statsRun.stderr).toBe(0);
      const statsData = parseStdoutJson<{
        data?: {
          storageMonitorData?: { indexStorageLimit?: number };
          qpsMonitorData?: { monitorData?: unknown[] };
        };
      }>(statsRun.stdout);
      expect(typeof statsData.data?.storageMonitorData?.indexStorageLimit).toBe("number");
      expect(Array.isArray(statsData.data?.qpsMonitorData?.monitorData)).toBe(true);
      reporter.recordNote(
        `storage limit=${statsData.data?.storageMonitorData?.indexStorageLimit} qps windows=${statsData.data?.qpsMonitorData?.monitorData?.length ?? 0}`,
      );

      // 3) doc tag on doc2 (tagging succeeds: hard; tag read-back: soft — server-side
      // display lag or the API not echoing tags are both tolerable)
      const tagValue = `e2e-j2-${Date.now() % 100000000}`;
      const docTagRun = await reporter.runStep("doc tag doc2", JOURNEY_J2_ROUTES, [
        "knowledge",
        "doc",
        "tag",
        "--doc-id",
        fileIdB,
        "--tag",
        tagValue,
        "--workspace-id",
        workspaceId,
      ]);
      expect(docTagRun.exitCode, docTagRun.stderr).toBe(0);
      const tagReadbackRun = await reporter.runStep("doc list (tag readback)", JOURNEY_J2_ROUTES, [
        "knowledge",
        "doc",
        "list",
        "--index-id",
        kb.indexId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      reporter.recordSoft(
        "doc list 回读可见新标签",
        tagReadbackRun.exitCode === 0 && tagReadbackRun.stdout.includes(tagValue),
        `tag=${tagValue} exit=${tagReadbackRun.exitCode}`,
      );

      // 4) retrieve hits both markers (hard, polling to absorb indexing lag)
      // Gotcha: retrieve is a legacy DashScope-host command and does not accept --workspace-id
      const retrieveMarker = (marker: string, stepName: string) =>
        pollUntil(
          () =>
            reporter.runStep(stepName, JOURNEY_J2_ROUTES, [
              "knowledge",
              "retrieve",
              "--index-id",
              kb.indexId,
              "--query",
              marker,
              "--output",
              "json",
            ]),
          (run) => run.exitCode === 0 && nodesRecallMarker(run.stdout, marker),
          { timeoutMs: 180_000, intervalMs: 15_000 },
        );
      const pollA = await retrieveMarker(markerA, "retrieve markerA");
      expect(pollA.satisfied, `retrieve 未召回 ${markerA}`).toBe(true);
      const pollB = await retrieveMarker(markerB, "retrieve markerB");
      expect(pollB.satisfied, `retrieve 未召回 ${markerB}`).toBe(true);

      // 5) Delete doc2 → markerB no longer recalled while markerA remains (hard)
      const docDeleteRun = await reporter.runStep("doc delete doc2", JOURNEY_J2_ROUTES, [
        "knowledge",
        "doc",
        "delete",
        "--index-id",
        kb.indexId,
        "--doc-id",
        fileIdB,
        "--yes",
        "--workspace-id",
        workspaceId,
      ]);
      expect(docDeleteRun.exitCode, docDeleteRun.stderr).toBe(0);

      const goneB = await pollUntil(
        () =>
          reporter.runStep("retrieve markerB (expect miss)", JOURNEY_J2_ROUTES, [
            "knowledge",
            "retrieve",
            "--index-id",
            kb.indexId,
            "--query",
            markerB,
            "--output",
            "json",
          ]),
        (run) => run.exitCode === 0 && !run.stdout.includes(markerB),
        { timeoutMs: 180_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`doc delete 后 markerB 消失轮询 ${goneB.attempts} 次`);
      expect(goneB.satisfied, `doc delete 后 ${markerB} 仍可召回`).toBe(true);

      const stillA = await reporter.runStep("retrieve markerA (still hit)", JOURNEY_J2_ROUTES, [
        "knowledge",
        "retrieve",
        "--index-id",
        kb.indexId,
        "--query",
        markerA,
        "--output",
        "json",
      ]);
      expect(stillA.exitCode, stillA.stderr).toBe(0);
      expect(
        nodesRecallMarker(stillA.stdout, markerA),
        `doc delete 误伤: ${markerA} 不再召回`,
      ).toBe(true);
    } finally {
      await cleanupKbFixture(reporter, JOURNEY_J2_ROUTES, fixture, workspaceId);
      reporter.finalize();
    }
    // Base creation plus several polling phases — timeout sized for the worst path
  }, 900_000);
});
