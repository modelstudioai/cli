// J4 service tuning: draft (beta) usable → config change persisted → released version usable after deploy.
// create + service create (search, initial draft/beta) → search --agent-version beta recalls (hard)
// → service update --description → service get asserts the change (hard) → deploy → released search recalls (hard).
import { describe, expect, test } from "vite-plus/test";
import { isKbAdminE2EReady, parseStdoutJson } from "../../helpers.ts";
import { JOURNEY_J4_ROUTES } from "../../topic-routes.ts";
import {
  cleanupKbFixture,
  createJourneyReporter,
  createKbWithDocs,
  patchSearchServiceRetrievalConfig,
  pollUntil,
  uniqueMarker,
  type KbFixture,
} from "./journey-helpers.ts";

describe.skipIf(!isKbAdminE2EReady())("journey J4: 问答服务调优 (live, 自清理)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("draft 可用 → update 落库 → deploy → 正式版可用", async () => {
    const reporter = createJourneyReporter(import.meta.url);
    const marker = uniqueMarker("j4");
    const fixture: Partial<KbFixture> = {};
    let agentId = "";
    try {
      // 1) Create the base + a retrieval service bound to it (initial draft/beta)
      const kb = await createKbWithDocs(reporter, JOURNEY_J4_ROUTES, "j4", [marker], workspaceId);
      Object.assign(fixture, kb);

      const createServiceRun = await reporter.runStep(
        "service create (search)",
        JOURNEY_J4_ROUTES,
        [
          "knowledge",
          "service",
          "create",
          "--name",
          `e2e-j4-${Date.now() % 100000000}`,
          "--scene",
          "search",
          "--index-id",
          kb.indexId,
          "--workspace-id",
          workspaceId,
          "--quiet",
        ],
      );
      expect(createServiceRun.exitCode, createServiceRun.stderr).toBe(0);
      agentId = createServiceRun.stdout.trim().split("\n").pop()!;
      expect(agentId).toMatch(/^aid-/);
      reporter.trackResource("service", agentId);

      // Server gotcha: a minimally created search service is missing required
      // retrieval parameters — backfill before calling (see journey-helpers)
      await patchSearchServiceRetrievalConfig(reporter, JOURNEY_J4_ROUTES, agentId, workspaceId);

      // 2) Draft search recalls (hard, polling to absorb index/service propagation lag)
      const betaSearchArgs = [
        "knowledge",
        "search",
        "--query",
        marker,
        "--agent-id",
        agentId,
        "--agent-version",
        "beta",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ];
      const betaPoll = await pollUntil(
        () => reporter.runStep("search (beta)", JOURNEY_J4_ROUTES, betaSearchArgs),
        (run) => run.exitCode === 0 && run.stdout.includes(marker),
        { timeoutMs: 180_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`beta search 轮询 ${betaPoll.attempts} 次`);
      expect(betaPoll.satisfied, `search(beta) 未召回标记词 ${marker}`).toBe(true);

      // 3) update the description (top-level scalar, valid for the search scene too) → get asserts persistence (hard)
      const newDescription = `journey j4 tuned at ${Date.now()}`;
      const updateRun = await reporter.runStep("service update --description", JOURNEY_J4_ROUTES, [
        "knowledge",
        "service",
        "update",
        "--agent-id",
        agentId,
        "--description",
        newDescription,
        "--workspace-id",
        workspaceId,
      ]);
      expect(updateRun.exitCode, updateRun.stderr).toBe(0);

      const getRun = await reporter.runStep("service get (beta)", JOURNEY_J4_ROUTES, [
        "knowledge",
        "service",
        "get",
        "--agent-id",
        agentId,
        "--agent-version",
        "beta",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(getRun.exitCode, getRun.stderr).toBe(0);
      const getData = parseStdoutJson<{ data?: { agent_desc?: string } }>(getRun.stdout);
      expect(getData.data?.agent_desc).toBe(newDescription);

      // 4) deploy → released search (without --agent-version) recalls (hard)
      const deployRun = await reporter.runStep("service deploy", JOURNEY_J4_ROUTES, [
        "knowledge",
        "service",
        "deploy",
        "--agent-id",
        agentId,
        "--yes",
        "--workspace-id",
        workspaceId,
        "--quiet",
      ]);
      expect(deployRun.exitCode, deployRun.stderr).toBe(0);
      reporter.recordNote(`deploy 版本号: ${deployRun.stdout.trim().split("\n").pop() ?? "?"}`);

      const releasedPoll = await pollUntil(
        () =>
          reporter.runStep("search (released)", JOURNEY_J4_ROUTES, [
            "knowledge",
            "search",
            "--query",
            marker,
            "--agent-id",
            agentId,
            "--workspace-id",
            workspaceId,
            "--output",
            "json",
          ]),
        (run) => run.exitCode === 0 && run.stdout.includes(marker),
        { timeoutMs: 120_000, intervalMs: 15_000 },
      );
      reporter.recordNote(`正式版 search 轮询 ${releasedPoll.attempts} 次`);
      expect(releasedPoll.satisfied, `发布后正式版 search 未召回 ${marker}`).toBe(true);
    } finally {
      if (agentId) {
        const deleteRun = await reporter.runStep("cleanup: service delete", JOURNEY_J4_ROUTES, [
          "knowledge",
          "service",
          "delete",
          "--agent-id",
          agentId,
          "--yes",
          "--workspace-id",
          workspaceId,
        ]);
        if (deleteRun.exitCode === 0) reporter.markCleaned(agentId);
      }
      await cleanupKbFixture(reporter, JOURNEY_J4_ROUTES, fixture, workspaceId);
      reporter.finalize();
    }
    // Base creation plus two polling phases plus deploy — timeout sized for the worst path
  }, 900_000);
});
